// tests/payfast.test.js - the PayFast helper: settings, the token request, the form, and the check of the answer.
// Nothing goes to the internet: fetch is replaced by a fake.
const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const payfast = require('../utils/payfast');
const { chooseGateway } = require('../utils/payments');

const names = ['PAYFAST_MERCHANT_ID', 'PAYFAST_SECURED_KEY', 'PAYFAST_MERCHANT_NAME', 'PAYFAST_BASE_URL', 'PAYMENT_GATEWAY'];
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

const settings = { merchantId: '1234', securedKey: 'the-secret-key', merchantName: 'Tour Nest', baseUrl: 'https://ipguat.apps.net.pk' };
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

describe('the settings', () => {
  it('is not set up without the merchant id and the secured key', () => {
    useSettings({});
    assert.equal(payfast.isConfigured(), false);
    assert.throws(() => payfast.readSettings(), /PAYFAST_MERCHANT_ID, PAYFAST_SECURED_KEY/);
    useSettings({ PAYFAST_MERCHANT_ID: '1' });
    assert.equal(payfast.isConfigured(), false);
    assert.throws(() => payfast.readSettings(), /PAYFAST_SECURED_KEY/);
  });

  it('reads the settings, with the test server and the name Tour Nest as defaults', () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1234', PAYFAST_SECURED_KEY: 'k' });
    assert.equal(payfast.isConfigured(), true);
    assert.deepEqual(payfast.readSettings(), { merchantId: '1234', securedKey: 'k', merchantName: 'Tour Nest', baseUrl: 'https://ipguat.apps.net.pk' });
    assert.equal(payfast.formOrigin(), 'https://ipguat.apps.net.pk');
  });

  it('takes the address from PAYFAST_BASE_URL, without a path or a slash, and only over https', () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYFAST_BASE_URL: 'https://ipg1.apps.net.pk/' });
    assert.equal(payfast.readSettings().baseUrl, 'https://ipg1.apps.net.pk');
    useSettings({ PAYFAST_BASE_URL: 'http://ipg1.apps.net.pk' });
    assert.throws(() => payfast.formOrigin(), /https/);
    useSettings({ PAYFAST_BASE_URL: 'not a web address' });
    assert.throws(() => payfast.formOrigin(), /web address/);
  });
});

describe('chooseGateway', () => {
  it('uses PayFast when it is set up, and the demo checkout when it is not', () => {
    useSettings({});
    assert.equal(chooseGateway(), 'demo');
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k' });
    assert.equal(chooseGateway(), 'payfast');
  });

  it('obeys PAYMENT_GATEWAY, and refuses a value it does not know', () => {
    useSettings({ PAYFAST_MERCHANT_ID: '1', PAYFAST_SECURED_KEY: 'k', PAYMENT_GATEWAY: 'demo' });
    assert.equal(chooseGateway(), 'demo');
    useSettings({ PAYMENT_GATEWAY: 'payfast' });
    assert.equal(chooseGateway(), 'payfast');
    useSettings({ PAYMENT_GATEWAY: 'stripe' });
    assert.throws(() => chooseGateway(), /payfast or demo/);
  });
});

describe('getAccessToken', () => {
  function fakeFetch(reply) {
    const calls = [];
    mock.method(globalThis, 'fetch', async (url, options) => {
      calls.push({ url: url, options: options });
      if (reply instanceof Error) {
        throw reply;
      }
      return { ok: reply.ok, status: reply.status || 200, json: async () => reply.body };
    });
    return calls;
  }

  it('asks the PayFast server for a token with the amount and the basket id, as a form', async () => {
    const calls = fakeFetch({ ok: true, body: { ACCESS_TOKEN: 'abc123' } });
    const token = await payfast.getAccessToken(settings, 'TN-ABC', 95000);
    assert.equal(token, 'abc123');
    assert.equal(calls[0].url, 'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const sent = new URLSearchParams(calls[0].options.body);
    assert.equal(sent.get('MERCHANT_ID'), '1234');
    assert.equal(sent.get('SECURED_KEY'), 'the-secret-key');
    assert.equal(sent.get('BASKET_ID'), 'TN-ABC');
    assert.equal(sent.get('TXNAMT'), '95000');
    assert.equal(sent.get('CURRENCY_CODE'), 'PKR');
  });

  it('also reads a token written in small letters', async () => {
    fakeFetch({ ok: true, body: { access_token: 'small-token' } });
    assert.equal(await payfast.getAccessToken(settings, 'TN-ABC', 1), 'small-token');
  });

  it('gives a clear 502 when PayFast cannot be reached, answers badly, or sends no token', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    const cases = [new Error('offline'), { ok: false, status: 500, body: {} }, { ok: true, body: {} }, { ok: true, body: { ACCESS_TOKEN: '' } }, { ok: true, body: null }];
    for (let i = 0; i < cases.length; i++) {
      mock.method(globalThis, 'fetch').mock.restore();
      fakeFetch(cases[i]);
      await assert.rejects(
        () => payfast.getAccessToken(settings, 'TN-ABC', 1),
        (error) => error.statusCode === 502 && error.isOperational === true,
        'case ' + i
      );
    }
    // The secured key must never be written in the log.
    assert.ok(!JSON.stringify(errorMock.mock.calls.map((call) => call.arguments)).includes('the-secret-key'));
  });
});

