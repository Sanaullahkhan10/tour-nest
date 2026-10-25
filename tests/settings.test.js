// tests/settings.test.js - reading the TRUST_PROXY_HOPS setting.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readTrustProxyHops } = require('../utils/settings');

describe('readTrustProxyHops', () => {
  it('no setting means no proxy (0)', () => {
    assert.equal(readTrustProxyHops(undefined), 0);
    assert.equal(readTrustProxyHops(''), 0);
  });

  it('a whole number from 0 to 5 is accepted', () => {
    for (let i = 0; i <= 5; i++) {
      assert.equal(readTrustProxyHops(String(i)), i);
    }
  });

  it('anything else is refused', () => {
    const wrongValues = ['6', '-1', 'abc', '1.5', 'true', ' 1', '10', '01'];
    for (let i = 0; i < wrongValues.length; i++) {
      assert.throws(() => readTrustProxyHops(wrongValues[i]), { message: 'TRUST_PROXY_HOPS must be a whole number from 0 to 5' }, 'value "' + wrongValues[i] + '" should be refused');
    }
  });
});