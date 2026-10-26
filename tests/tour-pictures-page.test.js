// tests/tour-pictures-page.test.js - the pictures, the guides and the slug address on the pages of the website.
// No database: the pages get fake search results.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const User = require('../models/userModel');
const { startApp } = require('./helpers');

const tourId = '64b7f0c2a1b2c3d4e5f60001';
const coverId = '64b7f0c2a1b2c3d4e5f6e001';
const galleryIds = ['64b7f0c2a1b2c3d4e5f6e002', '64b7f0c2a1b2c3d4e5f6e003', '64b7f0c2a1b2c3d4e5f6e004'];
const photoId = '64b7f0c2a1b2c3d4e5f6e005';

const hunza = {
  _id: tourId,
  name: 'The Hunza Valley Explorer',
  slug: 'the-hunza-valley-explorer',
  duration: 7,
  maxGroupSize: 12,
  difficulty: 'easy',
  price: 95000,
  summary: 'Seven relaxed days among apricot orchards.',
  description: 'Start in Karimabad.',
  ratingsAverage: 4.5,
  ratingsQuantity: 2,
  startLocation: { type: 'Point', coordinates: [74.66, 36.32], address: 'Karimabad, Hunza' },
};

function render(name, data) {
  return new Promise((resolve, reject) => {
    app.render(name, data, (error, html) => (error ? reject(error) : resolve(html)));
  });
}
const renderTour = (tour, guides) => render('tour', { title: tour.name, tour: tour, stops: [], reviews: [], startDates: [], guides: guides });
const count = (text, part) => text.split(part).length - 1;

describe('the tour page with pictures and guides', () => {
  it('shows the cover in the header, the gallery, and the guides with their roles', async () => {
    const tour = Object.assign({}, hunza, { imageCover: coverId, images: galleryIds });
    const guides = [
      { _id: 'g1', name: 'Imran Baig', role: 'lead-guide', photo: photoId, email: 'secret@example.com' },
      { _id: 'g2', name: 'Zainab Karim', role: 'guide', photo: 'default.jpg' },
    ];
    const html = await renderTour(tour, guides);
    assert.ok(html.includes('hero--photo'));
    assert.ok(html.includes('class="hero__image" src="/img/' + coverId + '"'));
    assert.equal(count(html, 'gallery__image'), 3);
    assert.ok(html.includes('src="/img/' + galleryIds[1] + '"'));
    assert.ok(html.includes('alt="The Hunza Valley Explorer, photo 1"'));
    assert.ok(html.includes('Your guides'));
    assert.ok(html.includes('Imran Baig'));
    assert.ok(html.includes('Lead guide'));
    assert.ok(html.includes('Zainab Karim'));
    assert.ok(html.includes('src="/img/' + photoId + '"'));
    assert.ok(html.includes('src="/img/default-user.svg"'));
    // The email of a guide is never shown.
    assert.ok(!html.includes('secret@example.com'));
  });

  it('turns HTML in the name of a guide into harmless text', async () => {
    const html = await renderTour(hunza, [{ _id: 'g1', name: '<b>x</b>', role: 'guide' }]);
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  });

  it('shows no pictures, no gallery and no guides for a tour that has none', async () => {
    for (const guides of [undefined, []]) {
      const html = await renderTour(hunza, guides);
      assert.ok(!html.includes('hero--photo'));
      assert.ok(!html.includes('hero__image'));
      assert.ok(!html.includes('gallery'));
      assert.ok(!html.includes('Your guides'));
      assert.ok(html.includes('The Hunza Valley Explorer'));
    }
  });
});

describe('the overview with pictures and slugs', () => {
  it('shows the cover picture in the card and links to the slug', async () => {
    const html = await render('overview', { title: 'All tours', tours: [Object.assign({}, hunza, { imageCover: coverId })] });
    assert.ok(html.includes('class="card__image" src="/img/' + coverId + '"'));
    assert.ok(html.includes('href="/tours/the-hunza-valley-explorer"'));
    assert.ok(!html.includes('href="/tours/' + tourId + '"'));
  });

  it('links to the id and shows no picture for a tour that has no slug and no cover', async () => {
    const plain = Object.assign({}, hunza);
    delete plain.slug;
    const html = await render('overview', { title: 'All tours', tours: [plain] });
    assert.ok(html.includes('href="/tours/' + tourId + '"'));
    assert.ok(!html.includes('card__image'));
  });
});

describe('GET /tours/:slug', () => {
  let site;
  let guideSearch;
  const searches = [];
  let found;

  before(async () => {
    const tour = Object.assign({}, hunza, { guides: ['64b7f0c2a1b2c3d4e5f6a001', '64b7f0c2a1b2c3d4e5f6a002', '64b7f0c2a1b2c3d4e5f6a003'] });
    mock.method(Tour, 'findOne', (filter) => {
      searches.push(filter);
      const value = filter.slug === 'the-hunza-valley-explorer' ? tour : null;
      return { lean: () => Promise.resolve(value) };
    });
    // The search finds only two of the three guides (the third closed their account), in a mixed order.
    found = [
      { _id: '64b7f0c2a1b2c3d4e5f6a002', name: 'Second Guide', role: 'guide', photo: 'default.jpg' },
      { _id: '64b7f0c2a1b2c3d4e5f6a001', name: 'First Guide', role: 'lead-guide', photo: 'default.jpg' },
    ];
    guideSearch = mock.method(User, 'find', () => ({ select: () => ({ lean: () => Promise.resolve(found) }) }));
    const reviewChain = {};
    for (const step of ['sort', 'limit', 'populate']) {
      reviewChain[step] = () => reviewChain;
    }
    reviewChain.lean = () => Promise.resolve([]);
    mock.method(Review, 'find', () => reviewChain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('finds the tour by its slug, and shows its guides in the order of the tour', async () => {
    const reply = await fetch(site.baseUrl + '/tours/the-hunza-valley-explorer');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.deepEqual(searches[0], { slug: 'the-hunza-valley-explorer' });
    assert.ok(html.includes('The Hunza Valley Explorer'));
    assert.ok(html.indexOf('First Guide') < html.indexOf('Second Guide'));
    assert.ok(html.includes('Lead guide'));
    assert.equal(guideSearch.mock.callCount(), 1);
  });

  it('answers 404 for a slug that no tour has', async () => {
    const reply = await fetch(site.baseUrl + '/tours/no-such-tour');
    assert.equal(reply.status, 404);
    assert.ok((await reply.text()).includes('We could not find that tour'));
  });
});
