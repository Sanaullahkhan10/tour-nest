// tests/body-guard.test.js - the size limit and the guard against operator field names.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, send } = require('./helpers');

const loginPath = '/api/v1/users/login';
const operatorMessage = 'Field names cannot start with $, contain a dot, or be __proto__';

describe('request bodies', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  // The login route answers "Please give your email and password" when the body has no email.
  // We use it to see that a body got through to the route.
  it('a body under 10 kb is read', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', JSON.stringify({ padding: 'a'.repeat(9000) }));
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'Please give your email and password');
  });

  it('a body over 10 kb gets 413 and a clear message', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', JSON.stringify({ padding: 'a'.repeat(11000) }));
    assert.equal(reply.status, 413);
    assert.equal(reply.json.message, 'The request body is too big (the limit is 10 kb)');
  });

  it('a body that is not valid JSON gets 400 and a clear message', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"email": ');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'The request body is not valid JSON');
  });

  it('a MongoDB operator as a field name is refused', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"email":{"$gt":""},"password":"x"}');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, operatorMessage);
  });

  it('an operator hidden inside a list is refused', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"a":[{"b":{"$ne":1}}]}');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, operatorMessage);
  });

  it('a field name with a dot is refused', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"a.b":1}');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, operatorMessage);
  });

  it('a field named __proto__ is refused', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"__proto__":{"admin":true}}');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, operatorMessage);
  });

  it('a body nested too deeply is refused', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '['.repeat(30) + ']'.repeat(30));
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'The request body is nested too deeply');
  });

  it('a $ or a dot inside a VALUE is fine', async () => {
    const reply = await send(site.baseUrl, loginPath, 'POST', '{"password":"p$ss.word"}');
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'Please give your email and password');
  });
});