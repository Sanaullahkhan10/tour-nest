// tests/tour-page.test.js - the page of one tour and the error pages of the website.
// No database is needed: the routes get fake search results instead.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const { startApp } = require('./helpers');

const tourId = '64b7f0c2a1b2c3d4e5f60001';

const hunza = {
  _id: tourId,
  name: 'The Hunza Valley Explorer',
  duration: 7,
  maxGroupSize: 12,
  difficulty: 'easy',
  price: 95000,
  summary: 'Seven relaxed days among apricot orchards.',
  description: 'Start in Karimabad and walk up to the old fort.',
  ratingsAverage: 4.5,
  ratingsQuantity: 2,
  startLocation: { type: 'Point', coordinates: [74.66, 36.32], address: 'Karimabad, Hunza' },
};
const stops = [
  { day: 3, description: 'Village walk in Gulmit' },
  { day: 1, description: 'Old town and Baltit Fort' },
];
const reviews = [
  { userName: 'Ayesha', rating: 5, review: 'A wonderful trip.', createdAt: new Date('2027-05-03T10:00:00Z') },
  { userName: 'Deleted user', rating: 4, review: 'Good guides.', createdAt: new Date('2027-05-01T10:00:00Z') },
];
const dates = [new Date('2099-05-10T00:00:00Z'), new Date('2099-09-18T00:00:00Z')];

// Draws a template with the given data and gives back the HTML.
function render(name, data) {
  return new Promise((resolve, reject) => {
    app.render(name, data, (error, html) => {
      if (error) {
        reject(error);
      } else {
        resolve(html);
      }
    });
  });
}

describe('tour template', () => {
  it('shows the story, the route, the dates and the facts', async () => {
    const html = await render('tour', { title: hunza.name, tour: hunza, stops: stops, reviews: reviews, startDates: dates });
    assert.ok(html.includes('<title>The Hunza Valley Explorer | Tour Nest</title>'));
    assert.ok(html.includes('Start in Karimabad and walk up to the old fort.'));
    assert.ok(html.includes('PKR 95,000'));
    assert.ok(html.includes('7 days'));
    assert.ok(html.includes('Up to 12 people'));
    assert.ok(html.includes('4.5 / 5 (2 reviews)'));
    assert.ok(html.includes('Karimabad, Hunza'));
    assert.ok(html.includes('May 10, 2099'));
    assert.ok(html.includes('Sep 18, 2099'));
    assert.ok(html.includes('Day 3'));
    assert.ok(html.includes('Old town and Baltit Fort'));
  });

  it('shows the reviews with the name of the writer and the stars', async () => {
    const html = await render('tour', { title: hunza.name, tour: hunza, stops: stops, reviews: reviews, startDates: dates });
    assert.ok(html.includes('Ayesha'));
    assert.ok(html.includes('Deleted user'));
    assert.ok(html.includes('A wonderful trip.'));
    assert.ok(html.includes(String.fromCharCode(9733).repeat(5)));
    assert.ok(html.includes('May 3, 2027'));
  });

  it('turns HTML inside a review into harmless text', async () => {
    const evil = [{ userName: '<b>x</b>', rating: 3, review: '<script>alert(1)</script>', createdAt: new Date() }];
    const html = await render('tour', { title: hunza.name, tour: hunza, stops: [], reviews: evil, startDates: [] });
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  });

  it('copes with a tour that has no reviews, no route, no description and no dates', async () => {
    const bare = { ...hunza, description: undefined, ratingsAverage: 0, ratingsQuantity: 0, startLocation: undefined };
    const html = await render('tour', { title: bare.name, tour: bare, stops: [], reviews: [], startDates: [] });
    assert.ok(html.includes('No reviews yet'));
    assert.ok(html.includes('No upcoming dates yet'));
    assert.ok(!html.includes('About this tour'));
    assert.ok(!html.includes('The route, day by day'));
    assert.ok(!html.includes('Starts in'));
  });
});

describe('tour page route', () => {
  let site;
  let findById;

  before(async () => {
    // Fake searches. The review search is asked in the same chain of calls as the real one.
    findById = mock.method(Tour, 'findById', (id) => {
      const found = id === tourId ? { ...hunza, locations: stops, startDates: [new Date('2001-01-01T00:00:00Z'), ...dates] } : null;
      return { lean: () => Promise.resolve(found) };
    });
    const reviewChain = {
      sort: () => reviewChain,
      limit: () => reviewChain,
      populate: () => reviewChain,
      lean: () =>
        Promise.resolve([
          { review: 'A wonderful trip.', rating: 5, createdAt: new Date('2027-05-03T10:00:00Z'), user: { name: 'Ayesha' } },
          { review: 'Good guides.', rating: 4, createdAt: new Date('2027-05-01T10:00:00Z'), user: null },
        ]),
    };
    mock.method(Review, 'find', () => reviewChain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('answers with the page of the tour', async () => {
    const reply = await fetch(site.baseUrl + '/tours/' + tourId);
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('The Hunza Valley Explorer'));
    // The route is in the order of the days, and a deleted writer is shown as "Deleted user".
    assert.ok(html.indexOf('Day 1') < html.indexOf('Day 3'));
    assert.ok(html.includes('Deleted user'));
    // Only dates that are not in the past are shown.
    assert.ok(html.includes('May 10, 2099'));
    assert.ok(!html.includes('Jan 1, 2001'));
  });

  it('answers with a 404 page when no tour has this id', async () => {
    const reply = await fetch(site.baseUrl + '/tours/64b7f0c2a1b2c3d4e5f6ffff');
    const html = await reply.text();
    assert.equal(reply.status, 404);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('We could not find that tour'));
  });

  it('answers with a 404 page for a badly shaped id, without asking the database', async () => {
    const callsBefore = findById.mock.callCount();
    const reply = await fetch(site.baseUrl + '/tours/abc');
    assert.equal(reply.status, 404);
    assert.ok((await reply.text()).includes('We could not find that tour'));
    assert.equal(findById.mock.callCount(), callsBefore);
  });
});

describe('error pages', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('a website address that does not exist gets a 404 page', async () => {
    const reply = await fetch(site.baseUrl + '/nothing-here');
    const html = await reply.text();
    assert.equal(reply.status, 404);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('404'));
    assert.ok(html.includes('Back to all tours'));
  });

  it('an API address that does not exist still gets JSON', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/nothing-here');
    const body = await reply.json();
    assert.equal(reply.status, 404);
    assert.ok(reply.headers.get('content-type').startsWith('application/json'));
    assert.equal(body.status, 'fail');
  });

  it('a bug on a website page gets a 500 page that hides the details', async () => {
    mock.method(console, 'error', () => {});
    mock.method(Tour, 'find', () => {
      throw new Error('secret details about the database');
    });
    const reply = await fetch(site.baseUrl + '/');
    const html = await reply.text();
    mock.restoreAll();
    assert.equal(reply.status, 500);
    assert.ok(html.includes('Something went wrong'));
    assert.ok(!html.includes('secret details'));
  });
});
