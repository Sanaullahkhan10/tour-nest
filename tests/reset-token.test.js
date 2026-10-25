// tests/reset-token.test.js - the secret link of "forgot password": the token, its hash, its shape.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { hashToken, makeResetToken, looksLikeToken, lastLinkIsTooNew, lifetimeMinutes } = require('../utils/resetToken');

describe('makeResetToken', () => {
  it('gives a 64 character token, its hash, and an end time 10 minutes away', () => {
    const before = Date.now();
    const reset = makeResetToken();
    assert.ok(looksLikeToken(reset.token));
    assert.equal(reset.hash, hashToken(reset.token));
    assert.notEqual(reset.hash, reset.token);
    assert.equal(reset.hash.length, 64);
    assert.ok(reset.expires instanceof Date);
    const minutes = (reset.expires.getTime() - before) / 60000;
    assert.ok(minutes > 9.9 && minutes < 10.1, 'the link should work for about 10 minutes, not ' + minutes);
    assert.equal(lifetimeMinutes, 10);
  });

  it('never gives the same token twice', () => {
    assert.notEqual(makeResetToken().token, makeResetToken().token);
  });
});

describe('looksLikeToken', () => {
  it('accepts exactly 64 characters from 0-9 and a-f', () => {
    assert.equal(looksLikeToken('a'.repeat(64)), true);
    assert.equal(looksLikeToken('0123456789abcdef'.repeat(4)), true);
  });

  it('refuses everything else', () => {
    assert.equal(looksLikeToken('a'.repeat(63)), false);
    assert.equal(looksLikeToken('a'.repeat(65)), false);
    assert.equal(looksLikeToken('A'.repeat(64)), false);
    assert.equal(looksLikeToken('g'.repeat(64)), false);
    assert.equal(looksLikeToken('a'.repeat(63) + '\n'), false);
    assert.equal(looksLikeToken(''), false);
    assert.equal(looksLikeToken(undefined), false);
    assert.equal(looksLikeToken(null), false);
    assert.equal(looksLikeToken({ $gt: '' }), false);
    assert.equal(looksLikeToken(['a'.repeat(64)]), false);
  });
});

describe('lastLinkIsTooNew', () => {
  it('is true when the last link was made less than a minute ago', () => {
    assert.equal(lastLinkIsTooNew(new Date(Date.now() + 9.5 * 60000)), true);
  });

  it('is false for an older link, an old end time, or no link at all', () => {
    assert.equal(lastLinkIsTooNew(new Date(Date.now() + 5 * 60000)), false);
    assert.equal(lastLinkIsTooNew(new Date(Date.now() - 60000)), false);
    assert.equal(lastLinkIsTooNew(undefined), false);
    assert.equal(lastLinkIsTooNew(null), false);
    assert.equal(lastLinkIsTooNew('2099-01-01'), false);
  });
});
