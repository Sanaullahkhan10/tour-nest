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

module.exports = {
  chooseGateway,
};
