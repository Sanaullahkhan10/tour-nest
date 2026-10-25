// tests/password-reset.test.js - "forgot password" and "reset password" (the API and the two pages),
// and the welcome email after signup. No database and no mail service: both are replaced by fakes.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
process.env.SITE_URL = 'https://example.test';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/userModel');
const emailService = require('../utils/email');
const { hashToken, looksLikeToken } = require('../utils/resetToken');
const { signToken, cookieName } = require('../utils/token');
const { startApp, send } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6aaaa';
const goodToken = 'ab12'.repeat(16);

// A pretend database search. It can be waited for, and it has select(), like a real one.
function query(result) {
  return {
    select: () => Promise.resolve(result),
    then: (done, failed) => Promise.resolve(result).then(done, failed),
  };
}

describe('POST /api/v1/users/forgotPassword', () => {
  let site;
  let currentUser;
  const searches = [];
  const updates = [];
  const sent = [];

  before(async () => {
    mock.method(User, 'findOne', (filter) => {
      searches.push(filter);
      return query(currentUser);
    });
    mock.method(User, 'updateOne', async (filter, change) => {
      updates.push({ filter: filter, change: change });
    });
    mock.method(emailService, 'sendPasswordResetEmail', async (user, link) => {
      sent.push({ user: user, link: link });
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    searches.length = 0;
    updates.length = 0;
    sent.length = 0;
    currentUser = { _id: userId, name: 'Ayesha', email: 'ayesha@example.com' };
  });

  async function ask(body) {
    const reply = await send(site.baseUrl, '/api/v1/users/forgotPassword', 'POST', JSON.stringify(body));
    // The email is sent in the background, so we give it a moment to run.
    await new Promise((resolve) => setImmediate(resolve));
    return reply;
  }

  it('saves only the hash of the token, and emails the real token inside a link of our own site', async () => {
    const reply = await ask({ email: 'ayesha@example.com' });
    assert.equal(reply.status, 200);
    assert.equal(reply.json.status, 'success');

    assert.equal(sent.length, 1);
    const prefix = 'https://example.test/reset-password/';
    assert.ok(sent[0].link.startsWith(prefix));
    const token = sent[0].link.slice(prefix.length);
    assert.ok(looksLikeToken(token));

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, { _id: userId });
    assert.equal(updates[0].change.passwordResetToken, hashToken(token));
    assert.notEqual(updates[0].change.passwordResetToken, token);
    const minutes = (updates[0].change.passwordResetExpires.getTime() - Date.now()) / 60000;
    assert.ok(minutes > 9.5 && minutes <= 10);
  });

  it('gives the very same answer when the email has no account, and sends nothing', async () => {
    const known = await ask({ email: 'ayesha@example.com' });
    currentUser = null;
    searches.length = 0;
    updates.length = 0;
    sent.length = 0;
    const unknown = await ask({ email: 'nobody@example.com' });
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.json, known.json);
    assert.equal(updates.length, 0);
    assert.equal(sent.length, 0);
  });

  it('searches with the email in small letters and without spaces', async () => {
    await ask({ email: '  Ayesha@Example.COM ' });
    assert.deepEqual(searches[0], { email: 'ayesha@example.com' });
  });

  it('sends no second email when a link was made less than a minute ago', async () => {
    currentUser.passwordResetExpires = new Date(Date.now() + 9.5 * 60000);
    const reply = await ask({ email: 'ayesha@example.com' });
    assert.equal(reply.status, 200);
    assert.equal(updates.length, 0);
    assert.equal(sent.length, 0);
  });

  it('sends a new email when the last link is older than a minute', async () => {
    currentUser.passwordResetExpires = new Date(Date.now() + 5 * 60000);
    await ask({ email: 'ayesha@example.com' });
    assert.equal(sent.length, 1);
  });

  it('still answers 200 when the email cannot be sent', async () => {
    mock.method(console, 'error', () => {});
    const original = emailService.sendPasswordResetEmail;
    emailService.sendPasswordResetEmail = async () => {
      throw new Error('the mail service is down');
    };
    const reply = await ask({ email: 'ayesha@example.com' });
    emailService.sendPasswordResetEmail = original;
    assert.equal(reply.status, 200);
  });

  it('refuses a missing, empty or not-text email, and does not search', async () => {
    assert.equal((await ask({})).status, 400);
    assert.equal((await ask({ email: '' })).status, 400);
    const notText = await ask({ email: { a: 1 } });
    assert.equal(notText.status, 400);
    assert.equal(notText.json.message, 'email must be text');
    assert.equal(searches.length, 0);
  });

  it('refuses an operator like {"$gt": ""} in place of the email', async () => {
    const reply = await send(site.baseUrl, '/api/v1/users/forgotPassword', 'POST', '{"email":{"$gt":""}}');
    assert.equal(reply.status, 400);
    assert.equal(searches.length, 0);
  });
});

