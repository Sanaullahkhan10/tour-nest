// utils/payments.js - which payment service the bookings use.
const payfast = require('./payfast');

// PAYMENT_GATEWAY can be "payfast" or "demo". If it is empty, PayFast is used when its secrets are set,
// and the demo checkout (a pretend payment, no real money) is used when they are not.
function chooseGateway() {
  const setting = process.env.PAYMENT_GATEWAY;
  if (setting === 'payfast' || setting === 'demo') {
    return setting;
  }
  if (setting) {
    throw new Error('PAYMENT_GATEWAY must be payfast or demo');
  }
  return payfast.isConfigured() ? 'payfast' : 'demo';
}

// Which kind of payment the site uses right now, so the text of the pages never says that real money is taken when it is not:
//   "demo": a pretend checkout, "test": the PayFast test server (no real money), "live": real money.
// When a setting is wrong, the answer is "demo" or "test", never "live".
function paymentMode() {
  let gateway;
  try {
    gateway = chooseGateway();
  } catch (error) {
    return 'demo';
  }
  if (gateway === 'demo') {
    return 'demo';
  }
  try {
    return payfast.formOrigin() === payfast.defaultBaseUrl ? 'test' : 'live';
  } catch (error) {
    return 'test';
  }
}

module.exports = {
  chooseGateway,
  paymentMode,
};
