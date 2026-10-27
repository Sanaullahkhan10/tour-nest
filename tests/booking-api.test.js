// tests/booking-api.test.js - the bookings API: book, list, cancel, the demo payment, and the PayFast messages.
// No database: the model searches are replaced by fakes.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/userModel');
const Tour = require('../models/tourModel');
const Booking = require('../models/bookingModel');
const payfast = require('../utils/payfast');
const { signToken, cookieName } = require('../utils/token');
const { startApp, send } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6bbbb';
const otherId = '64b7f0c2a1b2c3d4e5f6bbb0';
const tourId = '64b7f0c2a1b2c3d4e5f60001';
const bookingId = '64b7f0c2a1b2c3d4e5f6a111';
const futureDate = new Date('2099-04-15T00:00:00.000Z');
const pastDate = new Date('2020-04-15T00:00:00.000Z');

const settingNames = ['PAYFAST_MERCHANT_ID', 'PAYFAST_SECURED_KEY', 'PAYFAST_BASE_URL', 'PAYMENT_GATEWAY'];
const savedSettings = {};
for (let i = 0; i < settingNames.length; i++) {
  savedSettings[settingNames[i]] = process.env[settingNames[i]];
}
function useSettings(values) {
  for (let i = 0; i < settingNames.length; i++) {
    delete process.env[settingNames[i]];
  }
  Object.assign(process.env, values);
}

let currentUser;
let currentTour;
let takenGuests;
let alreadyPaid;
let ownBooking;
let basketBooking;
let allBookings;
let updateResult;
const created = [];
const deleted = [];
const updates = [];
const finds = [];
let aggregateCalls;

function makeUser(role, id) {
  return { _id: id || userId, name: 'Ayesha', email: 'ayesha@example.com', role: role || 'user', changedPasswordAfter: () => false };
}
function makeTour() {
  return { _id: tourId, name: 'The Hunza Valley Explorer', price: 95000, maxGroupSize: 12, startDates: [pastDate, futureDate] };
}
function makeBooking(extra) {
  return Object.assign(
    { _id: bookingId, user: userId, tour: tourId, tourName: 'The Hunza Valley Explorer', startDate: futureDate, guests: 2, amount: 190000, mobile: '03451234567', status: 'pending', gateway: 'demo', basketId: 'TN-ABC123456789', expiresAt: new Date(Date.now() + 20 * 60000) },
    extra || {}
  );
}

const headers = (id) => ({ Cookie: cookieName + '=' + signToken(id || userId) });

before(() => {
  mock.method(User, 'findById', async () => currentUser);
  mock.method(Tour, 'findById', () => ({ select: async () => currentTour }));
  mock.method(Booking, 'aggregate', async (pipeline) => {
    aggregateCalls.push(pipeline);
    return takenGuests > 0 ? [{ _id: null, guests: takenGuests }] : [];
  });
  mock.method(Booking, 'deleteMany', async (filter) => {
    deleted.push(filter);
  });
  mock.method(Booking, 'create', async (doc) => {
    created.push(doc);
    return Object.assign({ _id: bookingId }, doc);
  });
  mock.method(Booking, 'findOne', async (filter) => {
    finds.push(filter);
    if (filter.status === 'paid') {
      return alreadyPaid;
    }
    if (filter.basketId) {
      return basketBooking;
    }
    return ownBooking;
  });
  mock.method(Booking, 'findById', async () => ownBooking);
  mock.method(Booking, 'findOneAndUpdate', async (filter, change) => {
    updates.push({ filter: filter, change: change });
    return updateResult === undefined ? Object.assign({}, ownBooking || basketBooking, change) : updateResult;
  });
  mock.method(Booking, 'find', () => {
    const chain = {};
    for (const step of ['sort', 'skip', 'limit', 'populate']) {
      chain[step] = (...args) => {
        finds.push({ step: step, args: args });
        return chain;
      };
    }
    chain.lean = () => Promise.resolve(allBookings);
    return chain;
  });
});
after(() => {
  mock.restoreAll();
  for (let i = 0; i < settingNames.length; i++) {
    if (savedSettings[settingNames[i]] === undefined) {
      delete process.env[settingNames[i]];
    } else {
      process.env[settingNames[i]] = savedSettings[settingNames[i]];
    }
  }
});
beforeEach(() => {
  useSettings({});
  currentUser = makeUser('user');
  currentTour = makeTour();
  takenGuests = 0;
  alreadyPaid = null;
  ownBooking = makeBooking();
  basketBooking = null;
  allBookings = [makeBooking()];
  updateResult = undefined;
  created.length = 0;
  deleted.length = 0;
  updates.length = 0;
  finds.length = 0;
  aggregateCalls = [];
});

