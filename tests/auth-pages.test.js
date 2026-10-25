// tests/auth-pages.test.js - the login and signup pages, and the header that shows who is logged in.
// No database is needed: the user search is replaced by a fake one.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/userModel');
const Tour = require('../models/tourModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6aaaa';

describe('login and signup pages', () => {
  let site;

  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });

  it('the login page has a form that never sends the password in the address bar', async () => {
    const reply = await fetch(site.baseUrl + '/login');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('id="login-form"'));
    assert.ok(html.includes('method="post"'));
    assert.ok(html.includes('type="email"'));
    assert.ok(html.includes('autocomplete="current-password"'));
    assert.ok(html.includes('src="/js/auth.js"'));
  });

  it('the signup page asks for name, email, password and the password again', async () => {
    const reply = await fetch(site.baseUrl + '/signup');
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(html.includes('id="signup-form"'));
    assert.ok(html.includes('method="post"'));
    assert.ok(html.includes('name="name"'));
    assert.ok(html.includes('name="passwordConfirm"'));
    assert.ok(html.includes('autocomplete="new-password"'));
  });

  it('a visitor who is not logged in sees the login and signup links, and no logout button', async () => {
    const html = await (await fetch(site.baseUrl + '/login')).text();
    assert.ok(html.includes('href="/login"'));
    assert.ok(html.includes('href="/signup"'));
    assert.ok(!html.includes('data-logout'));
  });

  it('serves the script of the forms', async () => {
    const reply = await fetch(site.baseUrl + '/js/auth.js');
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').includes('javascript'));
  });
});

describe('the header of a logged-in visitor', () => {
  let site;
  let currentUser;
  const cookie = () => ({ headers: { Cookie: cookieName + '=' + signToken(userId) } });

  // A user that "protect" would accept: the password has not changed since the login.
  function goodUser(name) {
    return { _id: userId, name: name, changedPasswordAfter: () => false };
  }

  before(async () => {
    mock.method(User, 'findById', async () => currentUser);
    const chain = {
      sort: () => chain,
      select: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve([]),
    };
    mock.method(Tour, 'find', () => chain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('shows the name and the logout button instead of the login links', async () => {
    currentUser = goodUser('Ayesha');
    const html = await (await fetch(site.baseUrl + '/', cookie())).text();
    assert.ok(html.includes('Ayesha'));
    assert.ok(html.includes('data-logout'));
    assert.ok(!html.includes('href="/login"'));
  });

  it('turns HTML in the name into harmless text', async () => {
    currentUser = goodUser('<img src=x onerror=alert(1)>');
    const html = await (await fetch(site.baseUrl + '/', cookie())).text();
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('<img src=x'));
  });

  it('sends a logged-in visitor from the login and signup pages to the home page', async () => {
    currentUser = goodUser('Ayesha');
    for (const page of ['/login', '/signup']) {
      const reply = await fetch(site.baseUrl + page, { ...cookie(), redirect: 'manual' });
      assert.equal(reply.status, 302, page);
      assert.equal(reply.headers.get('location'), '/', page);
    }
  });

  it('treats a cookie with a fake token as logged out', async () => {
    currentUser = goodUser('Ayesha');
    const reply = await fetch(site.baseUrl + '/', { headers: { Cookie: cookieName + '=not-a-real-token' } });
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(html.includes('href="/login"'));
    assert.ok(!html.includes('Ayesha'));
  });

  it('treats a user whose password changed after the login as logged out', async () => {
    currentUser = { _id: userId, name: 'Ayesha', changedPasswordAfter: () => true };
    const html = await (await fetch(site.baseUrl + '/', cookie())).text();
    assert.ok(html.includes('href="/login"'));
    assert.ok(!html.includes('data-logout'));
  });

  it('treats a user who no longer exists as logged out', async () => {
    currentUser = null;
    const html = await (await fetch(site.baseUrl + '/', cookie())).text();
    assert.ok(html.includes('href="/login"'));
  });
});
