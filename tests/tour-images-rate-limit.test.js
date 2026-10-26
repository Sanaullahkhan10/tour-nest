// tests/tour-images-rate-limit.test.js - tour picture uploads share the limit of photo uploads (20 an hour for one IP).
// The limit is on in this file (the other test files switch it off).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

describe('the limit on tour picture uploads', () => {
  let site;
  before(async () => {
    delete process.env.DISABLE_RATE_LIMIT;
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('refuses the 21st upload with 429', async () => {
    const address = site.baseUrl + '/api/v1/tours/64b7f0c2a1b2c3d4e5f60001/images';
    for (let i = 1; i <= 20; i++) {
      const reply = await fetch(address, { method: 'PATCH' });
      assert.equal(reply.status, 401, 'attempt ' + i + ' should reach the login guard');
    }
    assert.equal((await fetch(address, { method: 'PATCH' })).status, 429);
  });
});