describe('POST /api/v1/bookings', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const book = (body, h) => fetch(site.baseUrl + '/api/v1/bookings', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h === undefined ? headers() : h), body: JSON.stringify(body) });
  const good = () => ({ tour: tourId, startDate: futureDate.toISOString(), guests: 2, mobile: '03451234567' });

  it('makes a waiting booking, with the price worked out by the server, and gives the payment address', async () => {
    const reply = await book(Object.assign(good(), { guests: 3, mobile: '+92-3451234567', amount: 1, price: 1, status: 'paid', user: otherId }));
    const body = await reply.json();
    assert.equal(reply.status, 201);
    assert.equal(body.data.payUrl, '/pay/' + bookingId);

    assert.equal(created.length, 1);
    const doc = created[0];
    assert.equal(doc.user, userId);
    assert.equal(doc.tour, tourId);
    assert.equal(doc.tourName, 'The Hunza Valley Explorer');
    assert.equal(doc.pricePerPerson, 95000);
    assert.equal(doc.guests, 3);
    assert.equal(doc.amount, 285000);
    assert.equal(doc.mobile, '03451234567');
    assert.equal(doc.gateway, 'demo');
    assert.equal(doc.status, undefined);
    assert.match(doc.basketId, /^TN-[0-9A-F]{12}$/);
    const minutes = (doc.expiresAt.getTime() - Date.now()) / 60000;
    assert.ok(minutes > 29 && minutes <= 30);
  });

  it('replaces an older waiting booking of the same date, and does not count its own places', async () => {
    await book(good());
    assert.deepEqual(deleted, [{ user: userId, tour: tourId, startDate: futureDate, status: 'pending' }]);
    assert.deepEqual(aggregateCalls[0][0].$match.user, { $ne: userId });
  });

  it('uses PayFast when it is set up, and the demo checkout when PAYMENT_GATEWAY says so', async () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k' });
    await book(good());
    assert.equal(created[0].gateway, 'payfast');
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYMENT_GATEWAY: 'demo' });
    await book(good());
    assert.equal(created[1].gateway, 'demo');
  });

  it('needs a logged-in user', async () => {
    assert.equal((await book(good(), {})).status, 401);
    assert.equal(created.length, 0);
  });

  it('refuses a body that is not right, with a clear message', async () => {
    const cases = [
      [{ startDate: futureDate.toISOString(), guests: 2, mobile: '03451234567' }, 'tour must be the id'],
      [Object.assign(good(), { tour: 'abc' }), 'tour must be the id'],
      [Object.assign(good(), { startDate: '' }), 'Please choose a start date'],
      [Object.assign(good(), { startDate: 5 }), 'Please choose a start date'],
      [Object.assign(good(), { guests: '3' }), 'guests must be a whole number'],
      [Object.assign(good(), { guests: 2.5 }), 'guests must be a whole number'],
      [Object.assign(good(), { mobile: '12345' }), 'mobile number like 03451234567'],
      [Object.assign(good(), { mobile: '0345 123 4567' }), 'mobile number like 03451234567'],
      [Object.assign(good(), { mobile: 3451234567 }), 'mobile number like 03451234567'],
      [Object.assign(good(), { startDate: 'not a date' }), 'not a valid date'],
      [Object.assign(good(), { startDate: '2099-05-01T00:00:00.000Z' }), 'not an upcoming start date'],
      [Object.assign(good(), { startDate: pastDate.toISOString() }), 'not an upcoming start date'],
      [Object.assign(good(), { guests: 0 }), 'guests must be from 1 to 12'],
      [Object.assign(good(), { guests: 13 }), 'guests must be from 1 to 12'],
    ];
    for (let i = 0; i < cases.length; i++) {
      const reply = await book(cases[i][0]);
      assert.equal(reply.status, 400, 'case ' + i);
      assert.ok((await reply.json()).message.includes(cases[i][1]), 'case ' + i);
    }
    assert.equal(created.length, 0);
    assert.equal(deleted.length, 0);
  });

  it('answers 404 for an unknown tour', async () => {
    currentTour = null;
    assert.equal((await book(good())).status, 404);
  });

  it('refuses a date the user has already paid for', async () => {
    alreadyPaid = makeBooking({ status: 'paid' });
    const reply = await book(good());
    assert.equal(reply.status, 400);
    assert.ok((await reply.json()).message.includes('already booked'));
    assert.equal(deleted.length, 0);
  });

  it('refuses more guests than the places that are left, and says how many are left', async () => {
    takenGuests = 10;
    const tooMany = await book(Object.assign(good(), { guests: 3 }));
    assert.equal(tooMany.status, 400);
    assert.equal((await tooMany.json()).message, 'Only 2 places are left on that date');
    assert.equal((await book(Object.assign(good(), { guests: 2 }))).status, 201);
    takenGuests = 12;
    assert.equal((await (await book(good())).json()).message, 'That date is full');
  });

  it('counts paid bookings, and waiting bookings that have not expired, as taken places', async () => {
    await book(good());
    const match = aggregateCalls[0][0].$match;
    assert.equal(match.tour, tourId);
    assert.deepEqual(match.startDate, futureDate);
    assert.equal(match.$or[0].status, 'paid');
    assert.equal(match.$or[1].status, 'pending');
    assert.ok(match.$or[1].expiresAt.$gt instanceof Date);
  });
});

