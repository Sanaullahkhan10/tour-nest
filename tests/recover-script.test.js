// tests/recover-script.test.js - the script of the forgot password and reset password forms,
// run against a pretend page (the same way as tests/account-script.test.js).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.join(__dirname, '..', 'public', 'js');
const apiCode = fs.readFileSync(path.join(folder, 'api.js'), 'utf8');
const recoverCode = fs.readFileSync(path.join(folder, 'recover.js'), 'utf8');

// A pretend form with fields, one submit button and a message place.
function fakeForm(values, token) {
  const fields = {};
  const names = Object.keys(values);
  for (let i = 0; i < names.length; i++) {
    fields[names[i]] = { value: values[names[i]] };
  }

  const message = { textContent: 'old', isGood: null };
  message.classList = {
    toggle: (name, on) => {
      assert.equal(name, 'form__message--good');
      message.isGood = on;
    },
  };
  const button = { disabled: false };

  const form = {
    elements: fields,
    dataset: { token: token },
    button: button,
    message: message,
    handlers: {},
    prevented: false,
    addEventListener: (type, handler) => {
      form.handlers[type] = handler;
    },
    querySelector: (selector) => {
      if (selector === '[data-message]') {
        return message;
      }
      if (selector === 'button[type="submit"]') {
        return button;
      }
      return null;
    },
    submit: () => {
      return form.handlers.submit({
        preventDefault: () => {
          form.prevented = true;
        },
      });
    },
  };
  return form;
}

// Builds the pretend page and runs the two real scripts in it.
// options.answer is what the pretend server says: { ok, body } (body null = no JSON), or 'network' for no connection.
function startPage(options) {
  const forgot = fakeForm({ email: 'ayesha@example.com' });
  const reset = fakeForm({ password: 'new-pass-123', passwordConfirm: 'new-pass-123' }, options.token || 'ab12'.repeat(16));
  const elements = { 'forgot-form': forgot, 'reset-form': reset };
  const calls = [];
  const assigned = [];

  const document = {
    getElementById: (id) => {
      if (options.empty) {
        return null;
      }
      return elements[id] || null;
    },
  };
  const window = { location: { assign: (url) => assigned.push(url) } };
  const fetch = async (url, settings) => {
    calls.push({ url: url, method: settings.method, body: settings.body ? JSON.parse(settings.body) : null });
    if (options.answer === 'network') {
      throw new Error('offline');
    }
    return {
      ok: options.answer.ok,
      json: async () => {
        if (options.answer.body === null) {
          throw new Error('no JSON');
        }
        return options.answer.body;
      },
    };
  };

  const context = vm.createContext({ document: document, window: window, fetch: fetch });
  vm.runInContext(apiCode, context, { filename: 'api.js' });
  vm.runInContext(recoverCode, context, { filename: 'recover.js' });
  return { forgot: forgot, reset: reset, calls: calls, assigned: assigned };
}

describe('the forgot password form', () => {
  it('sends the email, shows the answer in green, and keeps the button off', async () => {
    const page = startPage({ answer: { ok: true, body: { status: 'success', message: 'We sent the link.' } } });
    await page.forgot.submit();
    assert.equal(page.forgot.prevented, true);
    assert.deepEqual(page.calls, [{ url: '/api/v1/users/forgotPassword', method: 'POST', body: { email: 'ayesha@example.com' } }]);
    assert.equal(page.forgot.message.textContent, 'We sent the link.');
    assert.equal(page.forgot.message.isGood, true);
    assert.equal(page.forgot.button.disabled, true);
    assert.deepEqual(page.assigned, []);
  });

  it('shows the message of the API when it refuses, and turns the button on again', async () => {
    const page = startPage({ answer: { ok: false, body: { message: 'Too many attempts' } } });
    await page.forgot.submit();
    assert.equal(page.forgot.message.textContent, 'Too many attempts');
    assert.equal(page.forgot.message.isGood, false);
    assert.equal(page.forgot.button.disabled, false);
  });

  it('shows a plain message when the answer has no JSON, or the server cannot be reached', async () => {
    const noJson = startPage({ answer: { ok: false, body: null } });
    await noJson.forgot.submit();
    assert.equal(noJson.forgot.message.textContent, 'Something went wrong. Please try again.');
    assert.equal(noJson.forgot.button.disabled, false);

    const offline = startPage({ answer: 'network' });
    await offline.forgot.submit();
    assert.equal(offline.forgot.message.textContent, 'Could not reach the server. Please try again.');
    assert.equal(offline.forgot.button.disabled, false);
  });
});

describe('the reset password form', () => {
  it('sends the new password with PATCH to the address with the token, then goes to the home page', async () => {
    const page = startPage({ answer: { ok: true, body: { status: 'success' } } });
    await page.reset.submit();
    assert.deepEqual(page.calls, [
      {
        url: '/api/v1/users/resetPassword/' + 'ab12'.repeat(16),
        method: 'PATCH',
        body: { password: 'new-pass-123', passwordConfirm: 'new-pass-123' },
      },
    ]);
    assert.deepEqual(page.assigned, ['/']);
  });

  it('puts the token into the address safely', async () => {
    const page = startPage({ token: 'a/b?c', answer: { ok: true, body: {} } });
    await page.reset.submit();
    assert.equal(page.calls[0].url, '/api/v1/users/resetPassword/a%2Fb%3Fc');
  });

  it('shows the message of the API when the link is over, and stays on the page', async () => {
    const page = startPage({ answer: { ok: false, body: { message: 'This reset link is not valid or has expired. Please ask for a new one' } } });
    await page.reset.submit();
    assert.equal(page.reset.message.textContent, 'This reset link is not valid or has expired. Please ask for a new one');
    assert.equal(page.reset.button.disabled, false);
    assert.deepEqual(page.assigned, []);
  });
});

describe('a page without the forms', () => {
  it('does nothing and throws nothing', () => {
    assert.doesNotThrow(() => startPage({ empty: true, answer: { ok: true, body: {} } }));
  });
});
