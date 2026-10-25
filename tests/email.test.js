// tests/email.test.js - the settings and the texts of the emails. Nothing is really sent.
const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const email = require('../utils/email');

const names = ['SITE_URL', 'NODE_ENV', 'PORT', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
const saved = {};
for (let i = 0; i < names.length; i++) {
  saved[names[i]] = process.env[names[i]];
}

// Sets exactly these settings (all the others are removed) for one test.
function useSettings(values) {
  for (let i = 0; i < names.length; i++) {
    delete process.env[names[i]];
  }
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    process.env[keys[i]] = values[keys[i]];
  }
}

afterEach(() => {
  mock.restoreAll();
  for (let i = 0; i < names.length; i++) {
    if (saved[names[i]] === undefined) {
      delete process.env[names[i]];
    } else {
      process.env[names[i]] = saved[names[i]];
    }
  }
});

describe('readSiteUrl', () => {
  it('uses SITE_URL without a slash at the end', () => {
    useSettings({ SITE_URL: 'https://example.test///' });
    assert.equal(email.readSiteUrl(), 'https://example.test');
  });

  it('uses localhost on your own computer when SITE_URL is empty', () => {
    useSettings({ PORT: '4000' });
    assert.equal(email.readSiteUrl(), 'http://localhost:4000');
    useSettings({});
    assert.equal(email.readSiteUrl(), 'http://localhost:3000');
  });

  it('refuses to guess on the live server', () => {
    useSettings({ NODE_ENV: 'production' });
    assert.throws(() => email.readSiteUrl(), /SITE_URL/);
  });
});

describe('readEmailSettings', () => {
  it('writes the email in the terminal when there is no EMAIL_HOST on your computer', () => {
    useSettings({});
    assert.equal(email.readEmailSettings().mode, 'console');
  });

  it('refuses to run without EMAIL_HOST on the live server', () => {
    useSettings({ NODE_ENV: 'production' });
    assert.throws(() => email.readEmailSettings(), /EMAIL_HOST/);
  });

  it('names every missing setting when EMAIL_HOST is there but the rest is not', () => {
    useSettings({ EMAIL_HOST: 'smtp.example.test' });
    assert.throws(() => email.readEmailSettings(), /EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM/);
  });

  it('reads all the settings, with port 587 as the default', () => {
    useSettings({ EMAIL_HOST: 'smtp.example.test', EMAIL_USER: 'u', EMAIL_PASSWORD: 'p', EMAIL_FROM: 'Tour Nest <a@example.test>' });
    const settings = email.readEmailSettings();
    assert.equal(settings.mode, 'smtp');
    assert.equal(settings.host, 'smtp.example.test');
    assert.equal(settings.port, 587);
    assert.equal(settings.user, 'u');
    assert.equal(settings.password, 'p');
    assert.equal(settings.from, 'Tour Nest <a@example.test>');
  });

  it('refuses a port that is not a number', () => {
    useSettings({ EMAIL_HOST: 'h', EMAIL_USER: 'u', EMAIL_PASSWORD: 'p', EMAIL_FROM: 'f', EMAIL_PORT: 'abc' });
    assert.throws(() => email.readEmailSettings(), /EMAIL_PORT/);
  });
});

describe('sendEmail', () => {
  it('builds the email and writes it in the terminal, without sending it, on your computer', async () => {
    useSettings({});
    const lines = [];
    mock.method(console, 'log', (text) => lines.push(String(text)));
    const info = await email.sendEmail({ to: 'ayesha@example.com', subject: 'Hello', text: 'The link: http://x', html: '<p>hi</p>' });
    const built = JSON.parse(info.message);
    assert.equal(built.subject, 'Hello');
    assert.equal(built.to[0].address, 'ayesha@example.com');
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('The link: http://x'));
  });

  it('throws when the settings are wrong, so the caller can write it down', async () => {
    useSettings({ NODE_ENV: 'production' });
    await assert.rejects(() => email.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }), /EMAIL_HOST/);
  });
});

describe('the texts of the emails', () => {
  it('the welcome email greets the first name and shows the site', () => {
    const mail = email.buildWelcomeEmail({ name: 'Ayesha Khan', email: 'ayesha@example.com' }, 'https://example.test');
    assert.equal(mail.to, 'ayesha@example.com');
    assert.ok(mail.text.startsWith('Hi Ayesha,'));
    assert.ok(mail.text.includes('https://example.test'));
    assert.ok(mail.html.includes('href="https://example.test"'));
  });

  it('the reset email holds the link twice (text and html) and says it works for 10 minutes', () => {
    const link = 'https://example.test/reset-password/' + 'a'.repeat(64);
    const mail = email.buildResetEmail({ name: 'Ayesha', email: 'ayesha@example.com' }, link);
    assert.equal(mail.to, 'ayesha@example.com');
    assert.ok(mail.subject.includes('password'));
    assert.ok(mail.text.includes(link));
    assert.ok(mail.html.includes('href="' + link + '"'));
    assert.ok(mail.text.includes('10 minutes'));
  });

  it('a name with HTML turns into harmless text in the html part', () => {
    const mail = email.buildResetEmail({ name: '<script>alert(1)</script>', email: 'a@example.com' }, 'https://example.test/x');
    assert.ok(!mail.html.includes('<script>'));
    assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('an empty name becomes "there"', () => {
    assert.ok(email.buildWelcomeEmail({ name: '   ', email: 'a@example.com' }, 'https://example.test').text.startsWith('Hi there,'));
    assert.ok(email.buildWelcomeEmail({ email: 'a@example.com' }, 'https://example.test').text.startsWith('Hi there,'));
  });
});

describe('sendInBackground', () => {
  it('runs the sending', async () => {
    let ran = false;
    email.sendInBackground('test email', async () => {
      ran = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ran, true);
  });

  it('never throws. A failure is only written down, and only its message', async () => {
    const lines = [];
    mock.method(console, 'error', (...parts) => lines.push(parts));
    email.sendInBackground('test email', async () => {
      throw new Error('the mail service is down');
    });
    email.sendInBackground('other email', () => {
      throw new Error('a mistake before the first await');
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(lines.length, 2);
    // The order of the two lines does not matter, so we sort the messages.
    const messages = lines.map((parts) => parts[1]).sort();
    assert.deepEqual(messages, ['a mistake before the first await', 'the mail service is down']);
  });
});
