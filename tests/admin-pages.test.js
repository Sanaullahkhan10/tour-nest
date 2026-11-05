// tests/admin-pages.test.js - the admin pages: who may come in, the dashboard, the list of tours, the tour form,
// and the staff option that shows hidden tours. No database: the searches are replaced by fakes.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const User = require('../models/userModel');
const Tour = require('../models/tourModel');
const Booking = require('../models/bookingModel');
const Image = require('../models/imageModel');
const Review = require('../models/reviewModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const staffId = '64b7f0c2a1b2c3d4e5f6bbbb';
const tourId = '64b7f0c2a1b2c3d4e5f60001';
const coverId = '64b7f0c2a1b2c3d4e5f6e001';
const guideId = '64b7f0c2a1b2c3d4e5f6a001';

let currentUser;
let tourList;
let oneTour;
let guideList;
let bookingGroups;
let recentBookings;
const optionCalls = [];
const deletedImages = [];
const counts = [];
const headers = () => ({ Cookie: cookieName + '=' + signToken(staffId) });
const makeUser = (role) => ({ _id: staffId, name: 'Staff Person', role: role, photo: 'default.jpg', changedPasswordAfter: () => false });
const count = (text, part) => text.split(part).length - 1;

before(() => {
  mock.method(User, 'findById', async () => currentUser);
  mock.method(User, 'countDocuments', async (filter) => {
    counts.push({ model: 'user', filter: filter });
    return 12;
  });
  mock.method(User, 'find', () => {
    const chain = { sort: () => chain, select: () => chain, lean: () => Promise.resolve(guideList) };
    return chain;
  });
  mock.method(Tour, 'countDocuments', (filter) => {
    counts.push({ model: 'tour', filter: filter });
    return {
      setOptions: (options) => {
        optionCalls.push(options);
        return Promise.resolve(filter.secretTour ? 2 : 8);
      },
    };
  });
  mock.method(Tour, 'find', () => {
    const chain = {};
    for (const step of ['sort', 'select', 'limit']) {
      chain[step] = () => chain;
    }
    chain.setOptions = (options) => {
      optionCalls.push(options);
      return chain;
    };
    chain.lean = () => Promise.resolve(tourList);
    return chain;
  });
  mock.method(Tour, 'findById', () => {
    const query = { setOptions: (options) => (optionCalls.push(options), query), lean: () => Promise.resolve(oneTour), then: (done, failed) => Promise.resolve(oneTour).then(done, failed) };
    return query;
  });
  mock.method(Booking, 'aggregate', async () => bookingGroups);
  mock.method(Booking, 'find', () => {
    const chain = {};
    for (const step of ['sort', 'limit', 'populate']) {
      chain[step] = () => chain;
    }
    chain.lean = () => Promise.resolve(recentBookings);
    return chain;
  });
  mock.method(Image, 'create', async () => ({ _id: coverId }));
  mock.method(Image, 'deleteOne', async (filter) => {
    deletedImages.push(filter);
  });
});
after(() => {
  mock.restoreAll();
});
beforeEach(() => {
  currentUser = makeUser('admin');
  optionCalls.length = 0;
  counts.length = 0;
  deletedImages.length = 0;
  tourList = [
    { _id: tourId, name: 'The Hunza Valley Explorer', slug: 'the-hunza-valley-explorer', price: 95000, duration: 7, difficulty: 'easy', maxGroupSize: 12, startDates: [new Date('2027-04-15'), new Date('2027-05-20')], secretTour: false, imageCover: coverId },
    { _id: '64b7f0c2a1b2c3d4e5f60002', name: 'Hidden Draft Tour', price: 50000, duration: 3, difficulty: 'medium', maxGroupSize: 8, startDates: [], secretTour: true },
  ];
  oneTour = {
    _id: tourId,
    name: 'The Hunza Valley Explorer',
    slug: 'the-hunza-valley-explorer',
    summary: 'Seven relaxed days.',
    description: 'Start in Karimabad.',
    duration: 7,
    maxGroupSize: 12,
    difficulty: 'medium',
    price: 95000,
    secretTour: true,
    startDates: [new Date('2027-09-18'), new Date('2027-04-15')],
    startLocation: { type: 'Point', coordinates: [74.6614, 36.3269], address: 'Karimabad, Hunza' },
    locations: [{ type: 'Point', coordinates: [74.6614, 36.3269], description: 'Baltit Fort', day: 1 }, { type: 'Point', coordinates: [74.9, 36.4], description: 'Attabad Lake', day: 2 }],
    guides: [guideId],
    imageCover: coverId,
    images: ['64b7f0c2a1b2c3d4e5f6e002', '64b7f0c2a1b2c3d4e5f6e003'],
  };
  guideList = [{ _id: guideId, name: 'Imran Baig', role: 'lead-guide' }, { _id: '64b7f0c2a1b2c3d4e5f6a002', name: 'Zainab Karim', role: 'guide' }];
  bookingGroups = [{ _id: 'paid', count: 5, amount: 475000 }, { _id: 'pending', count: 2, amount: 100000 }, { _id: 'cancelled', count: 1, amount: 50000 }];
  recentBookings = [
    { _id: 'b1', user: { name: 'Ayesha Khan', email: 'a@example.com' }, tourName: 'The Hunza Valley Explorer', startDate: new Date('2027-04-15'), amount: 190000, status: 'paid' },
    { _id: 'b2', user: null, tourName: 'Skardu Lakes', startDate: new Date('2027-05-01'), amount: 80000, status: 'pending' },
  ];
});

describe('who may open the admin pages', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const paths = ['/admin', '/admin/tours', '/admin/tours/new', '/admin/tours/' + tourId];
  const get = (path, h) => fetch(site.baseUrl + path, { headers: h === undefined ? headers() : h, redirect: 'manual' });

  it('sends a visitor who is not logged in to the login page', async () => {
    for (const path of paths) {
      const reply = await get(path, {});
      assert.equal(reply.status, 302, path);
      assert.equal(reply.headers.get('location'), '/login', path);
    }
  });

  it('refuses a user and a guide with 403', async () => {
    for (const role of ['user', 'guide']) {
      currentUser = makeUser(role);
      for (const path of paths) {
        const reply = await get(path);
        assert.equal(reply.status, 403, role + ' ' + path);
        assert.ok((await reply.text()).includes('do not have permission'));
      }
    }
  });

  it('lets in an admin and a lead-guide', async () => {
    for (const role of ['admin', 'lead-guide']) {
      currentUser = makeUser(role);
      for (const path of paths) {
        assert.equal((await get(path)).status, 200, role + ' ' + path);
      }
    }
  });

  it('shows the Admin link in the header to the staff only', async () => {
    assert.ok((await (await get('/admin')).text()).includes('href="/admin"'));
    currentUser = makeUser('user');
    const reply = await fetch(site.baseUrl + '/forgot-password', { headers: headers(), redirect: 'manual' });
    // A logged-in user goes from this page to the home page. We only need a page with the header, so use the terms page.
    const terms = await (await fetch(site.baseUrl + '/terms', { headers: headers() })).text();
    assert.ok(reply.status === 302 || reply.status === 200);
    assert.ok(terms.includes('href="/my-tours"'));
    assert.ok(!terms.includes('href="/admin"'));
  });
});

