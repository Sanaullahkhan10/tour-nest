// utils/payfast.js - talks to PayFast (the payment service of Pakistan, gopayfast.com).
// The way it works (the "hosted checkout"):
//   1. Our server asks PayFast for a one-time token (GetAccessToken) with the amount and our basket id.
//   2. The browser of the customer sends a form with that token to PayFast (PostTransaction).
//      The customer pays on the page of PayFast. We never see the card or the account details.
//   3. PayFast sends the customer back to our SUCCESS_URL or FAILURE_URL with the result in the address
//      (err_code, basket_id, validation_hash ...). We check the validation_hash before we believe it.
// The field names and the hash are taken from the public PayFast documents. Check them against the
// answers of your own PayFast test (UAT) account: if PayFast changes a name, only this file changes.
const crypto = require('crypto');
const AppError = require('./appError');

// The test server of PayFast. For real money PayFast gives another address: put it in PAYFAST_BASE_URL.
const defaultBaseUrl = 'https://ipguat.apps.net.pk';

// The address of the PayFast server, without a slash at the end. Must be https.
function readBaseUrl() {
  const setting = process.env.PAYFAST_BASE_URL || defaultBaseUrl;
  let url;
  try {
    url = new URL(setting);
  } catch (error) {
    throw new Error('PAYFAST_BASE_URL is not a web address');
  }
  if (url.protocol !== 'https:') {
    throw new Error('PAYFAST_BASE_URL must start with https://');
  }
  return url.origin;
}

// PayFast is "set up" when we have the two secrets that PayFast gave us after the sign up.
function isConfigured() {
  return Boolean(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_SECURED_KEY);
}

function readSettings() {
  const missing = [];
  if (!process.env.PAYFAST_MERCHANT_ID) {
    missing.push('PAYFAST_MERCHANT_ID');
  }
  if (!process.env.PAYFAST_SECURED_KEY) {
    missing.push('PAYFAST_SECURED_KEY');
  }
  if (missing.length > 0) {
    throw new Error('PayFast is not set up: missing setting ' + missing.join(', '));
  }
  return {
    merchantId: process.env.PAYFAST_MERCHANT_ID,
    securedKey: process.env.PAYFAST_SECURED_KEY,
    merchantName: process.env.PAYFAST_MERCHANT_NAME || 'Tour Nest',
    baseUrl: readBaseUrl(),
  };
}

// The origin that the browser may send the payment form to (see the Content Security Policy in app.js).
function formOrigin() {
  return readBaseUrl();
}

// Step 1: asks PayFast for the one-time token. This happens on our server, because it needs the secured key.
async function getAccessToken(settings, basketId, amount) {
  const body = new URLSearchParams({
    MERCHANT_ID: settings.merchantId,
    SECURED_KEY: settings.securedKey,
    BASKET_ID: basketId,
    TXNAMT: String(amount),
    CURRENCY_CODE: 'PKR',
  });

  let reply;
  try {
    reply = await fetch(settings.baseUrl + '/Ecommerce/api/Transaction/GetAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new AppError('The payment service cannot be reached. Please try again in a few minutes', 502);
  }

  let data = null;
  try {
    data = await reply.json();
  } catch (error) {
    data = null;
  }
  const token = data && (data.ACCESS_TOKEN || data.access_token);
  if (!reply.ok || typeof token !== 'string' || token === '') {
    // We write only the status. The answer may hold secrets.
    console.error('PayFast did not give a token. HTTP status: ' + reply.status);
    throw new AppError('The payment service did not accept the request. Please try again later', 502);
  }
  return token;
}

// "03451234567" becomes "92-3451234567", the way PayFast writes a mobile number.
function formatMobile(mobile) {
  return '92-' + String(mobile).replace(/^0/, '');
}

// "2027-04-15 13:05:09" (the date format of PayFast).
function formatOrderDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Step 2: the fields of the form that the browser sends to PayFast. The secured key is NOT in it.
function buildCheckoutForm(settings, token, order) {
  return {
    action: settings.baseUrl + '/Ecommerce/api/Transaction/PostTransaction',
    fields: {
      MERCHANT_ID: settings.merchantId,
      MERCHANT_NAME: settings.merchantName,
      TOKEN: token,
      PROCCODE: '00',
      TXNAMT: String(order.amount),
      CUSTOMER_MOBILE_NO: formatMobile(order.mobile),
      CUSTOMER_EMAIL_ADDRESS: order.email,
      SIGNATURE: crypto.randomBytes(8).toString('hex'),
      VERSION: 'TOURNEST-1.0',
      TXNDESC: String(order.description).slice(0, 100),
      SUCCESS_URL: order.siteUrl + '/payment/payfast/success',
      FAILURE_URL: order.siteUrl + '/payment/payfast/failure',
      BASKET_ID: order.basketId,
      ORDER_DATE: formatOrderDate(order.date),
      // PayFast also tells our server about the payment here, apart from the customer's browser.
      CHECKOUT_URL: order.siteUrl + '/api/v1/bookings/payfast-ipn',
    },
  };
}

// The hash that PayFast puts in the answer: SHA-256 of basket_id|secured_key|merchant_id|err_code.
// Only PayFast and we know the secured key, so only PayFast can make a hash that fits.
function makeValidationHash(settings, basketId, errCode) {
  return crypto
    .createHash('sha256')
    .update(basketId + '|' + settings.securedKey + '|' + settings.merchantId + '|' + errCode)
    .digest('hex');
}

// Reads the answer of PayFast (the address parameters of the SUCCESS_URL / FAILURE_URL, or the body of the
// server message). Gives { valid, approved, basketId, transactionId, errCode, errMessage, amount }.
// valid: the hash fits. approved: valid, and err_code is 000 (PayFast says "paid").
function checkAnswer(settings, params) {
  const text = (value) => (typeof value === 'string' ? value : '');
  const basketId = text(params.basket_id);
  const errCode = text(params.err_code);
  const given = text(params.validation_hash).toLowerCase();

  const none = { valid: false, approved: false, basketId: basketId, transactionId: '', errCode: errCode, errMessage: '', amount: '' };
  if (basketId === '' || errCode === '' || given === '') {
    return none;
  }

  const expected = makeValidationHash(settings, basketId, errCode);
  // Both are 64 characters when the hash is a real one. timingSafeEqual needs the same length.
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return none;
  }

  return {
    valid: true,
    approved: errCode === '000',
    basketId: basketId,
    transactionId: text(params.transaction_id).slice(0, 100),
    errCode: errCode,
    errMessage: text(params.err_msg).slice(0, 200),
    amount: text(params.transaction_amount) || text(params.txnamt),
  };
}

module.exports = {
  defaultBaseUrl,
  isConfigured,
  readSettings,
  formOrigin,
  getAccessToken,
  formatMobile,
  buildCheckoutForm,
  makeValidationHash,
  checkAnswer,
};
