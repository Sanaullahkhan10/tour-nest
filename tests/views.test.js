// tests/views.test.js - the home page: its template and its route. No database is needed,
// because the route test replaces the database search with a fake one.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const Tour = require('../models/tourModel');
const { startApp } = require('./helpers');

// Two tours like the ones the database gives back.
const hunza = {
  name: 'The Hunza Valley Explorer',
  duration: 7,
  maxGroupSize: 12,
  difficulty: 'easy',
  price: 95000,
  summary: 'Seven relaxed days among apricot orchards.',
  ratingsAverage: 0,
  ratingsQuantity: 0,
  startDates: [new Date('2099-05-10T00:00:00Z')],
};
const skardu = {
  name: 'Skardu and the Shangrila Lakes',
  duration: 6,
  maxGroupSize: 10,
  difficulty: 'medium',
  price: 110000,
  summary: 'Lakes and sand dunes around Skardu.',
  ratingsAverage: 4.5,
  ratingsQuantity: 2,
  startDates: [new Date('2001-01-01T00:00:00Z')],
};

// Draws the overview template with the given tours and gives back the HTML.
function renderOverview(tours) {
  return new Promise((resolve, reject) => {
    app.render('overview', { title: 'All tours', tours: tours }, (error, html) => {
      if (error) {
        reject(error);
      } else {
        resolve(html);
      }
    });
  });
}

describe('overview template', () => {
  it('shows the facts of every tour', async () => {
    const html = await renderOverview([hunza, skardu]);
    assert.ok(html.includes('The Hunza Valley Explorer'));
    assert.ok(html.includes('Skardu and the Shangrila Lakes'));
    assert.ok(html.includes('PKR 95,000'));
    assert.ok(html.includes('PKR 110,000'));
    assert.ok(html.includes('7 days'));
    assert.ok(html.includes('Up to 12 people'));
    assert.ok(html.includes('card__cover--easy'));
    assert.ok(html.includes('card__cover--medium'));
    assert.ok(html.includes('<title>All tours | Tour Nest</title>'));
  });

  it('shows the rating, or says there are no reviews yet', async () => {
    const html = await renderOverview([hunza, skardu]);
    assert.ok(html.includes('No reviews yet'));
    assert.ok(html.includes('4.5 / 5 (2 reviews)'));
  });

  it('shows the next start only when there is one in the future', async () => {
    const withFuture = await renderOverview([hunza]);
    assert.ok(withFuture.includes('Next start: May 2099'));

    const onlyPast = await renderOverview([skardu]);
    assert.ok(!onlyPast.includes('Next start'));
  });

  it('turns HTML in a tour name into harmless text', async () => {
    const evil = { ...hunza, name: '<script>alert(1)</script>' };
    const html = await renderOverview([evil]);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
  });

  it('says so when there are no tours', async () => {
    const html = await renderOverview([]);
    assert.ok(html.includes('There are no tours yet'));
    assert.ok(!html.includes('card-grid'));
  });
});

describe('home page route', () => {
  let site;

  before(async () => {
    // A fake Tour.find that gives back our two tours, with the same chain of calls as the real one.
    const chain = {
      sort: () => chain,
      select: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve([hunza, skardu]),
    };
    mock.method(Tour, 'find', () => chain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('answers with an HTML page that lists the tours', async () => {
    const reply = await fetch(site.baseUrl + '/');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('The Hunza Valley Explorer'));
    assert.ok(html.includes('href="/css/style.css"'));
    assert.equal(reply.headers.get('x-powered-by'), null);
  });

  it('serves the style sheet from the public folder', async () => {
    const reply = await fetch(site.baseUrl + '/css/style.css');
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/css'));
  });

  it('does not serve files from outside the public folder', async () => {
    const reply = await fetch(site.baseUrl + '/../package.json');
    assert.equal(reply.status, 404);
    const direct = await fetch(site.baseUrl + '/package.json');
    assert.equal(direct.status, 404);
  });
});
