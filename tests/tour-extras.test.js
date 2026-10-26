// tests/tour-extras.test.js - guides, slug and pictures in the tour API (create, update, one tour, the pictures route).
// No database: the searches and the picture storage are replaced by fakes. The pictures are made by the real sharp.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const Tour = require('../models/tourModel');
const User = require('../models/userModel');
const Image = require('../models/imageModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const staffId = '64b7f0c2a1b2c3d4e5f6bbbb';
const tourId = '64b7f0c2a1b2c3d4e5f60001';
const guideOne = '64b7f0c2a1b2c3d4e5f6a001';
const guideTwo = '64b7f0c2a1b2c3d4e5f6a002';
const oldCover = '64b7f0c2a1b2c3d4e5f6d001';
const oldA = '64b7f0c2a1b2c3d4e5f6d002';
const oldB = '64b7f0c2a1b2c3d4e5f6d003';
const newIds = ['64b7f0c2a1b2c3d4e5f6e001', '64b7f0c2a1b2c3d4e5f6e002', '64b7f0c2a1b2c3d4e5f6e003', '64b7f0c2a1b2c3d4e5f6e004'];

let currentUser;
let currentTour;
let foundGuides;
const created = [];
const updates = [];
const populated = [];
const userSearches = [];
const createdImages = [];
const deletedImages = [];
let imageCounter = 0;

function makeUser(role) {
  return { _id: staffId, name: 'Staff', role: role, changedPasswordAfter: () => false };
}

function makeTour() {
  const tour = { _id: tourId, name: 'The Hunza Valley Explorer', imageCover: oldCover, images: [oldA, oldB], saves: 0 };
  tour.save = async () => {
    tour.saves++;
  };
  return tour;
}

// A pretend search result that can be waited for, and also has populate() and lean().
function searchResult(value) {
  return {
    populate: (options) => {
      populated.push(options);
      return Promise.resolve(value);
    },
    lean: () => Promise.resolve(value),
    then: (done, failed) => Promise.resolve(value).then(done, failed),
  };
}

const loginHeaders = () => ({ Cookie: cookieName + '=' + signToken(staffId) });
const json = (body) => ({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, loginHeaders()), body: JSON.stringify(body) });
const pngBytes = () => sharp({ create: { width: 300, height: 200, channels: 3, background: '#336699' } }).png().toBuffer();

before(() => {
  mock.method(User, 'findById', async () => currentUser);
  mock.method(User, 'find', (filter) => {
    userSearches.push(filter);
    return { select: () => Promise.resolve(foundGuides) };
  });
  mock.method(Tour, 'create', async (body) => {
    created.push(body);
    return { _id: tourId, name: body.name };
  });
  mock.method(Tour, 'findByIdAndUpdate', async (id, changes) => {
    updates.push({ id: id, changes: changes });
    return { _id: id, name: 'updated' };
  });
  mock.method(Tour, 'findById', () => searchResult(currentTour));
  mock.method(Image, 'create', async (doc) => {
    createdImages.push(doc);
    return { _id: newIds[imageCounter++] };
  });
  mock.method(Image, 'deleteOne', async (filter) => {
    deletedImages.push(filter);
  });
});
after(() => {
  mock.restoreAll();
});
beforeEach(() => {
  currentUser = makeUser('admin');
  currentTour = makeTour();
  foundGuides = [{ _id: guideOne }, { _id: guideTwo }];
  created.length = 0;
  updates.length = 0;
  populated.length = 0;
  userSearches.length = 0;
  createdImages.length = 0;
  deletedImages.length = 0;
  imageCounter = 0;
});

