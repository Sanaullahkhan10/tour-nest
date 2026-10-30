// tests/booking-extras.test.js - the confirmation email of a paid booking, and the rule that only
// a guest with a paid booking can write a review. No database and no mail service: both are faked.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
process.env.SITE_URL = 'https://example.test';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const User = require('../models/userModel');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const Booking = require('../models/bookingModel');
const emailService = require('../utils/email');
const payfast = require('../utils/payfast');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6bbbb';
const tourId = '64b7f0c2a1b2c3d4e5f60001';
const bookingId = '64b7f0c2a1b2c3d4e5f6a111';
const startDate = new Date('2099-04-15T00:00:00.000Z');
const headers = () => ({ Cookie: cookieName + '=' + signToken(userId) });
const wait = () => new Promise((resolve) => setImmediate(resolve));

function makeBooking(extra) {
  return Object.assign(
    { _id: bookingId, user: userId, tour: tourId, tourName: 'The Hunza Valley Explorer', startDate: startDate, guests: 2, amount: 190000, mobile: '03451234567', status: 'pending', gateway: 'demo', basketId: 'TN-ABC123456789', expiresAt: new Date(Date.now() + 20 * 60000) },
    extra || {}
  );
}

describe('buildBookingEmail', () => {
  const user = { name: 'Ayesha Khan', email: 'ayesha@example.com' };

  it('says what was booked, with the date, the total and the reference, and links to My tours', () => {
    const mail = emailService.buildBookingEmail(user, makeBooking({ gateway: 'payfast' }), 'https://example.test');
    assert.equal(mail.to, 'ayesha@example.com');
    assert.equal(mail.subject, 'Your Tour Nest booking is confirmed');
    assert.ok(mail.text.startsWith('Hi Ayesha,'));
    assert.ok(mail.text.includes('Tour: The Hunza Valley Explorer'));
    assert.ok(mail.text.includes('Start date: 15 April 2099'));
    assert.ok(mail.text.includes('Guests: 2'));
    assert.ok(mail.text.includes('Total: PKR 190,000'));
    assert.ok(mail.text.includes('Reference: TN-ABC123456789'));
    assert.ok(mail.text.includes('https://example.test/my-tours'));
    assert.ok(mail.html.includes('href="https://example.test/my-tours"'));
    assert.ok(mail.html.includes('PKR 190,000'));
    assert.ok(!mail.text.includes('demo payment'));
  });

  it('says clearly when the payment was only a demo', () => {
    const mail = emailService.buildBookingEmail(user, makeBooking({ gateway: 'demo' }), 'https://example.test');
    assert.ok(mail.text.includes('This was a demo payment: no real money was taken.'));
    assert.ok(mail.html.includes('demo payment'));
  });

  it('turns HTML in the tour name into harmless text', () => {
    const mail = emailService.buildBookingEmail(user, makeBooking({ tourName: '<script>x</script>' }), 'https://example.test');
    assert.ok(!mail.html.includes('<script>'));
    assert.ok(mail.html.includes('&lt;script&gt;x&lt;/script&gt;'));
  });
});

