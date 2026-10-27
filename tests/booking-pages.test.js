// tests/booking-pages.test.js - the booking form on the tour page, My tours, the payment pages,
// and the addresses where PayFast sends the customer back. No database and no internet: both are faked.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
const payfast = require('../utils/payfast');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6bbbb';
const bookingId = '64b7f0c2a1b2c3d4e5f6a111';
const futureDate = new Date('2099-04-15T00:00:00.000Z');
const settings = { merchantId: '1234', securedKey: 'the-secret-key' };

const names = ['PAYFAST_MERCHANT_ID', 'PAYFAST_SECURED_KEY', 'PAYFAST_BASE_URL', 'PAYMENT_GATEWAY', 'SITE_URL'];
const saved = {};
for (let i = 0; i < names.length; i++) {
  saved[names[i]] = process.env[names[i]];
}
function useSettings(values) {
  for (let i = 0; i < names.length; i++) {
    delete process.env[names[i]];
  }
  Object.assign(process.env, values);
}

function makeBooking(extra) {
  return Object.assign(
    { _id: bookingId, user: userId, tourName: 'The Hunza Valley Explorer', startDate: futureDate, guests: 2, amount: 190000, mobile: '03451234567', status: 'pending', gateway: 'demo', basketId: 'TN-ABC123456789', expiresAt: new Date(Date.now() + 20 * 60000) },
    extra || {}
  );
}

let currentUser;
let myBookings;
let ownBooking;
let basketBooking;
const updates = [];

const headers = () => ({ Cookie: cookieName + '=' + signToken(userId) });
const count = (text, part) => text.split(part).length - 1;

before(() => {
  mock.method(User, 'findById', async () => currentUser);
  mock.method(Booking, 'find', () => {
    const chain = { sort: () => chain, lean: () => Promise.resolve(myBookings) };
    return chain;
  });
  mock.method(Booking, 'findOne', async (filter) => (filter.basketId ? basketBooking : ownBooking));
  mock.method(Booking, 'findOneAndUpdate', async (filter, change) => {
    updates.push({ filter: filter, change: change });
    return Object.assign({}, basketBooking, change);
  });
});
after(() => {
  mock.restoreAll();
  useSettings(saved);
});
beforeEach(() => {
  useSettings({});
  currentUser = { _id: userId, name: 'Ayesha Khan', email: 'ayesha@example.com', role: 'user', photo: 'default.jpg', changedPasswordAfter: () => false };
  myBookings = [];
  ownBooking = makeBooking();
  basketBooking = null;
  updates.length = 0;
});

function render(name, data) {
  return new Promise((resolve, reject) => {
    app.render(name, data, (error, html) => (error ? reject(error) : resolve(html)));
  });
}

describe('the booking form on the tour page', () => {
  const tour = { _id: '64b7f0c2a1b2c3d4e5f60001', name: 'The Hunza Valley Explorer', duration: 7, maxGroupSize: 12, difficulty: 'easy', price: 95000, summary: 's', description: 'd', ratingsAverage: 4.5, ratingsQuantity: 2, startLocation: { address: 'Karimabad' } };
  const renderTour = (user, startDates) => render('tour', { title: tour.name, tour: tour, stops: [], reviews: [], startDates: startDates, tourId: tour._id, user: user, guides: [] });

  it('shows a logged-in user the dates, the guests, the mobile number and the button', async () => {
    const html = await renderTour(currentUser, [futureDate, new Date('2099-05-20T00:00:00.000Z')]);
    assert.ok(html.includes('id="booking-form"'));
    assert.ok(html.includes('data-tour="64b7f0c2a1b2c3d4e5f60001"'));
    assert.ok(html.includes('value="2099-04-15T00:00:00.000Z"'));
    assert.ok(html.includes('value="2099-05-20T00:00:00.000Z"'));
    assert.ok(html.includes('name="guests"'));
    assert.ok(html.includes('max="12"'));
    assert.ok(html.includes('name="mobile"'));
    assert.ok(html.includes('type="tel"'));
    assert.ok(html.includes('Continue to payment'));
    assert.ok(html.includes('src="/js/bookings.js"'));
  });

  it('asks a visitor who is not logged in to log in, and shows no form', async () => {
    const html = await renderTour(null, [futureDate]);
    assert.ok(!html.includes('id="booking-form"'));
    assert.ok(html.includes('to book this tour'));
    assert.ok(html.includes('href="/login"'));
  });

  it('shows no booking part when the tour has no upcoming date', async () => {
    const html = await renderTour(currentUser, []);
    assert.ok(!html.includes('Book this tour'));
    assert.ok(!html.includes('booking-form'));
  });

  it('the header has the My tours link for a logged-in user only', async () => {
    assert.ok((await renderTour(currentUser, [])).includes('href="/my-tours"'));
    assert.ok(!(await renderTour(null, [])).includes('href="/my-tours"'));
  });
});

