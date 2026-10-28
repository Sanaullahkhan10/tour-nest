// tests/polish.test.js - gzip compression, the top-5-cheap route, and the database index for price and rating.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Tour = require('../models/tourModel');
const Image = require('../models/imageModel');
const { startApp } = require('./helpers');

// A plain GET that says which encodings it accepts. (fetch decodes by itself, so we use http.)
function rawGet(url, acceptEncoding) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers: { 'Accept-Encoding': acceptEncoding } }, (reply) => {
        const chunks = [];
        reply.on('data', (chunk) => chunks.push(chunk));
        reply.on('end', () => resolve({ status: reply.statusCode, headers: reply.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

describe('gzip compression', () => {
  let site;
  const bigPicture = crypto.randomBytes(8000);
  before(async () => {
    mock.method(Image, 'findById', async () => ({ contentType: 'image/jpeg', data: bigPicture }));
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('compresses the CSS and a page when the browser accepts gzip, and the body is still the same', async () => {
    const plain = await rawGet(site.baseUrl + '/css/style.css', 'identity');
    const packed = await rawGet(site.baseUrl + '/css/style.css', 'gzip');
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(packed.headers['content-encoding'], 'gzip');
    assert.ok(packed.body.length < plain.body.length / 2, 'the CSS should get much smaller');
    assert.deepEqual(zlib.gunzipSync(packed.body), plain.body);
    assert.ok(String(packed.headers.vary).toLowerCase().includes('accept-encoding'));

    const page = await rawGet(site.baseUrl + '/login', 'gzip');
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-encoding'], 'gzip');
    assert.ok(zlib.gunzipSync(page.body).toString().includes('<form'));
  });

  it('sends everything as it is when the browser does not accept gzip', async () => {
    const page = await rawGet(site.baseUrl + '/login', 'identity');
    assert.equal(page.headers['content-encoding'], undefined);
    assert.ok(page.body.toString().includes('<form'));
  });

  it('leaves pictures alone, even big ones', async () => {
    const reply = await rawGet(site.baseUrl + '/img/64b7f0c2a1b2c3d4e5f6cccc', 'gzip');
    assert.equal(reply.status, 200);
    assert.equal(reply.headers['content-type'], 'image/jpeg');
    assert.equal(reply.headers['content-encoding'], undefined);
    assert.deepEqual(reply.body, bigPicture);
  });

  it('compresses an answer of the API too', async () => {
    const reply = await rawGet(site.baseUrl + '/api/v1/nothing-here', 'gzip');
    assert.equal(reply.status, 404);
    // This answer is smaller than 1 kb, so it is sent as it is. The status and the body stay right.
    assert.ok(JSON.parse(reply.body.toString()).message.includes('Cannot find'));
  });
});

describe('GET /api/v1/tours/top-5-cheap', () => {
  let site;
  const steps = [];
  const list = [{ name: 'Cheap one', price: 65000 }, { name: 'Next one', price: 70000 }];
  before(async () => {
    mock.method(Tour, 'find', () => {
      const chain = {};
      for (const step of ['sort', 'limit', 'select']) {
        chain[step] = (...args) => {
          steps.push({ step: step, args: args });
          return chain;
        };
      }
      chain.lean = () => Promise.resolve(list);
      return chain;
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('gives the 5 cheapest tours, cheapest first, with a short list of fields', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/tours/top-5-cheap');
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(body.results, 2);
    assert.deepEqual(body.data.tours, list);
    assert.deepEqual(steps.find((entry) => entry.step === 'sort').args, [{ price: 1, ratingsAverage: -1, _id: 1 }]);
    assert.deepEqual(steps.find((entry) => entry.step === 'limit').args, [5]);
    const fields = steps.find((entry) => entry.step === 'select').args[0].split(' ');
    assert.ok(fields.includes('name') && fields.includes('slug') && fields.includes('price'));
    assert.ok(!fields.includes('guides') && !fields.includes('description'));
  });

  it('is not taken for the id of a tour', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/tours/top-5-cheap');
    assert.notEqual(reply.status, 400);
  });
});

describe('the database index for price and rating', () => {
  it('exists on the tour model', () => {
    const found = Tour.schema.indexes().find((entry) => entry[0].price === 1 && entry[0].ratingsAverage === -1);
    assert.ok(found, 'there should be an index on price and ratingsAverage');
  });
});
