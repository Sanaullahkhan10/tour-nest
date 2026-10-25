// tests/helmet.test.js - helmet adds the safe headers to every answer.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, send } = require('./helpers');

// Checks the headers that must be on every answer.
function assertSafeHeaders(reply) {
  assert.equal(reply.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(reply.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(reply.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(reply.headers.get('strict-transport-security'), 'strict-transport-security is missing');
  assert.ok(reply.headers.get('content-security-policy').includes("default-src 'self'"), 'content-security-policy is missing');
  assert.equal(reply.headers.get('x-powered-by'), null, 'x-powered-by is still sent');
}

describe('helmet headers', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('the home page has the safe headers and no x-powered-by', async () => {
    const reply = await send(site.baseUrl, '/', 'GET');
    assert.equal(reply.status, 200);
    assertSafeHeaders(reply);
  });

  it('a 404 answer has them too', async () => {
    const reply = await send(site.baseUrl, '/nothing-here', 'GET');
    assert.equal(reply.status, 404);
    assertSafeHeaders(reply);
  });

  it('a 400 answer from the API has them too', async () => {
    const reply = await send(site.baseUrl, '/api/v1/users/login', 'POST');
    assert.equal(reply.status, 400);
    assertSafeHeaders(reply);
  });
});