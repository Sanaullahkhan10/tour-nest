// tests/admin-tour-form.test.js - from a tour of the database to the plain values of the admin form.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tourToForm } = require('../utils/adminTourForm');

describe('tourToForm', () => {
  it('gives an empty form for a new tour (no tour)', () => {
    for (const none of [null, undefined]) {
      const form = tourToForm(none);
      assert.equal(form.name, '');
      assert.equal(form.duration, '');
      assert.equal(form.difficulty, 'easy');
      assert.equal(form.secretTour, false);
      assert.equal(form.startDates, '');
      assert.deepEqual(form.locations, []);
      assert.deepEqual(form.guideIds, []);
      assert.deepEqual(form.images, []);
    }
  });

  const tour = {
    name: 'The Hunza Valley Explorer',
    summary: 'Seven relaxed days.',
    description: 'Start in Karimabad.',
    duration: 7,
    maxGroupSize: 12,
    difficulty: 'medium',
    price: 95000,
    secretTour: true,
    startDates: [new Date('2027-09-18T00:00:00.000Z'), '2027-04-15', new Date('2027-05-20T00:00:00.000Z'), 'not a date'],
    startLocation: { type: 'Point', coordinates: [74.6614, 36.3269], address: 'Karimabad, Hunza', description: 'Below Baltit Fort' },
    locations: [
      { type: 'Point', coordinates: [74.9, 36.4], description: 'Second day place', day: 2 },
      { type: 'Point', coordinates: [74.6614, 36.3269], description: 'First day place', day: 1 },
    ],
    guides: ['64b7f0c2a1b2c3d4e5f6a001', { _id: '64b7f0c2a1b2c3d4e5f6a002', name: 'Populated guide' }],
    imageCover: '64b7f0c2a1b2c3d4e5f6e001',
    images: ['64b7f0c2a1b2c3d4e5f6e002'],
  };

  it('writes every value as text, the dates as sorted lines, and skips a date that is not one', () => {
    const form = tourToForm(tour);
    assert.equal(form.name, 'The Hunza Valley Explorer');
    assert.equal(form.duration, '7');
    assert.equal(form.maxGroupSize, '12');
    assert.equal(form.price, '95000');
    assert.equal(form.difficulty, 'medium');
    assert.equal(form.secretTour, true);
    assert.equal(form.startDates, '2027-04-15\n2027-05-20\n2027-09-18');
  });

  it('shows latitude first, although the database keeps longitude first', () => {
    const form = tourToForm(tour);
    assert.equal(form.startLat, '36.3269');
    assert.equal(form.startLng, '74.6614');
    assert.equal(form.startAddress, 'Karimabad, Hunza');
    assert.equal(form.startDescription, 'Below Baltit Fort');
  });

  it('puts the stops in the order of their days', () => {
    const form = tourToForm(tour);
    assert.deepEqual(form.locations.map((stop) => stop.day), ['1', '2']);
    assert.deepEqual(form.locations[0], { day: '1', description: 'First day place', lat: '36.3269', lng: '74.6614' });
  });

  it('gives the ids of the guides, also when the guides are whole users, and the picture ids', () => {
    const form = tourToForm(tour);
    assert.deepEqual(form.guideIds, ['64b7f0c2a1b2c3d4e5f6a001', '64b7f0c2a1b2c3d4e5f6a002']);
    assert.equal(form.imageCover, '64b7f0c2a1b2c3d4e5f6e001');
    assert.deepEqual(form.images, ['64b7f0c2a1b2c3d4e5f6e002']);
  });

  it('copes with a tour that has no start location or stops', () => {
    const form = tourToForm({ name: 'A tour' });
    assert.equal(form.startLat, '');
    assert.equal(form.startAddress, '');
    assert.deepEqual(form.locations, []);
  });
});