describe('the dashboard', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('shows the numbers, the total of the paid bookings, and the newest bookings', async () => {
    const reply = await fetch(site.baseUrl + '/admin', { headers: headers() });
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    assert.ok(html.includes('<div class="stat__number">8</div>'), 'tours');
    assert.ok(html.includes('6 visible, 2 hidden'));
    assert.ok(html.includes('<div class="stat__number">12</div>'), 'users');
    assert.ok(html.includes('<div class="stat__number">5</div>'), 'paid bookings');
    assert.ok(html.includes('2 waiting, 1 cancelled'));
    assert.ok(html.includes('475,000'));
    assert.ok(html.includes('Ayesha Khan'));
    assert.ok(html.includes('(closed account)'));
    assert.ok(html.includes('badge--paid'));
    assert.ok(html.includes('href="/admin/tours/new"'));
  });

  it('counts the hidden tours too, and leaves closed accounts out', async () => {
    await fetch(site.baseUrl + '/admin', { headers: headers() });
    assert.ok(optionCalls.length >= 2 && optionCalls.every((options) => options.includeSecret === true));
    assert.deepEqual(counts.find((entry) => entry.model === 'user').filter, { active: { $ne: false } });
  });

  it('says so when there are no bookings', async () => {
    recentBookings = [];
    bookingGroups = [];
    const html = await (await fetch(site.baseUrl + '/admin', { headers: headers() })).text();
    assert.ok(html.includes('No bookings yet.'));
    assert.ok(html.includes('<div class="stat__number">0</div>'));
  });
});