describe('PATCH /api/v1/users/resetPassword/:token', () => {
  let site;
  let found;
  const searches = [];

  // A pretend user from the database. save() is a fake that counts how often it was called.
  function pretendUser() {
    const user = {
      _id: userId,
      name: 'Ayesha',
      email: 'ayesha@example.com',
      passwordResetToken: 'the-hash',
      passwordResetExpires: new Date(),
      saved: 0,
      save: async () => {
        user.saved++;
      },
    };
    return user;
  }

  before(async () => {
    mock.method(User, 'findOne', (filter) => {
      searches.push(filter);
      return query(found);
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    searches.length = 0;
    found = pretendUser();
  });

  function reset(token, body) {
    return send(site.baseUrl, '/api/v1/users/resetPassword/' + token, 'PATCH', JSON.stringify(body));
  }
  const goodBody = { password: 'new-pass-123', passwordConfirm: 'new-pass-123' };

  it('sets the new password, removes the link, and logs the visitor in', async () => {
    const user = found;
    const reply = await reset(goodToken, goodBody);
    assert.equal(reply.status, 200);
    assert.equal(reply.json.status, 'success');
    assert.ok(reply.headers.get('set-cookie').includes(cookieName + '='));
    assert.equal(user.saved, 1);
    assert.equal(user.password, 'new-pass-123');
    assert.equal(user.passwordConfirm, 'new-pass-123');
    assert.equal(user.passwordResetToken, undefined);
    assert.equal(user.passwordResetExpires, undefined);
  });

  it('looks for the HASH of the token, and only for a link that is not over', async () => {
    await reset(goodToken, goodBody);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].passwordResetToken, hashToken(goodToken));
    assert.ok(searches[0].passwordResetExpires.$gt instanceof Date);
    assert.ok(Math.abs(searches[0].passwordResetExpires.$gt.getTime() - Date.now()) < 5000);
  });

  it('refuses a token that is unknown or over, with one clear message', async () => {
    found = null;
    const reply = await reset(goodToken, goodBody);
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'This reset link is not valid or has expired. Please ask for a new one');
  });

  it('refuses a badly shaped token without asking the database', async () => {
    for (const bad of ['abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(65)]) {
      const reply = await reset(bad, goodBody);
      assert.equal(reply.status, 400, bad);
    }
    assert.equal(searches.length, 0);
  });

  it('refuses a missing password or confirmation, and values that are not text', async () => {
    assert.equal((await reset(goodToken, {})).status, 400);
    assert.equal((await reset(goodToken, { password: 'new-pass-123' })).status, 400);
    assert.equal((await reset(goodToken, { password: '', passwordConfirm: '' })).status, 400);
    const notText = await reset(goodToken, { password: 12345678, passwordConfirm: 12345678 });
    assert.equal(notText.status, 400);
    assert.equal(notText.json.message, 'password must be text');
    assert.equal(searches.length, 0);
  });

  it('answers with the rule that was broken when the model refuses the password', async () => {
    found.save = async () => {
      const error = new Error('validation');
      error.name = 'ValidationError';
      error.errors = { password: { message: 'A password must have at least 8 characters' } };
      throw error;
    };
    const reply = await reset(goodToken, { password: 'short', passwordConfirm: 'short' });
    assert.equal(reply.status, 400);
    assert.equal(reply.json.message, 'A password must have at least 8 characters');
    assert.equal(reply.headers.get('set-cookie'), null);
  });
});

