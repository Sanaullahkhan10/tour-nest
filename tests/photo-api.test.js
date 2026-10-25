// tests/photo-api.test.js - uploading and removing the photo, the pictures route, and the pages with the photo.
// No database: the user search and the picture storage are replaced by fakes. The pictures are made by the real sharp.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const User = require('../models/userModel');
const Image = require('../models/imageModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6bbbb';
const newId = '64b7f0c2a1b2c3d4e5f6cccc';
const oldId = '64b7f0c2a1b2c3d4e5f6dddd';

let currentUser;
const created = [];
const deleted = [];
const looked = [];
let savedImage = null;

// A pretend user. save() only counts how often it was called.
function makeUser(photo) {
  const user = {
    _id: userId,
    name: 'Ayesha Khan',
    email: 'ayesha@example.com',
    role: 'user',
    photo: photo || 'default.jpg',
    saves: 0,
    changedPasswordAfter: () => false,
    save: async () => {
      user.saves++;
    },
  };
  return user;
}

const loginHeaders = () => ({ Cookie: cookieName + '=' + signToken(userId) });

function pngBytes() {
  return sharp({ create: { width: 120, height: 80, channels: 3, background: '#336699' } }).png().toBuffer();
}

// A form with parts. Each part is { name, bytes, type, fileName } (a file) or { name, text } (a text field).
function makeForm(parts) {
  const form = new FormData();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.text !== undefined) {
      form.append(part.name, part.text);
    } else {
      form.append(part.name, new Blob([part.bytes], { type: part.type }), part.fileName || 'file.bin');
    }
  }
  return form;
}

before(() => {
  mock.method(User, 'findById', async () => currentUser);
  mock.method(Image, 'create', async (doc) => {
    created.push(doc);
    return { _id: newId };
  });
  mock.method(Image, 'deleteOne', async (filter) => {
    deleted.push(filter);
  });
  mock.method(Image, 'findById', async (id) => {
    looked.push(id);
    return id === newId ? savedImage : null;
  });
});
after(() => {
  mock.restoreAll();
});
beforeEach(() => {
  currentUser = makeUser();
  created.length = 0;
  deleted.length = 0;
  looked.length = 0;
});

describe('PATCH /api/v1/users/updateMyPhoto', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  function upload(form, headers) {
    return fetch(site.baseUrl + '/api/v1/users/updateMyPhoto', { method: 'PATCH', body: form, headers: headers === undefined ? loginHeaders() : headers });
  }
  const goodForm = async () => makeForm([{ name: 'photo', bytes: await pngBytes(), type: 'image/png', fileName: 'me.png' }]);

  it('refuses a visitor who is not logged in', async () => {
    const reply = await upload(await goodForm(), {});
    assert.equal(reply.status, 401);
    assert.equal(created.length, 0);
  });

  it('saves a small square JPEG, never the original, and gives the user its id', async () => {
    const reply = await upload(await goodForm());
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(body.data.user.photo, newId);
    assert.equal(currentUser.photo, newId);
    assert.equal(currentUser.saves, 1);

    assert.equal(created.length, 1);
    assert.equal(created[0].contentType, 'image/jpeg');
    const info = await sharp(created[0].data).metadata();
    assert.equal(info.format, 'jpeg');
    assert.equal(info.width, 400);
    assert.equal(info.height, 400);
    // A first photo: there was no saved picture to remove.
    assert.equal(deleted.length, 0);
  });

  it('removes the old picture when a new one replaces it', async () => {
    currentUser = makeUser(oldId);
    const reply = await upload(await goodForm());
    assert.equal(reply.status, 200);
    assert.deepEqual(deleted, [{ _id: oldId }]);
  });

  it('does not keep the new picture when the user cannot be saved', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    currentUser.save = async () => {
      throw new Error('the database is down');
    };
    const reply = await upload(await goodForm());
    assert.equal(reply.status, 500);
    assert.deepEqual(deleted, [{ _id: newId }]);
    errorMock.mock.restore();
  });

  it('asks for a photo when the request has no file (a JSON body, or an empty form)', async () => {
    const asJson = await fetch(site.baseUrl + '/api/v1/users/updateMyPhoto', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, loginHeaders()),
      body: '{}',
    });
    assert.equal(asJson.status, 400);
    assert.ok((await asJson.json()).message.startsWith('Please send a photo'));

    const emptyForm = await upload(new FormData());
    assert.equal(emptyForm.status, 400);
    assert.equal(created.length, 0);
  });

  it('refuses a file that is not a picture, even when it says it is a PNG', async () => {
    const form = makeForm([{ name: 'photo', bytes: Buffer.from('just some text'), type: 'image/png', fileName: 'me.png' }]);
    const reply = await upload(form);
    assert.equal(reply.status, 400);
    assert.ok((await reply.json()).message.includes('could not read that file'));
    assert.equal(created.length, 0);
  });

  it('refuses an SVG file', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    const reply = await upload(makeForm([{ name: 'photo', bytes: svg, type: 'image/svg+xml', fileName: 'me.svg' }]));
    assert.equal(reply.status, 400);
    assert.equal(created.length, 0);
  });

  it('refuses a file over 5 MB with 413', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const reply = await upload(makeForm([{ name: 'photo', bytes: big, type: 'image/png', fileName: 'big.png' }]));
    assert.equal(reply.status, 413);
    assert.ok((await reply.json()).message.includes('5 MB'));
    assert.equal(created.length, 0);
  });

  it('refuses a file in a field with another name', async () => {
    const reply = await upload(makeForm([{ name: 'file', bytes: await pngBytes(), type: 'image/png', fileName: 'me.png' }]));
    assert.equal(reply.status, 400);
    assert.equal(created.length, 0);
  });

  it('refuses two files, and refuses text fields next to the file', async () => {
    const bytes = await pngBytes();
    const two = await upload(
      makeForm([
        { name: 'photo', bytes: bytes, type: 'image/png', fileName: 'a.png' },
        { name: 'photo', bytes: bytes, type: 'image/png', fileName: 'b.png' },
      ])
    );
    assert.equal(two.status, 400);

    const withField = await upload(
      makeForm([
        { name: 'role', text: 'admin' },
        { name: 'photo', bytes: bytes, type: 'image/png', fileName: 'a.png' },
      ])
    );
    assert.equal(withField.status, 400);
    assert.equal(created.length, 0);
    assert.equal(currentUser.role, 'user');
  });

  it('updateMe can no longer be used to set the photo to any id', async () => {
    const reply = await fetch(site.baseUrl + '/api/v1/users/updateMe', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, loginHeaders()),
      body: JSON.stringify({ photo: oldId }),
    });
    assert.equal(reply.status, 400);
    assert.equal(currentUser.photo, 'default.jpg');
  });
});