describe('the list of tours', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const getList = async () => (await fetch(site.baseUrl + '/admin/tours', { headers: headers() })).text();

  it('asks for the hidden tours too, and shows every tour with its status', async () => {
    const html = await getList();
    assert.ok(optionCalls.some((options) => options.includeSecret === true));
    assert.ok(html.includes('The Hunza Valley Explorer'));
    assert.ok(html.includes('Hidden Draft Tour'));
    assert.ok(html.includes('badge--hidden'));
    assert.ok(html.includes('badge--paid'));
    assert.ok(html.includes('src="/img/' + coverId + '"'));
    assert.ok(html.includes('table__thumb--empty'));
    assert.ok(html.includes('src="/js/admin-tours.js"'));
  });

  it('has the right buttons for each tour: Hide or Show, Delete, and View only for a visible tour', async () => {
    const html = await getList();
    assert.ok(html.includes('data-toggle-hidden="' + tourId + '" data-hidden="false">Hide</button>'));
    assert.ok(html.includes('data-toggle-hidden="64b7f0c2a1b2c3d4e5f60002" data-hidden="true">Show</button>'));
    assert.equal(count(html, 'data-delete-tour='), 2);
    assert.equal(count(html, 'target="_blank"'), 1);
    assert.ok(html.includes('href="/tours/the-hunza-valley-explorer"'));
    assert.ok(html.includes('href="/admin/tours/' + tourId + '"'));
  });

  it('says so when there are no tours, and turns HTML in a name into harmless text', async () => {
    tourList = [];
    assert.ok((await getList()).includes('There are no tours yet.'));
    tourList = [Object.assign({}, oneTour, { name: '<b>x</b>', secretTour: false, startDates: [] })];
    const html = await getList();
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  });
});

describe('the tour form', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const getPage = async (path) => {
    const reply = await fetch(site.baseUrl + path, { headers: headers() });
    return { status: reply.status, html: await reply.text() };
  };

  it('the new tour form is empty, makes no delete button, and lists the guides', async () => {
    const page = await getPage('/admin/tours/new');
    assert.equal(page.status, 200);
    assert.ok(page.html.includes('Add a tour'));
    assert.ok(page.html.includes('id="tour-form"'));
    assert.ok(page.html.includes('data-tour-id=""'));
    for (const name of ['name', 'summary', 'description', 'duration', 'maxGroupSize', 'difficulty', 'price', 'secretTour', 'startDates', 'startAddress', 'startLat', 'startLng', 'guides', 'imageCover', 'images']) {
      assert.ok(page.html.includes('name="' + name + '"'), name);
    }
    assert.ok(page.html.includes('Imran Baig (lead-guide)'));
    assert.ok(page.html.includes('Zainab Karim (guide)'));
    assert.ok(!page.html.includes('data-delete-tour'));
    assert.ok(page.html.includes('<template id="stop-template">'));
    assert.ok(page.html.includes('src="/js/admin-tours.js"'));
  });

  it('the edit form shows the tour: values, dates, start point, stops, ticked guide, pictures, delete button', async () => {
    const page = await getPage('/admin/tours/' + tourId);
    assert.equal(page.status, 200);
    assert.ok(optionCalls.some((options) => options.includeSecret === true), 'a hidden tour must be found too');
    assert.ok(page.html.includes('Change the tour'));
    assert.ok(page.html.includes('data-tour-id="' + tourId + '"'));
    assert.ok(page.html.includes('value="The Hunza Valley Explorer"'));
    assert.ok(page.html.includes('>Seven relaxed days.</textarea>'));
    assert.ok(page.html.includes('>2027-04-15\n2027-09-18</textarea>'));
    assert.ok(page.html.includes('<option value="medium" selected>Medium</option>'));
    assert.ok(/name="secretTour" checked/.test(page.html));
    assert.ok(page.html.includes('value="36.3269"'));
    assert.ok(page.html.includes('value="74.6614"'));
    // Two saved stops and one blank stop inside the template.
    assert.equal(count(page.html, 'class="stop"'), 3);
    assert.ok(page.html.includes('value="Baltit Fort"'));
    assert.ok(page.html.includes('value="Attabad Lake"'));
    assert.ok(new RegExp('value="' + guideId + '" checked').test(page.html));
    assert.ok(!new RegExp('value="64b7f0c2a1b2c3d4e5f6a002" checked').test(page.html));
    assert.ok(page.html.includes('src="/img/' + coverId + '"'));
    assert.ok(page.html.includes('src="/img/64b7f0c2a1b2c3d4e5f6e003"'));
    assert.ok(page.html.includes('data-delete-tour="' + tourId + '"'));
  });

  it('answers 404 for a bad id and for a tour that does not exist', async () => {
    assert.equal((await getPage('/admin/tours/abc')).status, 404);
    oneTour = null;
    assert.equal((await getPage('/admin/tours/' + tourId)).status, 404);
  });

  it('turns HTML in the values into harmless text', async () => {
    oneTour.name = '"><script>alert(1)</script>';
    oneTour.summary = '<b>bold</b>';
    const page = await getPage('/admin/tours/' + tourId);
    assert.ok(!page.html.includes('<script>alert(1)'));
    assert.ok(!page.html.includes('<b>bold</b>'));
  });
});

