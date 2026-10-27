// tests/booking-script.test.js - the script of the booking pages (booking form, Cancel buttons, demo payment,
// the form that goes to PayFast), run against a pretend page.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.join(__dirname, '..', 'public', 'js');
const apiCode = fs.readFileSync(path.join(folder, 'api.js'), 'utf8');
const bookingsCode = fs.readFileSync(path.join(folder, 'bookings.js'), 'utf8');

// A pretend message place and button inside a form-like element.
function makeBox() {
  const message = { textContent: 'old', isGood: null };
  message.classList = {
    toggle: (name, on) => {
      assert.equal(name, 'form__message--good');
      message.isGood = on;
    },
  };
  const button = { disabled: false };
  return { message: message, button: button };
}

// options: which parts the page has (bookingForm, cancel, demo, payfast), confirm answer, and the pretend server answer.
function startPage(options) {
  const calls = [];
  const assigned = [];
  const alerts = [];
  let reloads = 0;
  const handlers = {};
  const parts = {};

  if (options.bookingForm) {
    const box = makeBox();
    const form = {
      dataset: { tour: '64b7f0c2a1b2c3d4e5f60001' },
      elements: { startDate: { value: '2099-04-15T00:00:00.000Z' }, guests: { value: '3' }, mobile: { value: '03451234567' } },
      handlers: {},
      addEventListener: (type, handler) => (form.handlers[type] = handler),
      querySelector: (selector) => (selector === '[data-message]' ? box.message : selector === 'button[type="submit"]' ? box.button : null),
      submit: () => form.handlers.submit({ preventDefault: () => (form.prevented = true) }),
    };
    parts.bookingForm = { form: form, box: box };
  }
  if (options.cancel) {
    const button = { disabled: false, dataset: { cancelBooking: 'a/b' }, handlers: {}, addEventListener: (type, handler) => (button.handlers[type] = handler) };
    parts.cancel = button;
  }
  if (options.demo) {
    const box = makeBox();
    const button = { disabled: false, dataset: { booking: '64b7f0c2a1b2c3d4e5f6a111' }, parentElement: { querySelector: (selector) => (selector === '[data-message]' ? box.message : null) }, handlers: {}, addEventListener: (type, handler) => (button.handlers[type] = handler) };
    parts.demo = { button: button, box: box };
  }
  if (options.payfast) {
    parts.payfast = { submitted: 0, submit: () => parts.payfast.submitted++ };
  }

  const document = {
    getElementById: (id) => {
      if (id === 'booking-form') return parts.bookingForm ? parts.bookingForm.form : null;
      if (id === 'demo-pay') return parts.demo ? parts.demo.button : null;
      if (id === 'payfast-form') return parts.payfast || null;
      return null;
    },
    querySelectorAll: (selector) => (selector === '[data-cancel-booking]' && parts.cancel ? [parts.cancel] : []),
  };
  const window = {
    location: { assign: (url) => assigned.push(url), reload: () => reloads++ },
    confirm: () => options.confirm !== false,
    alert: (text) => alerts.push(text),
  };
  const fetch = async (url, settings) => {
    calls.push({ url: url, method: settings.method, body: settings.body ? JSON.parse(settings.body) : null });
    if (options.answer === 'network') {
      throw new Error('offline');
    }
    return { ok: options.answer.ok, json: async () => options.answer.body };
  };

  const context = vm.createContext({ document: document, window: window, fetch: fetch });
  vm.runInContext(apiCode, context, { filename: 'api.js' });
  vm.runInContext(bookingsCode, context, { filename: 'bookings.js' });
  return { parts: parts, calls: calls, assigned: assigned, alerts: alerts, reloads: () => reloads };
}

describe('the booking form', () => {
  it('sends the choice (guests as a number) and goes to the payment page', async () => {
    const page = startPage({ bookingForm: true, answer: { ok: true, body: { data: { payUrl: '/pay/abc' } } } });
    await page.parts.bookingForm.form.submit();
    assert.equal(page.parts.bookingForm.form.prevented, true);
    assert.deepEqual(page.calls, [{ url: '/api/v1/bookings', method: 'POST', body: { tour: '64b7f0c2a1b2c3d4e5f60001', startDate: '2099-04-15T00:00:00.000Z', guests: 3, mobile: '03451234567' } }]);
    assert.deepEqual(page.assigned, ['/pay/abc']);
  });

  it('shows the message of the API when it refuses, and turns the button on again', async () => {
    const page = startPage({ bookingForm: true, answer: { ok: false, body: { message: 'That date is full' } } });
    await page.parts.bookingForm.form.submit();
    assert.equal(page.parts.bookingForm.box.message.textContent, 'That date is full');
    assert.equal(page.parts.bookingForm.box.button.disabled, false);
    assert.deepEqual(page.assigned, []);
  });

  it('shows a plain message when the server cannot be reached', async () => {
    const page = startPage({ bookingForm: true, answer: 'network' });
    await page.parts.bookingForm.form.submit();
    assert.equal(page.parts.bookingForm.box.message.textContent, 'Could not reach the server. Please try again.');
    assert.equal(page.parts.bookingForm.box.button.disabled, false);
  });
});

describe('the Cancel button', () => {
  it('asks first, and does nothing when the visitor says no', async () => {
    const page = startPage({ cancel: true, confirm: false, answer: { ok: true, body: {} } });
    await page.parts.cancel.handlers.click();
    assert.equal(page.calls.length, 0);
  });

  it('cancels with DELETE (the id is made safe for an address) and reloads the page', async () => {
    const page = startPage({ cancel: true, answer: { ok: true, body: {} } });
    await page.parts.cancel.handlers.click();
    assert.deepEqual(page.calls, [{ url: '/api/v1/bookings/a%2Fb', method: 'DELETE', body: null }]);
    assert.equal(page.reloads(), 1);
  });

  it('tells the visitor when the API refuses, and turns the button on again', async () => {
    const page = startPage({ cancel: true, answer: { ok: false, body: { message: 'A paid booking cannot be cancelled here.' } } });
    await page.parts.cancel.handlers.click();
    assert.deepEqual(page.alerts, ['A paid booking cannot be cancelled here.']);
    assert.equal(page.parts.cancel.disabled, false);
    assert.equal(page.reloads(), 0);
  });
});

describe('the demo payment button', () => {
  it('sends the pretend payment and goes to My tours', async () => {
    const page = startPage({ demo: true, answer: { ok: true, body: {} } });
    await page.parts.demo.button.handlers.click();
    assert.deepEqual(page.calls, [{ url: '/api/v1/bookings/64b7f0c2a1b2c3d4e5f6a111/demo-pay', method: 'POST', body: null }]);
    assert.deepEqual(page.assigned, ['/my-tours?payment=success']);
  });

  it('shows the message of the API when it refuses, and turns the button on again', async () => {
    const page = startPage({ demo: true, answer: { ok: false, body: { message: 'This booking has expired.' } } });
    await page.parts.demo.button.handlers.click();
    assert.equal(page.parts.demo.box.message.textContent, 'This booking has expired.');
    assert.equal(page.parts.demo.button.disabled, false);
    assert.deepEqual(page.assigned, []);
  });
});

describe('the form that goes to PayFast', () => {
  it('is sent as soon as the page is ready', () => {
    const page = startPage({ payfast: true, answer: { ok: true, body: {} } });
    assert.equal(page.parts.payfast.submitted, 1);
  });

  it('a page without any of these parts does nothing and throws nothing', () => {
    assert.doesNotThrow(() => startPage({ answer: { ok: true, body: {} } }));
  });
});