describe('GET /my-tours', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const get = (path, h) => fetch(site.baseUrl + path, { headers: h === undefined ? headers() : h, redirect: 'manual' });

  it('sends a visitor who is not logged in to the login page', async () => {
    const reply = await get('/my-tours', {});
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/login');
  });

  it('says so when there are no bookings yet', async () => {
    const html = await (await get('/my-tours')).text();
    assert.ok(html.includes('You have no bookings yet'));
  });

  it('lists each booking with its status, and the buttons only for a booking that waits', async () => {
    myBookings = [
      makeBooking({ _id: '64b7f0c2a1b2c3d4e5f6a001', tourName: 'Waiting tour' }),
      makeBooking({ _id: '64b7f0c2a1b2c3d4e5f6a002', tourName: 'Paid tour', status: 'paid' }),
      makeBooking({ _id: '64b7f0c2a1b2c3d4e5f6a003', tourName: 'Cancelled tour', status: 'cancelled' }),
      makeBooking({ _id: '64b7f0c2a1b2c3d4e5f6a004', tourName: 'Old waiting tour', expiresAt: new Date(Date.now() - 1000) }),
    ];
    const reply = await get('/my-tours');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    for (const name of ['Waiting tour', 'Paid tour', 'Cancelled tour', 'Old waiting tour']) {
      assert.ok(html.includes(name), name);
    }
    assert.ok(html.includes('Waiting for payment'));
    assert.ok(html.includes('Paid'));
    assert.ok(html.includes('Cancelled'));
    assert.ok(html.includes('Expired'));
    assert.ok(html.includes('Reference TN-ABC123456789'));
    assert.equal(count(html, 'href="/pay/'), 1);
    assert.ok(html.includes('href="/pay/64b7f0c2a1b2c3d4e5f6a001"'));
    assert.equal(count(html, 'data-cancel-booking='), 1);
    assert.ok(html.includes('src="/js/bookings.js"'));
  });

  it('turns HTML in a tour name into harmless text', async () => {
    myBookings = [makeBooking({ tourName: '<b>x</b>' })];
    const html = await (await get('/my-tours')).text();
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  });

  it('shows the notice that the address asks for, and none for an unknown word', async () => {
    assert.ok((await (await get('/my-tours?payment=success')).text()).includes('Payment received'));
    assert.ok((await (await get('/my-tours?payment=failed')).text()).includes('was not completed'));
    assert.ok((await (await get('/my-tours?payment=unverified')).text()).includes('could not check that payment'));
    const other = await (await get('/my-tours?payment=toString')).text();
    assert.ok(!other.includes('class="notice'));
  });
});