describe('creating a tour with guides', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const create = (body) => fetch(site.baseUrl + '/api/v1/tours', json(body));

  it('accepts guides that exist and have the role guide or lead-guide', async () => {
    const reply = await create({ name: 'New tour', guides: [guideOne, guideTwo] });
    assert.equal(reply.status, 201);
    assert.deepEqual(created[0].guides, [guideOne, guideTwo]);
    assert.deepEqual(userSearches[0], { _id: { $in: [guideOne, guideTwo] }, role: { $in: ['guide', 'lead-guide'] } });
  });

  it('counts a guide that is listed twice once', async () => {
    foundGuides = [{ _id: guideOne }];
    const reply = await create({ name: 'New tour', guides: [guideOne, guideOne.toUpperCase()] });
    assert.equal(reply.status, 201);
  });

  it('refuses a guide that does not exist, or is not a guide', async () => {
    foundGuides = [{ _id: guideOne }];
    const reply = await create({ name: 'New tour', guides: [guideOne, guideTwo] });
    assert.equal(reply.status, 400);
    assert.ok((await reply.json()).message.includes('Every guide must be an existing user'));
    assert.equal(created.length, 0);
  });

  it('refuses guides that are not a list of ids, or more than 5', async () => {
    const bad = ['not-a-list', [5], ['abc'], new Array(6).fill(guideOne)];
    for (let i = 0; i < bad.length; i++) {
      const reply = await create({ name: 'New tour', guides: bad[i] });
      assert.equal(reply.status, 400, JSON.stringify(bad[i]));
      assert.ok((await reply.json()).message.includes('guides must be a list'));
    }
    // An operator like {"$gt": ""} is stopped even earlier, by the guard of the whole API.
    assert.equal((await create({ name: 'New tour', guides: [{ $gt: '' }] })).status, 400);
    assert.equal(created.length, 0);
    assert.equal(userSearches.length, 0);
  });

  it('creates a tour without guides without any search of users', async () => {
    const reply = await create({ name: 'New tour' });
    assert.equal(reply.status, 201);
    assert.equal(userSearches.length, 0);
  });

  it('refuses to set the slug or the pictures by hand', async () => {
    const fields = { slug: 'my-slug', imageCover: oldCover, images: [oldA] };
    const names = Object.keys(fields);
    for (let i = 0; i < names.length; i++) {
      const body = { name: 'New tour' };
      body[names[i]] = fields[names[i]];
      const reply = await create(body);
      assert.equal(reply.status, 400, names[i]);
      assert.ok((await reply.json()).message.startsWith('You cannot set ' + names[i] + ' by hand'));
    }
    assert.equal(created.length, 0);
  });

  it('is only for staff', async () => {
    currentUser = makeUser('user');
    assert.equal((await create({ name: 'New tour' })).status, 403);
  });
});

describe('updating a tour', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  const update = (body) => fetch(site.baseUrl + '/api/v1/tours/' + tourId, Object.assign(json(body), { method: 'PATCH' }));

  it('makes a new slug when the name changes', async () => {
    const reply = await update({ name: 'The New Name!' });
    assert.equal(reply.status, 200);
    assert.equal(updates[0].changes.slug, 'the-new-name');
    assert.equal(updates[0].changes.name, 'The New Name!');
  });

  it('leaves the slug alone when the name does not change', async () => {
    await update({ price: 100 });
    assert.equal(updates[0].changes.slug, undefined);
    assert.deepEqual(updates[0].changes, { price: 100 });
  });

  it('checks the guides and refuses the slug and pictures by hand', async () => {
    foundGuides = [];
    assert.equal((await update({ guides: [guideOne] })).status, 400);
    assert.equal((await update({ slug: 'x' })).status, 400);
    assert.equal((await update({ images: [oldA] })).status, 400);
    assert.equal(updates.length, 0);
  });
});

describe('GET /api/v1/tours/:id', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('brings the guides with the tour: only name, photo and role', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/tours/' + tourId);
    assert.equal(reply.status, 200);
    assert.deepEqual(populated, [{ path: 'guides', select: 'name photo role' }]);
  });
});

