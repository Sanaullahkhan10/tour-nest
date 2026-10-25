// tests/reset-rate-limit.test.js - "forgot password" and "reset password" use the same limit as login and signup.
// The limit is on in this file (the other test files switch it off).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, send } = require('./helpers');

describe('the limit on forgot password and reset password', () => {
  let site;

  before(async () => {
    delete process.env.DISABLE_RATE_LIMIT;
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('refuses the 11th request with 429, and the two routes share one counter', async () => {
    for (let i = 1; i <= 10; i++) {
      const reply = await send(site.baseUrl, '/api/v1/users/forgotPassword', 'POST', '{}');
      assert.equal(reply.status, 400, 'attempt ' + i + ' should reach the route');
    }
    const refused = await send(site.baseUrl, '/api/v1/users/forgotPassword', 'POST', '{}');
    assert.equal(refused.status, 429);

    const resetRefused = await send(site.baseUrl, '/api/v1/users/resetPassword/' + 'a'.repeat(64), 'PATCH', '{}');
    assert.equal(resetRefused.status, 429);
  });
});