describe('listing, reading and cancelling bookings', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const call = (path, method, h) => fetch(site.baseUrl + '/api/v1/bookings' + path, { method: method || 'GET', headers: h === undefined ? headers() : h });

  it('GET /my gives the bookings of the logged-in user, the newest start date first', async () => {
    const reply = await call('/my');
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.results, 1);
    assert.deepEqual(finds[0], { step: 'sort', args: ['-startDate'] });
    assert.equal((await call('/my', 'GET', {})).status, 401);
  });

  it('GET / is for the staff only, with page and limit', async () => {
    assert.equal((await call('')).status, 403);
    currentUser = makeUser('admin');
    const reply = await call('?page=3&limit=500');
    assert.equal(reply.status, 200);
    const steps = finds.filter((entry) => entry.step);
    assert.deepEqual(steps.find((entry) => entry.step === 'skip').args, [200]);
    assert.deepEqual(steps.find((entry) => entry.step === 'limit').args, [100]);
    finds.length = 0;
    await call('?page=abc&limit=-4');
    assert.deepEqual(finds.find((entry) => entry.step === 'skip').args, [0]);
    assert.deepEqual(finds.find((entry) => entry.step === 'limit').args, [20]);
  });

  it('GET /:id gives a booking to its owner and to the staff, and "not found" to everybody else', async () => {
    assert.equal((await call('/' + bookingId)).status, 200);
    currentUser = makeUser('admin', otherId);
    assert.equal((await call('/' + bookingId, 'GET', headers(otherId))).status, 200);
    currentUser = makeUser('user', otherId);
    assert.equal((await call('/' + bookingId, 'GET', headers(otherId))).status, 404);
    assert.equal((await call('/not-an-id')).status, 404);
  });

  it('DELETE cancels a waiting booking', async () => {
    const reply = await call('/' + bookingId, 'DELETE');
    assert.equal(reply.status, 200);
    assert.equal(updates[0].change.status, 'cancelled');
    assert.deepEqual(updates[0].filter.status, { $in: ['pending', 'cancelled'] });
  });

  it('DELETE refuses a paid booking, and a booking of somebody else', async () => {
    ownBooking = makeBooking({ status: 'paid' });
    const paid = await call('/' + bookingId, 'DELETE');
    assert.equal(paid.status, 400);
    assert.ok((await paid.json()).message.includes('refund'));
    assert.equal(updates.length, 0);

    ownBooking = makeBooking({ user: otherId });
    assert.equal((await call('/' + bookingId, 'DELETE')).status, 404);
  });

  it('DELETE refuses when the payment came in a moment before (the booking is paid now)', async () => {
    updateResult = null;
    assert.equal((await call('/' + bookingId, 'DELETE')).status, 400);
  });
});