describe('the forgot password and reset password pages', () => {
  let site;
  let currentUser = null;

  before(async () => {
    mock.method(User, 'findById', async () => currentUser);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    currentUser = null;
  });

  it('the login page links to the forgot password page', async () => {
    const html = await (await fetch(site.baseUrl + '/login')).text();
    assert.ok(html.includes('href="/forgot-password"'));
  });

  it('the forgot password page has the form and its script', async () => {
    const reply = await fetch(site.baseUrl + '/forgot-password');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('id="forgot-form"'));
    assert.ok(html.includes('type="email"'));
    assert.ok(html.includes('src="/js/recover.js"'));
  });

  it('a logged-in visitor goes from the forgot password page to the home page', async () => {
    currentUser = { _id: userId, name: 'Ayesha', changedPasswordAfter: () => false };
    const reply = await fetch(site.baseUrl + '/forgot-password', { headers: { Cookie: cookieName + '=' + signToken(userId) }, redirect: 'manual' });
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/');
  });

  it('the reset page has two new-password fields, the token in the form, and is not kept by browsers', async () => {
    const reply = await fetch(site.baseUrl + '/reset-password/' + goodToken);
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    assert.ok(html.includes('id="reset-form"'));
    assert.ok(html.includes('data-token="' + goodToken + '"'));
    assert.ok(html.includes('name="password"'));
    assert.ok(html.includes('name="passwordConfirm"'));
    assert.ok(html.includes('autocomplete="new-password"'));
    assert.ok(html.includes('src="/js/recover.js"'));
  });

  it('the reset page shows an error page for a token with a wrong shape', async () => {
    const reply = await fetch(site.baseUrl + '/reset-password/not-a-real-token');
    const html = await reply.text();
    assert.equal(reply.status, 400);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('not valid or has expired'));
    assert.ok(!html.includes('id="reset-form"'));
  });

  it('serves the script of the two forms', async () => {
    const reply = await fetch(site.baseUrl + '/js/recover.js');
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').includes('javascript'));
  });
});

describe('the welcome email after signup', () => {
  let site;
  const welcomes = [];
  let welcomeFails = false;

  before(async () => {
    mock.method(User, 'create', async (data) => ({ _id: userId, name: data.name, email: data.email }));
    mock.method(emailService, 'sendWelcomeEmail', async (user, link) => {
      welcomes.push({ user: user, link: link });
      if (welcomeFails) {
        throw new Error('the mail service is down');
      }
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    welcomes.length = 0;
    welcomeFails = false;
  });

  const signup = { name: 'Ayesha', email: 'ayesha@example.com', password: 'pass-12345', passwordConfirm: 'pass-12345' };

  it('is sent to the new user with a link to the site', async () => {
    const reply = await send(site.baseUrl, '/api/v1/users/signup', 'POST', JSON.stringify(signup));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reply.status, 201);
    assert.equal(welcomes.length, 1);
    assert.equal(welcomes[0].user.email, 'ayesha@example.com');
    assert.equal(welcomes[0].link, 'https://example.test/');
  });

  it('never stops the signup when the email fails', async () => {
    mock.method(console, 'error', () => {});
    welcomeFails = true;
    const reply = await send(site.baseUrl, '/api/v1/users/signup', 'POST', JSON.stringify(signup));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reply.status, 201);
    assert.equal(welcomes.length, 1);
  });
});