describe('GET /pay/:id', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const get = (id, h) => fetch(site.baseUrl + '/pay/' + id, { headers: h === undefined ? headers() : h, redirect: 'manual' });

  it('sends a visitor who is not logged in to the login page', async () => {
    assert.equal((await get(bookingId, {})).headers.get('location'), '/login');
  });

  it('answers 404 for a bad id, or a booking that is not the user\'s', async () => {
    assert.equal((await get('abc')).status, 404);
    ownBooking = null;
    assert.equal((await get(bookingId)).status, 404);
  });

  it('goes to My tours when the booking is not waiting any more, and refuses an expired one', async () => {
    ownBooking = makeBooking({ status: 'paid' });
    const paid = await get(bookingId);
    assert.equal(paid.status, 302);
    assert.equal(paid.headers.get('location'), '/my-tours');
    ownBooking = makeBooking({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await get(bookingId);
    assert.equal(expired.status, 400);
    assert.ok((await expired.text()).includes('has expired'));
  });

  it('the demo checkout: says clearly that no money is taken, and has the pay button', async () => {
    const reply = await get(bookingId);
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    assert.ok(html.includes('No real money is taken'));
    assert.ok(html.includes('id="demo-pay"'));
    assert.ok(html.includes('data-booking="' + bookingId + '"'));
    assert.ok(html.includes('The Hunza Valley Explorer'));
    assert.ok(!html.includes('payfast-form'));
  });

  describe('with PayFast', () => {
    const realFetch = globalThis.fetch;
    let tokenCalls;
    let tokenAnswer;

    beforeEach(() => {
      useSettings({ PAYFAST_MERCHANT_ID: '1234', PAYFAST_SECURED_KEY: 'the-secret-key', SITE_URL: 'https://example.test' });
      ownBooking = makeBooking({ gateway: 'payfast' });
      tokenCalls = [];
      tokenAnswer = { ok: true, body: { ACCESS_TOKEN: 'the-one-time-token' } };
      // Only the address of PayFast is faked. Every other request (ours to our own test server) goes on as usual.
      globalThis.fetch = async (url, options) => {
        if (String(url).startsWith('https://ipguat.apps.net.pk')) {
          tokenCalls.push({ url: String(url), body: String(options.body) });
          return { ok: tokenAnswer.ok, status: tokenAnswer.ok ? 200 : 500, json: async () => tokenAnswer.body };
        }
        return realFetch(url, options);
      };
    });
    after(() => {
      globalThis.fetch = realFetch;
    });

    it('asks PayFast for a token and shows a form that goes to PayFast, without the secured key', async () => {
      const reply = await get(bookingId);
      const html = await reply.text();
      assert.equal(reply.status, 200);
      assert.equal(tokenCalls.length, 1);
      assert.ok(tokenCalls[0].url.endsWith('/Ecommerce/api/Transaction/GetAccessToken'));
      assert.ok(tokenCalls[0].body.includes('BASKET_ID=TN-ABC123456789'));
      assert.ok(tokenCalls[0].body.includes('TXNAMT=190000'));

      assert.ok(html.includes('id="payfast-form"'));
      assert.ok(html.includes('action="https://ipguat.apps.net.pk/Ecommerce/api/Transaction/PostTransaction"'));
      assert.ok(html.includes('name="TOKEN" value="the-one-time-token"'));
      assert.ok(html.includes('name="BASKET_ID" value="TN-ABC123456789"'));
      assert.ok(html.includes('name="TXNAMT" value="190000"'));
      assert.ok(html.includes('name="CUSTOMER_MOBILE_NO" value="92-3451234567"'));
      assert.ok(html.includes('name="CUSTOMER_EMAIL_ADDRESS" value="ayesha@example.com"'));
      assert.ok(html.includes('name="SUCCESS_URL" value="https://example.test/payment/payfast/success"'));
      assert.ok(html.includes('Continue to PayFast'));
      assert.ok(!html.includes('the-secret-key'));
      assert.ok(!html.includes('demo-pay'));
    });

    it('shows an error page when PayFast gives no token', async () => {
      const errorMock = mock.method(console, 'error', () => {});
      tokenAnswer = { ok: false, body: {} };
      const reply = await get(bookingId);
      errorMock.mock.restore();
      assert.equal(reply.status, 502);
      assert.ok((await reply.text()).includes('payment service'));
    });
  });
});

describe('where PayFast sends the customer back', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  beforeEach(() => {
    useSettings({ PAYFAST_MERCHANT_ID: '1234', PAYFAST_SECURED_KEY: 'the-secret-key' });
    basketBooking = makeBooking({ gateway: 'payfast' });
  });

  function params(code, extra) {
    return Object.assign({ basket_id: 'TN-ABC123456789', err_code: code, validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123456789', code), transaction_id: 'PF-1' }, extra);
  }
  const viaGet = (path, p) => fetch(site.baseUrl + path + '?' + new URLSearchParams(p).toString(), { redirect: 'manual' });
  const viaPost = (path, p) => fetch(site.baseUrl + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p).toString() });

  it('marks the booking paid and shows the good notice, for a GET and for a POST', async () => {
    for (const send of [viaGet, viaPost]) {
      updates.length = 0;
      const reply = await send('/payment/payfast/success', params('000'));
      assert.equal(reply.status, 302);
      assert.equal(reply.headers.get('location'), '/my-tours?payment=success');
      assert.equal(updates.length, 1);
      assert.equal(updates[0].change.status, 'paid');
    }
  });

  it('does not trust the address: a "success" address with a failed answer is not a payment', async () => {
    const reply = await viaGet('/payment/payfast/success', params('106'));
    assert.equal(reply.headers.get('location'), '/my-tours?payment=failed');
    assert.equal(updates.length, 0);
  });

  it('a "failure" address with a real paid answer is a payment (the money was taken)', async () => {
    const reply = await viaGet('/payment/payfast/failure', params('000'));
    assert.equal(reply.headers.get('location'), '/my-tours?payment=success');
    assert.equal(updates.length, 1);
  });

  it('shows the "could not check" notice for a fake answer, and changes nothing', async () => {
    const fake = await viaGet('/payment/payfast/success', params('000', { validation_hash: 'f'.repeat(64) }));
    assert.equal(fake.headers.get('location'), '/my-tours?payment=unverified');
    const nothing = await viaGet('/payment/payfast/success', {});
    assert.equal(nothing.headers.get('location'), '/my-tours?payment=unverified');
    assert.equal(updates.length, 0);
  });
});

describe('the security headers of the payment pages', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('lets a form go to our own site and to the PayFast servers, and nowhere else', async () => {
    const reply = await fetch(site.baseUrl + '/login');
    const policy = reply.headers.get('content-security-policy');
    assert.ok(policy.includes("form-action 'self' https://ipguat.apps.net.pk https://*.apps.net.pk"), policy);
    assert.ok(policy.includes("default-src 'self'"));
  });

  it('serves the script of the booking pages', async () => {
    const reply = await fetch(site.baseUrl + '/js/bookings.js');
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').includes('javascript'));
  });
});