describe('POST /api/v1/bookings/:id/demo-pay', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const pay = () => fetch(site.baseUrl + '/api/v1/bookings/' + bookingId + '/demo-pay', { method: 'POST', headers: headers() });

  it('marks the booking paid, once, with a demo transaction id', async () => {
    const reply = await pay();
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { _id: bookingId, status: { $in: ['pending'] } });
    assert.equal(updates[0].change.status, 'paid');
    assert.match(updates[0].change.transactionId, /^DEMO-[0-9A-F]{10}$/);
    assert.ok(updates[0].change.paidAt instanceof Date);
    assert.equal(body.data.booking.status, 'paid');
  });

  it('refuses a booking that is not the demo kind, not waiting, expired, or not found', async () => {
    ownBooking = makeBooking({ gateway: 'payfast' });
    assert.equal((await pay()).status, 400);
    ownBooking = makeBooking({ status: 'paid' });
    assert.equal((await pay()).status, 400);
    ownBooking = makeBooking({ expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await pay()).status, 400);
    ownBooking = null;
    assert.equal((await pay()).status, 404);
    assert.equal(updates.length, 0);
  });

  it('refuses when somebody else paid it a moment before', async () => {
    updateResult = null;
    assert.equal((await pay()).status, 400);
  });
});

describe('the PayFast message about a payment', () => {
  let site;
  const settings = { merchantId: '1234', securedKey: 'the-secret-key' };
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

  function params(extra) {
    const code = (extra && extra.err_code) || '000';
    return Object.assign({ basket_id: 'TN-ABC123456789', err_code: code, validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123456789', code), transaction_id: 'PF-555' }, extra);
  }
  const viaGet = (p) => fetch(site.baseUrl + '/api/v1/bookings/payfast-ipn?' + new URLSearchParams(p).toString());
  const viaPost = (p) => fetch(site.baseUrl + '/api/v1/bookings/payfast-ipn', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p).toString() });

  it('marks the booking paid when the answer is real and says paid (by GET or by POST)', async () => {
    for (const send of [viaGet, viaPost]) {
      updates.length = 0;
      const reply = await send(params());
      assert.equal(reply.status, 200);
      assert.deepEqual(await reply.json(), { status: 'ok', result: 'paid' });
      assert.equal(updates.length, 1);
      assert.deepEqual(updates[0].filter, { _id: bookingId, status: { $in: ['pending', 'cancelled'] } });
      assert.equal(updates[0].change.status, 'paid');
      assert.equal(updates[0].change.transactionId, 'PF-555');
    }
    assert.deepEqual(finds[0], { basketId: 'TN-ABC123456789' });
  });

  it('does nothing for a fake answer', async () => {
    const fakes = [params({ validation_hash: 'f'.repeat(64) }), params({ basket_id: 'TN-OTHER' }), { basket_id: 'TN-ABC123456789', err_code: '000' }, {}];
    for (let i = 0; i < fakes.length; i++) {
      const reply = await viaGet(fakes[i]);
      assert.equal((await reply.json()).result, 'invalid', 'fake ' + i);
    }
    assert.equal(updates.length, 0);
  });

  it('does nothing when PayFast says the payment failed', async () => {
    const reply = await viaGet(params({ err_code: '106' }));
    assert.equal((await reply.json()).result, 'failed');
    assert.equal(updates.length, 0);
  });

  it('does nothing for a basket id that is not ours', async () => {
    basketBooking = null;
    assert.equal((await (await viaGet(params())).json()).result, 'unknown');
    basketBooking = makeBooking({ gateway: 'demo' });
    assert.equal((await (await viaGet(params())).json()).result, 'unknown');
    assert.equal(updates.length, 0);
  });

  it('refuses an amount that does not fit the booking, and accepts the right one', async () => {
    assert.equal((await (await viaGet(params({ transaction_amount: '5' }))).json()).result, 'invalid');
    assert.equal(updates.length, 0);
    assert.equal((await (await viaGet(params({ transaction_amount: '190000.00' }))).json()).result, 'paid');
    assert.equal(updates.length, 1);
  });

  it('says "paid" again for a booking that is already paid, without changing it a second time', async () => {
    basketBooking = makeBooking({ gateway: 'payfast', status: 'paid' });
    assert.equal((await (await viaGet(params())).json()).result, 'paid');
    assert.equal(updates.length, 0);
  });

  it('believes nobody when PayFast is not set up here', async () => {
    useSettings({});
    assert.equal((await (await viaGet(params())).json()).result, 'invalid');
    assert.equal(updates.length, 0);
  });

  it('is not changed by strange names in the form', async () => {
    const reply = await send(site.baseUrl, '/api/v1/bookings/payfast-ipn', 'POST', undefined, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(reply.status, 200);
    const poisoned = await fetch(site.baseUrl + '/api/v1/bookings/payfast-ipn', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '__proto__=x&constructor=y&basket_id=a' });
    assert.equal((await poisoned.json()).result, 'invalid');
  });
});
