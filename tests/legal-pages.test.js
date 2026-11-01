// tests/legal-pages.test.js - the Contact, Terms, Refund policy and Privacy pages, the footer links,
// the contact details from settings, and the payment mode notice. No database is needed.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readBusiness } = require('../utils/business');
const { paymentMode } = require('../utils/payments');
const { cookieName } = require('../utils/token');
const { startApp } = require('./helpers');

const names = ['BUSINESS_NAME', 'BUSINESS_ADDRESS', 'BUSINESS_PHONE', 'BUSINESS_EMAIL', 'PAYMENT_GATEWAY', 'PAYFAST_MERCHANT_ID', 'PAYFAST_SECURED_KEY', 'PAYFAST_BASE_URL'];
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
afterEach(() => {
  for (let i = 0; i < names.length; i++) {
    if (saved[names[i]] === undefined) {
      delete process.env[names[i]];
    } else {
      process.env[names[i]] = saved[names[i]];
    }
  }
});

describe('readBusiness', () => {
  it('uses the name Tour Nest and no details when nothing is set', () => {
    useSettings({});
    assert.deepEqual(readBusiness(), { name: 'Tour Nest', address: '', phone: '', phoneLink: '', email: '', hasDetails: false });
  });

  it('reads the four settings', () => {
    useSettings({ BUSINESS_NAME: 'Tour Nest Travel', BUSINESS_ADDRESS: 'Office 4, Main Road, Karachi', BUSINESS_PHONE: '+92 335 3962953', BUSINESS_EMAIL: 'hello@example.com' });
    const business = readBusiness();
    assert.equal(business.name, 'Tour Nest Travel');
    assert.equal(business.address, 'Office 4, Main Road, Karachi');
    assert.equal(business.phone, '+92 335 3962953');
    assert.equal(business.phoneLink, '+923353962953');
    assert.equal(business.email, 'hello@example.com');
    assert.equal(business.hasDetails, true);
  });

  it('cleans line breaks, and cuts a long text', () => {
    useSettings({ BUSINESS_ADDRESS: 'Line one\r\nLine two\u0000', BUSINESS_NAME: 'x'.repeat(200) });
    const business = readBusiness();
    assert.equal(business.address, 'Line one Line two');
    assert.equal(business.name.length, 80);
  });

  it('leaves out a phone number or an email that looks wrong', () => {
    for (const phone of ['call me', '123', '<script>', '+92 335 3962953 ext 5 and more words here']) {
      useSettings({ BUSINESS_PHONE: phone });
      assert.equal(readBusiness().phone, '', phone);
    }
    for (const email of ['nobody', 'a@b', 'a b@c.com', '"><x@c.com', 'a@c.com<']) {
      useSettings({ BUSINESS_EMAIL: email });
      assert.equal(readBusiness().email, '', email);
    }
  });
});

describe('paymentMode', () => {
  it('is "demo" without PayFast, or when PAYMENT_GATEWAY says demo', () => {
    useSettings({});
    assert.equal(paymentMode(), 'demo');
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYMENT_GATEWAY: 'demo' });
    assert.equal(paymentMode(), 'demo');
  });

  it('is "test" with PayFast on its test server, and "live" on another address', () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k' });
    assert.equal(paymentMode(), 'test');
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYFAST_BASE_URL: 'https://ipg1.apps.net.pk' });
    assert.equal(paymentMode(), 'live');
  });

  it('never says "live" by mistake: a wrong setting gives "demo" or "test"', () => {
    useSettings({ PAYMENT_GATEWAY: 'stripe' });
    assert.equal(paymentMode(), 'demo');
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYFAST_BASE_URL: 'not a web address' });
    assert.equal(paymentMode(), 'test');
  });
});