describe('the confirmation email of a paid booking', () => {
  let site;
  let currentUser;
  let ownBooking;
  let basketBooking;
  let updateResult;
  const sent = [];
  let emailFails = false;
  const settingNames = ['PAYFAST_MERCHANT_ID', 'PAYFAST_SECURED_KEY', 'PAYMENT_GATEWAY'];
  const savedSettings = {};
  for (let i = 0; i < settingNames.length; i++) {
    savedSettings[settingNames[i]] = process.env[settingNames[i]];
  }

  before(async () => {
    mock.method(User, 'findById', async () => currentUser);
    mock.method(Booking, 'findById', async () => ownBooking);
    mock.method(Booking, 'findOne', async (filter) => (filter.basketId ? basketBooking : ownBooking));
    mock.method(Booking, 'findOneAndUpdate', async (filter, change) => (updateResult === undefined ? Object.assign({}, ownBooking || basketBooking, change) : updateResult));
    mock.method(emailService, 'sendBookingEmail', async (user, booking, siteUrl) => {
      sent.push({ user: user, booking: booking, siteUrl: siteUrl });
      if (emailFails) {
        throw new Error('the mail service is down');
      }
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
    for (let i = 0; i < settingNames.length; i++) {
      if (savedSettings[settingNames[i]] === undefined) {
        delete process.env[settingNames[i]];
      } else {
        process.env[settingNames[i]] = savedSettings[settingNames[i]];
      }
    }
  });
  beforeEach(() => {
    for (let i = 0; i < settingNames.length; i++) {
      delete process.env[settingNames[i]];
    }
    currentUser = { _id: userId, name: 'Ayesha', email: 'ayesha@example.com', role: 'user', changedPasswordAfter: () => false };
    ownBooking = makeBooking();
    basketBooking = null;
    updateResult = undefined;
    sent.length = 0;
    emailFails = false;
  });

  const demoPay = () => fetch(site.baseUrl + '/api/v1/bookings/' + bookingId + '/demo-pay', { method: 'POST', headers: headers() });

  it('is sent once to the customer when the demo payment is made', async () => {
    const reply = await demoPay();
    await wait();
    assert.equal(reply.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].user.email, 'ayesha@example.com');
    assert.equal(sent[0].booking.status, 'paid');
    assert.equal(sent[0].siteUrl, 'https://example.test');
  });

  it('is not sent when the payment is refused', async () => {
    ownBooking = makeBooking({ status: 'paid' });
    assert.equal((await demoPay()).status, 400);
    updateResult = null;
    ownBooking = makeBooking();
    assert.equal((await demoPay()).status, 400);
    await wait();
    assert.equal(sent.length, 0);
  });

  it('never undoes the payment when the email cannot be sent', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    emailFails = true;
    const reply = await demoPay();
    await wait();
    errorMock.mock.restore();
    assert.equal(reply.status, 200);
    assert.equal(sent.length, 1);
  });

  describe('with PayFast', () => {
    const settings = { merchantId: '1234', securedKey: 'the-secret-key' };
    beforeEach(() => {
      Object.assign(process.env, { PAYFAST_MERCHANT_ID: '1234', PAYFAST_SECURED_KEY: 'the-secret-key' });
      basketBooking = makeBooking({ gateway: 'payfast' });
    });
    const answer = () => new URLSearchParams({ basket_id: 'TN-ABC123456789', err_code: '000', validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123456789', '000'), transaction_id: 'PF-1' }).toString();
    const tell = () => fetch(site.baseUrl + '/api/v1/bookings/payfast-ipn?' + answer());

    it('is sent once when PayFast tells us the booking is paid', async () => {
      const reply = await tell();
      await wait();
      assert.equal((await reply.json()).result, 'paid');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].booking.transactionId, 'PF-1');
    });

    it('is not sent again when PayFast tells us the same payment a second time', async () => {
      basketBooking = makeBooking({ gateway: 'payfast', status: 'paid' });
      assert.equal((await (await tell()).json()).result, 'paid');
      // Another message arrived first and changed the booking, so this one changes nothing.
      basketBooking = makeBooking({ gateway: 'payfast' });
      updateResult = null;
      assert.equal((await (await tell()).json()).result, 'paid');
      await wait();
      assert.equal(sent.length, 0);
    });

    it('is not sent for a fake answer', async () => {
      const fake = new URLSearchParams({ basket_id: 'TN-ABC123456789', err_code: '000', validation_hash: 'f'.repeat(64) }).toString();
      await fetch(site.baseUrl + '/api/v1/bookings/payfast-ipn?' + fake);
      await wait();
      assert.equal(sent.length, 0);
    });
  });
});

