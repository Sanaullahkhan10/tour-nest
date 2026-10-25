// tests/photo-rate-limit.test.js - photo uploads are limited to 20 an hour for one IP address.
// The limit is on in this file (the other test files switch it off).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

describe('the limit on photo uploads', () => {
  let site;

  before(async () => {
    delete process.env.DISABLE_RATE_LIMIT;
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('refuses the 21st upload with 429', async () => {
    for (let i = 1; i <= 20; i++) {
      const reply = await fetch(site.baseUrl + '/api/v1/users/updateMyPhoto', { method: 'PATCH' });
      assert.equal(reply.status, 401, 'attempt ' + i + ' should reach the login guard');
    }
    const refused = await fetch(site.baseUrl + '/api/v1/users/updateMyPhoto', { method: 'PATCH' });
    assert.equal(refused.status, 429);
    assert.equal((await refused.json()).message, 'Too many photo uploads from this IP. Please try again later');
  });

  it('does not limit removing the photo with the same counter', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/users/deleteMyPhoto', { method: 'DELETE' });
    assert.equal(reply.status, 401);
  });
});