describe('buildCheckoutForm', () => {
  const order = {
    amount: 190000,
    mobile: '03451234567',
    email: 'ayesha@example.com',
    description: 'Tour Nest: The Hunza Valley Explorer',
    basketId: 'TN-ABC123',
    date: new Date('2027-04-15T13:05:09.000Z'),
    siteUrl: 'https://example.test',
  };

  it('has the fields of the PayFast form, with our own return addresses', () => {
    const form = payfast.buildCheckoutForm(settings, 'the-token', order);
    assert.equal(form.action, 'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/PostTransaction');
    const fields = form.fields;
    assert.equal(fields.MERCHANT_ID, '1234');
    assert.equal(fields.MERCHANT_NAME, 'Tour Nest');
    assert.equal(fields.TOKEN, 'the-token');
    assert.equal(fields.PROCCODE, '00');
    assert.equal(fields.TXNAMT, '190000');
    assert.equal(fields.CUSTOMER_MOBILE_NO, '92-3451234567');
    assert.equal(fields.CUSTOMER_EMAIL_ADDRESS, 'ayesha@example.com');
    assert.equal(fields.BASKET_ID, 'TN-ABC123');
    assert.equal(fields.ORDER_DATE, '2027-04-15 13:05:09');
    assert.equal(fields.TXNDESC, 'Tour Nest: The Hunza Valley Explorer');
    assert.equal(fields.SUCCESS_URL, 'https://example.test/payment/payfast/success');
    assert.equal(fields.FAILURE_URL, 'https://example.test/payment/payfast/failure');
    assert.equal(fields.CHECKOUT_URL, 'https://example.test/api/v1/bookings/payfast-ipn');
    assert.match(fields.SIGNATURE, /^[0-9a-f]{16}$/);
  });

  it('never puts the secured key in the form', () => {
    const form = payfast.buildCheckoutForm(settings, 'the-token', order);
    assert.ok(!JSON.stringify(form).includes('the-secret-key'));
    assert.equal(form.fields.SECURED_KEY, undefined);
  });

  it('cuts a very long description', () => {
    const form = payfast.buildCheckoutForm(settings, 't', Object.assign({}, order, { description: 'x'.repeat(300) }));
    assert.equal(form.fields.TXNDESC.length, 100);
  });

  it('writes a mobile number the way PayFast does', () => {
    assert.equal(payfast.formatMobile('03001234567'), '92-3001234567');
  });
});

describe('checkAnswer', () => {
  function answer(extra) {
    return Object.assign({ basket_id: 'TN-ABC123', err_code: '000', validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123', '000'), transaction_id: 'T-1', err_msg: 'Success' }, extra);
  }

  it('makes the hash from basket_id|secured_key|merchant_id|err_code', () => {
    assert.equal(payfast.makeValidationHash(settings, 'TN-ABC123', '000'), sha256('TN-ABC123|the-secret-key|1234|000'));
  });

  it('accepts a real answer that says paid', () => {
    const result = payfast.checkAnswer(settings, answer({}));
    assert.equal(result.valid, true);
    assert.equal(result.approved, true);
    assert.equal(result.basketId, 'TN-ABC123');
    assert.equal(result.transactionId, 'T-1');
  });

  it('accepts a real answer that says not paid, but does not call it approved', () => {
    const result = payfast.checkAnswer(settings, answer({ err_code: '106', validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123', '106') }));
    assert.equal(result.valid, true);
    assert.equal(result.approved, false);
    assert.equal(result.errCode, '106');
  });

  it('accepts the hash in capital letters', () => {
    assert.equal(payfast.checkAnswer(settings, answer({ validation_hash: answer({}).validation_hash.toUpperCase() })).valid, true);
  });

  it('refuses a fake: a wrong hash, a changed basket id or err_code, a missing part, or other kinds of values', () => {
    const fakes = [
      answer({ validation_hash: 'f'.repeat(64) }),
      answer({ validation_hash: 'short' }),
      answer({ basket_id: 'TN-OTHER' }),
      // The customer changes the answer from "failed" to "paid" without knowing the key.
      answer({ err_code: '000', validation_hash: payfast.makeValidationHash(settings, 'TN-ABC123', '106') }),
      answer({ basket_id: '' }),
      answer({ err_code: '' }),
      answer({ validation_hash: '' }),
      {},
      { basket_id: ['TN-ABC123'], err_code: '000', validation_hash: answer({}).validation_hash },
      { basket_id: { $gt: '' }, err_code: '000', validation_hash: 'x' },
    ];
    for (let i = 0; i < fakes.length; i++) {
      const result = payfast.checkAnswer(settings, fakes[i]);
      assert.equal(result.valid, false, 'fake ' + i);
      assert.equal(result.approved, false, 'fake ' + i);
    }
  });

  it('reads the amount when PayFast sends it', () => {
    assert.equal(payfast.checkAnswer(settings, answer({ transaction_amount: '190000.00' })).amount, '190000.00');
    assert.equal(payfast.checkAnswer(settings, answer({ txnamt: '5' })).amount, '5');
    assert.equal(payfast.checkAnswer(settings, answer({})).amount, '');
  });
});