describe('the pages', () => {
  let site;
  before(async () => {
    site = await startApp();
  });
  after(async () => {
    await site.stop();
  });
  beforeEach(() => {
    useSettings({});
  });
  const get = async (path) => {
    const reply = await fetch(site.baseUrl + path);
    return { status: reply.status, type: reply.headers.get('content-type'), html: await reply.text() };
  };

  it('every page opens as HTML and has its own heading', async () => {
    const pages = [['/contact', 'Contact us'], ['/terms', 'Terms of use'], ['/refund-policy', 'Refund and cancellation policy'], ['/privacy', 'Privacy policy']];
    for (const [path, heading] of pages) {
      const page = await get(path);
      assert.equal(page.status, 200, path);
      assert.ok(page.type.startsWith('text/html'), path);
      assert.ok(page.html.includes('<h1>' + heading + '</h1>'), path);
      assert.ok(page.html.includes('<title>' + heading), path);
    }
  });

  it('the footer of every page links to the four pages', async () => {
    for (const path of ['/login', '/terms', '/contact', '/nothing-here']) {
      const html = (await get(path)).html;
      for (const link of ['/contact', '/terms', '/refund-policy', '/privacy']) {
        assert.ok(html.includes('href="' + link + '"'), path + ' -> ' + link);
      }
      assert.ok(html.includes('learning and portfolio project'));
    }
  });

  it('the contact page shows the details from the settings, with working links', async () => {
    useSettings({ BUSINESS_NAME: 'Tour Nest Travel', BUSINESS_ADDRESS: 'Office 4, Main Road, Karachi', BUSINESS_PHONE: '+92 335 3962953', BUSINESS_EMAIL: 'hello@example.com' });
    const html = (await get('/contact')).html;
    assert.ok(html.includes('Tour Nest Travel'));
    assert.ok(html.includes('Office 4, Main Road, Karachi'));
    assert.ok(html.includes('href="tel:+923353962953"'));
    assert.ok(html.includes('href="mailto:hello@example.com"'));
    assert.ok(!html.includes('will be added here soon'));
  });

  it('the contact page says so when no details are set', async () => {
    const html = (await get('/contact')).html;
    assert.ok(html.includes('Contact details will be added here soon.'));
    assert.ok(!html.includes('mailto:'));
  });

  it('turns HTML in the settings into harmless text', async () => {
    useSettings({ BUSINESS_ADDRESS: '<script>alert(1)</script>', BUSINESS_NAME: '<b>x</b>' });
    const html = (await get('/contact')).html;
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('the refund policy says what happens, with the days and the percentages', async () => {
    const html = (await get('/refund-policy')).html;
    assert.ok(html.includes('30 days or more: a full refund.'));
    assert.ok(html.includes('15 to 29 days: a refund of 50%.'));
    assert.ok(html.includes('Fewer than 15 days'));
    assert.ok(html.includes('A paid booking cannot be cancelled in the app.'));
    assert.ok(html.includes('10 working days'));
  });

  it('the terms and the privacy policy name the real parts of the site', async () => {
    const terms = (await get('/terms')).html;
    assert.ok(terms.includes('30 minutes'));
    assert.ok(terms.includes('PKR'));
    assert.ok(terms.includes('paid booking'));
    assert.ok(terms.includes('laws of Pakistan'));
    const privacy = (await get('/privacy')).html;
    for (const part of ['PayFast', 'Brevo', 'MongoDB Atlas', 'Render', 'OpenStreetMap', 'one-way hash']) {
      assert.ok(privacy.includes(part), part);
    }
    assert.ok(privacy.includes('<code>' + cookieName + '</code>'));
  });

  it('says that payments are not real in demo mode, on the three pages', async () => {
    useSettings({});
    for (const path of ['/terms', '/refund-policy', '/privacy']) {
      const html = (await get(path)).html;
      assert.ok(html.includes('demo checkout'), path);
      assert.ok(html.includes('No real money is taken'), path);
    }
    const terms = (await get('/terms')).html;
    assert.ok(terms.includes('They are not switched on yet'));
  });

  it('says that payments are in test mode with PayFast on its test server', async () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k' });
    for (const path of ['/terms', '/refund-policy', '/privacy']) {
      const html = (await get(path)).html;
      assert.ok(html.includes('Payments are in test mode. No real money is taken.'), path);
    }
    assert.ok((await get('/terms')).html.includes('We never see or save your card details.'));
  });

  it('shows no "not real" notice when real payments are on', async () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYFAST_BASE_URL: 'https://ipg1.apps.net.pk' });
    for (const path of ['/terms', '/refund-policy', '/privacy']) {
      const html = (await get(path)).html;
      assert.ok(!html.includes('No real money is taken'), path);
      assert.ok(!html.includes('class="notice'), path);
    }
  });
});
