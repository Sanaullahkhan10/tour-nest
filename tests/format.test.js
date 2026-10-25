// tests/format.test.js - the helpers that make prices and dates nice to read.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatPrice, formatMonthYear, nextStart } = require('../utils/format');

describe('formatPrice', () => {
  it('writes PKR and puts commas between the thousands', () => {
    assert.equal(formatPrice(95000), 'PKR 95,000');
    assert.equal(formatPrice(1250000), 'PKR 1,250,000');
    assert.equal(formatPrice(0), 'PKR 0');
  });
});

describe('formatMonthYear', () => {
  it('gives the short month and the year', () => {
    assert.equal(formatMonthYear(new Date('2027-04-15T00:00:00Z')), 'Apr 2027');
  });

  it('uses UTC, so the first day of a month stays in that month', () => {
    assert.equal(formatMonthYear(new Date('2027-06-01T00:00:00Z')), 'Jun 2027');
  });
});

describe('nextStart', () => {
  const now = new Date('2027-05-01T00:00:00Z');

  it('gives the nearest date that is not in the past', () => {
    const dates = [new Date('2027-09-18'), new Date('2027-04-15'), new Date('2027-05-20'), new Date('2027-10-09')];
    assert.equal(nextStart(dates, now).toISOString(), '2027-05-20T00:00:00.000Z');
  });

  it('counts a date that is exactly now', () => {
    assert.equal(nextStart([new Date('2027-05-01T00:00:00Z')], now).toISOString(), '2027-05-01T00:00:00.000Z');
  });

  it('gives null when every date is in the past, or there are no dates', () => {
    assert.equal(nextStart([new Date('2027-01-01')], now), null);
    assert.equal(nextStart([], now), null);
    assert.equal(nextStart(undefined, now), null);
  });
});