describe('the pictures of a hidden tour', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('the staff can add pictures to a hidden tour: the pictures route asks for hidden tours too', async () => {
    const fakeTour = { _id: tourId, name: 'Hidden Draft Tour', imageCover: undefined, images: [], saves: 0 };
    fakeTour.save = async () => {
      fakeTour.saves++;
    };
    optionCalls.length = 0;
    const form = new FormData();
    const bytes = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#336699' } }).png().toBuffer();
    form.append('imageCover', new Blob([bytes], { type: 'image/png' }), 'cover.png');
    oneTour = fakeTour;
    const reply = await fetch(site.baseUrl + '/api/v1/tours/' + tourId + '/images', { method: 'PATCH', body: form, headers: headers() });
    assert.equal(reply.status, 200);
    assert.ok(optionCalls.some((options) => options.includeSecret === true));
    assert.equal(fakeTour.imageCover, coverId);
    assert.equal(fakeTour.saves, 1);
  });
});

describe('deleting a tour', () => {
  let site;
  let deleted;
  const reviewDeletes = [];
  before(async () => {
    mock.method(Tour, 'findByIdAndDelete', async () => deleted);
    mock.method(Review, 'deleteMany', async (filter) => {
      reviewDeletes.push(filter);
    });
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  beforeEach(() => {
    reviewDeletes.length = 0;
  });
  const remove = () => fetch(site.baseUrl + '/api/v1/tours/' + tourId, { method: 'DELETE', headers: headers() });

  it('removes the reviews and ALL the pictures of the tour (cover and gallery)', async () => {
    deleted = { _id: tourId, imageCover: coverId, images: ['64b7f0c2a1b2c3d4e5f6e002', '64b7f0c2a1b2c3d4e5f6e003'] };
    const reply = await remove();
    assert.equal(reply.status, 204);
    assert.deepEqual(reviewDeletes, [{ tour: tourId }]);
    assert.deepEqual(deletedImages, [{ _id: coverId }, { _id: '64b7f0c2a1b2c3d4e5f6e002' }, { _id: '64b7f0c2a1b2c3d4e5f6e003' }]);
  });

  it('works for a tour that has no pictures', async () => {
    deleted = { _id: tourId };
    assert.equal((await remove()).status, 204);
    assert.equal(deletedImages.length, 0);
  });

  it('removes nothing when there is no such tour', async () => {
    deleted = null;
    assert.equal((await remove()).status, 404);
    assert.equal(deletedImages.length, 0);
    assert.equal(reviewDeletes.length, 0);
  });
});
