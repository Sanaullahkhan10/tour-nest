// tests/health.test.js - the /health check, and the proxy setting when it is not set.
process.env.DISABLE_RATE_LIMIT = 'true';
delete process.env.TRUST_PROXY_HOPS;
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const { startApp, send } = require('./helpers');

describe('health check', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  // These tests never connect to the database, so /health must say "not connected".
  it('/health answers 503 when there is no database connection', async () => {
    const reply = await send(site.baseUrl, '/health', 'GET');
    assert.equal(reply.status, 503);
    assert.deepEqual(reply.json, { status: 'unavailable', database: 'not connected' });
  });

  it('trust proxy is off when TRUST_PROXY_HOPS is not set', () => {
    assert.equal(app.get('trust proxy'), false);
  });
});