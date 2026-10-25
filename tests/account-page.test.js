// tests/account-page.test.js - the My account page (/me).
// No database is needed: the user search is replaced by a fake one.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.JWT_SECRET = 'a-long-secret-for-the-tests-only-'.repeat(3);
process.env.JWT_EXPIRES_DAYS = '7';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/userModel');
const { signToken, cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const userId = '64b7f0c2a1b2c3d4e5f6bbbb';

// A user that "attachUser" would accept: the password has not changed since the login.
function goodUser(changes) {
  return Object.assign(
    { _id: userId, name: 'Ayesha Khan', email: 'ayesha@example.com', role: 'user', changedPasswordAfter: () => false },
    changes
  );
}

// The login cookie of that user.
function loginCookie() {
  return { headers: { Cookie: cookieName + '=' + signToken(userId) } };
}

describe('the My account page', () => {
  let site;
  let currentUser;

  before(async () => {
    mock.method(User, 'findById', async () => currentUser);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  // Asks for /me without following the redirect, so we can see where it points.
  async function getMe(options) {
    return fetch(site.baseUrl + '/me', Object.assign({ redirect: 'manual' }, options));
  }

  it('sends a visitor who is not logged in to the login page', async () => {
    const reply = await getMe();
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/login');
  });

  it('treats a cookie with a fake token as logged out', async () => {
    const reply = await getMe({ headers: { Cookie: cookieName + '=not-a-real-token' } });
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/login');
  });

  it('treats a user whose password changed after the login as logged out', async () => {
    currentUser = goodUser({ changedPasswordAfter: () => true });
    const reply = await getMe(loginCookie());
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/login');
  });

  it('treats a user who closed the account as logged out', async () => {
    currentUser = null;
    const reply = await getMe(loginCookie());
    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/login');
  });

  it('shows the three forms, filled with the details of the user', async () => {
    currentUser = goodUser();
    const reply = await getMe(loginCookie());
    const html = await reply.text();
    assert.equal(reply.status, 200);
    assert.ok(reply.headers.get('content-type').startsWith('text/html'));
    assert.ok(html.includes('id="details-form"'));
    assert.ok(html.includes('id="password-form"'));
    assert.ok(html.includes('id="close-account"'));
    assert.ok(html.includes('value="Ayesha Khan"'));
    assert.ok(html.includes('value="ayesha@example.com"'));
    assert.ok(html.includes('Signed in as user'));
    assert.ok(html.includes('name="passwordCurrent"'));
    assert.ok(html.includes('name="password"'));
    assert.ok(html.includes('name="passwordConfirm"'));
    assert.ok(html.includes('autocomplete="current-password"'));
    assert.ok(html.includes('autocomplete="new-password"'));
  });

  it('puts a link to the account page in the header, only for a logged-in visitor', async () => {
    currentUser = goodUser();
    const loggedIn = await (await getMe(loginCookie())).text();
    assert.ok(loggedIn.includes('href="/me"'));
    assert.ok(loggedIn.includes('data-user-name'));

    const visitor = await (await fetch(site.baseUrl + '/login')).text();
    assert.ok(!visitor.includes('href="/me"'));
  });

  it('turns HTML in the name and in the email into harmless text', async () => {
    currentUser = goodUser({ name: '<img src=x onerror=alert(1)>', email: 'a"><b>@x.com' });
    const html = await (await getMe(loginCookie())).text();
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&quot;&gt;&lt;b&gt;'));
    assert.ok(!html.includes('"><b>'));
  });

  it('asks browsers and proxies not to keep a copy of the page', async () => {
    currentUser = goodUser();
    const reply = await getMe(loginCookie());
    assert.equal(reply.headers.get('cache-control'), 'no-store');
  });

  it('loads api.js before account.js, and serves account.js', async () => {
    currentUser = goodUser();
    const html = await (await getMe(loginCookie())).text();
    const apiPosition = html.indexOf('src="/js/api.js"');
    const accountPosition = html.indexOf('src="/js/account.js"');
    assert.ok(apiPosition > -1 && accountPosition > apiPosition);

    const script = await fetch(site.baseUrl + '/js/account.js');
    assert.equal(script.status, 200);
    assert.ok(script.headers.get('content-type').includes('javascript'));
  });

  it('has no inline script (the safe headers would block it)', async () => {
    currentUser = goodUser();
    const html = await (await getMe(loginCookie())).text();
    assert.ok(!/<script>/.test(html));
    assert.ok(!/\sonclick=/.test(html));
  });
});