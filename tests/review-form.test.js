// tests/review-form.test.js - the review form on the page of a tour.
// No database is needed: the searches are replaced by fake ones.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const User = require('../models/userModel');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const Booking = require('../models/bookingModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const tourId = '64b7f0c2a1b2c3d4e5f60001';
const userId = '64b7f0c2a1b2c3d4e5f6aaaa';
const reviewId = '64b7f0c2a1b2c3d4e5f6bbbb';

const tour = {
  _id: tourId,
  name: 'The Hunza Valley Explorer',
  duration: 7,
  maxGroupSize: 12,
  difficulty: 'easy',
  price: 95000,
  summary: 'Seven relaxed days.',
  ratingsAverage: 0,
  ratingsQuantity: 0,
};
const mine = { _id: reviewId, review: 'My old words.', rating: 4 };

// Draws the tour template with the given extra data and gives back the HTML.
function renderTour(extra) {
  const data = { title: tour.name, tour: tour, stops: [], reviews: [], startDates: [], tourId: tourId, ...extra };
  return new Promise((resolve, reject) => {
    app.render('tour', data, (error, html) => {
      if (error) {
        reject(error);
      } else {
        resolve(html);
      }
    });
  });
}

describe('review form template', () => {
  it('asks a visitor who is not logged in to log in, and shows no form', async () => {
    const html = await renderTour({ user: null, myReview: null });
    assert.ok(html.includes('href="/login"'));
    assert.ok(html.includes('to write a review'));
    assert.ok(!html.includes('id="review-form"'));
  });

  it('tells staff that only normal users can write reviews, and shows no form', async () => {
    const html = await renderTour({ user: { name: 'Boss', role: 'admin' }, myReview: null });
    assert.ok(html.includes('Only visitors with a normal user account can write reviews'));
    assert.ok(!html.includes('id="review-form"'));
  });

  it('shows an empty form to a user who has not reviewed this tour yet', async () => {
    const html = await renderTour({ user: { name: 'Ayesha', role: 'user' }, myReview: null, canReview: true });
    assert.ok(html.includes('Write a review'));
    assert.ok(html.includes('id="review-form"'));
    assert.ok(html.includes('data-mode="create"'));
    assert.ok(html.includes('data-tour="' + tourId + '"'));
    assert.ok(html.includes('maxlength="1000"'));
    assert.ok(html.includes('Post review'));
    assert.ok(!html.includes('review-delete'));
    assert.ok(!html.includes('data-review='));
    for (const stars of [1, 2, 3, 4, 5]) {
      assert.ok(html.includes('<option value="' + stars + '">'), 'option ' + stars);
    }
  });

  it('shows the review of the user in the form, with a save and a delete button', async () => {
    const html = await renderTour({ user: { name: 'Ayesha', role: 'user' }, myReview: mine });
    assert.ok(html.includes('Your review'));
    assert.ok(html.includes('data-mode="update"'));
    assert.ok(html.includes('data-review="' + reviewId + '"'));
    assert.ok(html.includes('My old words.'));
    assert.ok(html.includes('<option value="4" selected>'));
    assert.ok(html.includes('Save changes'));
    assert.ok(html.includes('id="review-delete"'));
  });

  it('turns HTML in the saved review into harmless text', async () => {
    const evil = { ...mine, review: '</textarea><script>alert(1)</script>' };
    const html = await renderTour({ user: { name: 'Ayesha', role: 'user' }, myReview: evil });
    assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
  });
});

describe('review form on the tour page route', () => {
  let site;
  let findOne;
  let currentUser;
  const cookie = () => ({ headers: { Cookie: cookieName + '=' + signToken(userId) } });

  before(async () => {
    currentUser = { _id: userId, name: 'Ayesha', role: 'user', changedPasswordAfter: () => false };
    mock.method(User, 'findById', async () => currentUser);
    mock.method(Tour, 'findById', () => ({ lean: () => Promise.resolve(tour) }));
    const reviewChain = {
      sort: () => reviewChain,
      limit: () => reviewChain,
      populate: () => reviewChain,
      lean: () => Promise.resolve([]),
    };
    mock.method(Review, 'find', () => reviewChain);
    findOne = mock.method(Review, 'findOne', () => ({ lean: () => Promise.resolve(mine) }));
    // The visitor has a paid booking, so the review form is offered (the rule itself is tested in tests/booking-extras.test.js).
    mock.method(Booking, 'exists', async () => ({ _id: 'b1' }));
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('looks for the review of the logged-in user on this tour, and fills the form with it', async () => {
    const html = await (await fetch(site.baseUrl + '/tours/' + tourId, cookie())).text();
    assert.ok(html.includes('data-mode="update"'));
    assert.ok(html.includes('My old words.'));
    const filter = findOne.mock.calls[0].arguments[0];
    assert.equal(String(filter.tour), tourId);
    assert.equal(String(filter.user), userId);
  });

  it('does not look for a review when nobody is logged in', async () => {
    const callsBefore = findOne.mock.callCount();
    const html = await (await fetch(site.baseUrl + '/tours/' + tourId)).text();
    assert.ok(html.includes('to write a review'));
    assert.equal(findOne.mock.callCount(), callsBefore);
  });

  it('loads the shared helpers before the scripts that use them', async () => {
    const html = await (await fetch(site.baseUrl + '/tours/' + tourId)).text();
    const api = html.indexOf('/js/api.js');
    const auth = html.indexOf('/js/auth.js');
    const reviews = html.indexOf('/js/reviews.js');
    assert.ok(api !== -1 && api < auth && auth < reviews);
  });

  it('serves the three scripts', async () => {
    for (const name of ['api', 'auth', 'reviews']) {
      const reply = await fetch(site.baseUrl + '/js/' + name + '.js');
      assert.equal(reply.status, 200, name);
      assert.ok(reply.headers.get('content-type').includes('javascript'), name);
    }
  });
});