describe('PATCH /api/v1/tours/:id/images', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  // Each part is { name, bytes, type } for a file or { name, text } for a text field.
  function makeForm(parts) {
    const form = new FormData();
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].text !== undefined) {
        form.append(parts[i].name, parts[i].text);
      } else {
        form.append(parts[i].name, new Blob([parts[i].bytes], { type: parts[i].type || 'image/png' }), 'file.png');
      }
    }
    return form;
  }
  const upload = (form, headers) => fetch(site.baseUrl + '/api/v1/tours/' + tourId + '/images', { method: 'PATCH', body: form, headers: headers === undefined ? loginHeaders() : headers });

  it('saves the cover and the gallery as new pictures, and removes the old ones', async () => {
    const bytes = await pngBytes();
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: bytes }, { name: 'images', bytes: bytes }, { name: 'images', bytes: bytes }]));
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.data.tour.imageCover, newIds[0]);
    assert.deepEqual(body.data.tour.images, [newIds[1], newIds[2]]);
    assert.equal(currentTour.saves, 1);

    assert.equal(createdImages.length, 3);
    const cover = await sharp(createdImages[0].data).metadata();
    assert.equal(cover.width, 1400);
    assert.equal(cover.height, 900);
    assert.equal(cover.format, 'jpeg');
    const gallery = await sharp(createdImages[1].data).metadata();
    assert.equal(gallery.width, 1200);
    assert.equal(gallery.height, 800);
    assert.equal(createdImages[0].contentType, 'image/jpeg');

    assert.deepEqual(deletedImages, [{ _id: oldCover }, { _id: oldA }, { _id: oldB }]);
  });

  it('changes only the cover when only a cover is sent', async () => {
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: await pngBytes() }]));
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.data.tour.imageCover, newIds[0]);
    assert.deepEqual(body.data.tour.images, [oldA, oldB]);
    assert.deepEqual(deletedImages, [{ _id: oldCover }]);
  });

  it('is only for staff who are logged in', async () => {
    const bytes = await pngBytes();
    assert.equal((await upload(makeForm([{ name: 'imageCover', bytes: bytes }]), {})).status, 401);
    currentUser = makeUser('user');
    assert.equal((await upload(makeForm([{ name: 'imageCover', bytes: bytes }]))).status, 403);
    currentUser = makeUser('guide');
    assert.equal((await upload(makeForm([{ name: 'imageCover', bytes: bytes }]))).status, 403);
    assert.equal(createdImages.length, 0);
  });

  it('refuses a request with no files', async () => {
    const reply = await upload(new FormData());
    assert.equal(reply.status, 400);
    assert.ok((await reply.json()).message.includes('imageCover'));
  });

  it('answers 404 for an unknown tour, before it makes any picture', async () => {
    currentTour = null;
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: await pngBytes() }]));
    assert.equal(reply.status, 404);
    assert.equal(createdImages.length, 0);
  });

  it('saves nothing when one of the files is not a picture', async () => {
    const bytes = await pngBytes();
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: bytes }, { name: 'images', bytes: Buffer.from('not a picture') }]));
    assert.equal(reply.status, 400);
    assert.equal(createdImages.length, 0);
    assert.equal(currentTour.saves, 0);
    assert.equal(deletedImages.length, 0);
  });

  it('refuses a fourth gallery picture, another field name, and text fields', async () => {
    const bytes = await pngBytes();
    const four = [1, 2, 3, 4].map(() => ({ name: 'images', bytes: bytes }));
    assert.equal((await upload(makeForm(four))).status, 400);
    assert.equal((await upload(makeForm([{ name: 'photo', bytes: bytes }]))).status, 400);
    assert.equal((await upload(makeForm([{ name: 'name', text: 'x' }, { name: 'imageCover', bytes: bytes }]))).status, 400);
    assert.equal(createdImages.length, 0);
  });

  it('refuses a file over 5 MB with 413', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: big }]));
    assert.equal(reply.status, 413);
    assert.equal(createdImages.length, 0);
  });

  it('removes the new pictures when the tour cannot be saved, and keeps the old ones', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    currentTour.save = async () => {
      throw new Error('the database is down');
    };
    const reply = await upload(makeForm([{ name: 'imageCover', bytes: await pngBytes() }]));
    errorMock.mock.restore();
    assert.equal(reply.status, 500);
    assert.deepEqual(deletedImages, [{ _id: newIds[0] }]);
  });
});