describe('reviews need a paid booking', () => {
  let site;
  let currentUser;
  let booked;
  let currentTour;
  let myReview;
  const created = [];
  let existsCall;

  before(async () => {
    mock.method(User, 'findById', async () => currentUser);
    mock.method(Tour, 'findById', () => ({ lean: () => Promise.resolve(currentTour), then: (done, failed) => Promise.resolve(currentTour).then(done, failed) }));
    mock.method(Booking, 'exists', async (filter) => {
      existsCall = filter;
      return booked ? { _id: bookingId } : null;
    });
    mock.method(Review, 'create', async (doc) => {
      created.push(doc);
      return Object.assign({ _id: 'r1' }, doc);
    });
    mock.method(Review, 'findOne', () => ({ lean: () => Promise.resolve(myReview) }));
    const chain = {};
    for (const step of ['sort', 'limit', 'populate']) {
      chain[step] = () => chain;
    }
    chain.lean = () => Promise.resolve([]);
    mock.method(Review, 'find', () => chain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    currentUser = { _id: userId, name: 'Ayesha', role: 'user', photo: 'default.jpg', changedPasswordAfter: () => false };
    currentTour = { _id: tourId, name: 'The Hunza Valley Explorer', slug: 'the-hunza-valley-explorer', duration: 7, maxGroupSize: 12, difficulty: 'easy', price: 95000, summary: 's', description: 'd', ratingsAverage: 4.5, ratingsQuantity: 2, startLocation: { address: 'Karimabad' }, startDates: [startDate] };
    booked = true;
    myReview = null;
    created.length = 0;
    existsCall = null;
  });

  const postReview = () =>
    fetch(site.baseUrl + '/api/v1/tours/' + tourId + '/reviews', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
      body: JSON.stringify({ review: 'A lovely trip', rating: 5 }),
    });
  const getPage = () => fetch(site.baseUrl + '/tours/' + tourId, { headers: headers() }).then((reply) => reply.text());

  it('the API refuses a review from a user who has no paid booking of the tour', async () => {
    booked = false;
    const reply = await postReview();
    assert.equal(reply.status, 403);
    assert.ok((await reply.json()).message.includes('only after you have booked it'));
    assert.equal(created.length, 0);
  });

  it('the API accepts a review from a user with a paid booking, and looked for a PAID one of this tour', async () => {
    const reply = await postReview();
    assert.equal(reply.status, 201);
    assert.equal(created.length, 1);
    assert.equal(String(existsCall.user), userId);
    assert.equal(String(existsCall.tour), tourId);
    assert.equal(existsCall.status, 'paid');
  });

  it('the tour page shows the review form to a guest with a paid booking', async () => {
    const html = await getPage();
    assert.ok(html.includes('id="review-form"'));
    assert.ok(html.includes('data-mode="create"'));
    assert.ok(!html.includes('Only guests with a paid booking'));
  });

  it('the tour page explains the rule, and shows no form, to a user without a paid booking', async () => {
    booked = false;
    const html = await getPage();
    assert.ok(!html.includes('id="review-form"'));
    assert.ok(html.includes('Only guests with a paid booking of this tour can write a review.'));
  });

  it('a user who already has a review can still change or delete it, with no booking search at all', async () => {
    booked = false;
    myReview = { _id: 'r9', review: 'My old words.', rating: 4 };
    const html = await getPage();
    assert.ok(html.includes('data-mode="update"'));
    assert.equal(existsCall, null);
  });

  it('a user who is not logged in is asked to log in, with no booking search', async () => {
    const html = await (await fetch(site.baseUrl + '/tours/' + tourId)).text();
    assert.ok(html.includes('to write a review'));
    assert.equal(existsCall, null);
  });

  it('a staff account gets the old message and no booking search', async () => {
    currentUser = Object.assign(currentUser, { role: 'guide' });
    const html = await getPage();
    assert.ok(html.includes('Only visitors with a normal user account can write reviews.'));
    assert.equal(existsCall, null);
  });
});