describe('DELETE /api/v1/users/deleteMyPhoto', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  const remove = (headers) => fetch(site.baseUrl + '/api/v1/users/deleteMyPhoto', { method: 'DELETE', headers: headers === undefined ? loginHeaders() : headers });

  it('refuses a visitor who is not logged in', async () => {
    assert.equal((await remove({})).status, 401);
  });

  it('goes back to the plain avatar and removes the saved picture', async () => {
    currentUser = makeUser(oldId);
    const reply = await remove();
    const body = await reply.json();
    assert.equal(reply.status, 200);
    assert.equal(body.data.user.photo, 'default.jpg');
    assert.equal(currentUser.saves, 1);
    assert.deepEqual(deleted, [{ _id: oldId }]);
  });

  it('removes nothing when the user has no saved photo', async () => {
    const reply = await remove();
    assert.equal(reply.status, 200);
    assert.equal(deleted.length, 0);
  });
});

describe('GET /img/:id', () => {
  let site;
  before(async () => {
    savedImage = { contentType: 'image/jpeg', data: Buffer.from('pretend-jpeg-bytes') };
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('sends the saved picture, and lets the browser keep it', async () => {
    const reply = await fetch(site.baseUrl + '/img/' + newId);
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('content-type'), 'image/jpeg');
    assert.ok(reply.headers.get('cache-control').includes('immutable'));
    assert.equal(reply.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Buffer.from(await reply.arrayBuffer()).toString(), 'pretend-jpeg-bytes');
  });

  it('answers 404 for an unknown picture', async () => {
    const reply = await fetch(site.baseUrl + '/img/' + oldId);
    assert.equal(reply.status, 404);
  });

  it('answers 404 for a badly shaped id without asking the database', async () => {
    for (const bad of ['abc', 'A'.repeat(24), 'g'.repeat(24), 'a'.repeat(25)]) {
      const reply = await fetch(site.baseUrl + '/img/' + bad);
      assert.equal(reply.status, 404, bad);
    }
    assert.equal(looked.length, 0);
  });

  it('still serves the plain avatar from the public folder', async () => {
    const reply = await fetch(site.baseUrl + '/img/default-user.svg');
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').includes('svg'));
    assert.equal(looked.length, 0);
  });
});

describe('the pages with the photo', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  const getMe = () => fetch(site.baseUrl + '/me', { headers: loginHeaders() });

  it('the account page has the photo form and shows the plain avatar at first', async () => {
    const html = await (await getMe()).text();
    assert.ok(html.includes('id="photo-form"'));
    assert.ok(html.includes('enctype="multipart/form-data"'));
    assert.ok(html.includes('type="file"'));
    assert.ok(html.includes('accept="image/jpeg,image/png,image/webp"'));
    assert.ok(html.includes('data-remove-photo'));
    assert.ok(html.includes('data-photo-preview'));
    assert.ok(html.includes('src="/img/default-user.svg"'));
  });

  it('shows the saved photo in the account page and in the header', async () => {
    currentUser = makeUser(oldId);
    const html = await (await getMe()).text();
    assert.equal(html.split('src="/img/' + oldId + '"').length - 1, 2);
    assert.ok(html.includes('data-user-photo'));
  });

  it('a visitor who is not logged in sees no photo in the header', async () => {
    const html = await (await fetch(site.baseUrl + '/login')).text();
    assert.ok(!html.includes('data-user-photo'));
  });
});
