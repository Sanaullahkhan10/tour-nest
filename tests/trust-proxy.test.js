// tests/trust-proxy.test.js - with one trusted proxy, the rate limit counts the address
// the proxy added (the LAST one in X-Forwarded-For). A faked first address does not help.
process.env.TRUST_PROXY_HOPS = '1';
delete process.env.DISABLE_RATE_LIMIT;
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const { startApp, send } = require('./helpers');

describe('trust proxy', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('trust proxy is 1 when TRUST_PROXY_HOPS is 1', () => {
    assert.equal(app.get('trust proxy'), 1);
  });

  it('a faked first address does not give a visitor a fresh counter', async () => {
    // Ten attempts, each with a different faked first address, all from the proxy-added 1.1.1.1.
    for (let i = 1; i <= 10; i++) {
      const reply = await send(site.baseUrl, '/api/v1/users/login', 'POST', undefined, { 'X-Forwarded-For': '10.0.0.' + i + ', 1.1.1.1' });
      assert.equal(reply.status, 400, 'attempt ' + i + ' should reach the login route');
    }
    const refused = await send(site.baseUrl, '/api/v1/users/login', 'POST', undefined, { 'X-Forwarded-For': '10.0.0.99, 1.1.1.1' });
    assert.equal(refused.status, 429);
  });

  it('another real visitor has their own counter', async () => {
    const reply = await send(site.baseUrl, '/api/v1/users/login', 'POST', undefined, { 'X-Forwarded-For': '2.2.2.2' });
    assert.equal(reply.status, 400);
  });
});