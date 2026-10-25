// tests/rate-limit.test.js - the limits on login, signup and on all of /api.
// The limits are ON in this file. The tests run one after the other and share the counters.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, send } = require('./helpers');

describe('rate limits', () => {
  let site;
  let sent = 0;

  // Sends a request to /api and counts it (every /api request counts for the big limit).
  async function hit(path, method) {
    sent = sent + 1;
    return send(site.baseUrl, path, method);
  }

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('the 11th login attempt is refused with 429 and a clear message', async () => {
    for (let i = 1; i <= 10; i++) {
      const reply = await hit('/api/v1/users/login', 'POST');
      assert.equal(reply.status, 400, 'attempt ' + i + ' should reach the login route');
      if (i === 1) {
        assert.ok(reply.headers.get('ratelimit'), 'the RateLimit header is missing');
      }
    }

    const refused = await hit('/api/v1/users/login', 'POST');
    assert.equal(refused.status, 429);
    assert.equal(refused.json.message, 'Too many login or signup attempts from this IP. Please try again in 15 minutes');
    assert.ok(Number(refused.headers.get('retry-after')) > 0, 'the Retry-After header is missing');
  });

  it('signup shares the same counter as login', async () => {
    const reply = await hit('/api/v1/users/signup', 'POST');
    assert.equal(reply.status, 429);
  });

  it('all /api requests together are limited to 300', async () => {
    // Keep asking for a page that does not exist until the first 429. Every request counts.
    let firstRefused = 0;
    while (firstRefused === 0 && sent < 400) {
      const reply = await hit('/api/v1/nothing-here', 'GET');
      if (reply.status === 429) {
        firstRefused = sent;
        assert.equal(reply.json.message, 'Too many requests from this IP. Please try again in a few minutes');
      }
    }
    assert.ok(firstRefused > 0, 'the limit never came');
    // The requests before the first 429 were the allowed ones: exactly 300.
    assert.equal(firstRefused - 1, 300);
  });

  it('pages outside /api are not limited', async () => {
    const reply = await send(site.baseUrl, '/', 'GET');
    assert.equal(reply.status, 200);
  });
});