// tests/account-script.test.js - the script of the My account page, run against a pretend page.
// The real api.js and account.js run in a sandbox (node:vm) with a pretend "document", "window"
// and "fetch". So we can test what a submit or a click does, without a browser.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptFolder = path.join(__dirname, '..', 'public', 'js');
const apiCode = fs.readFileSync(path.join(scriptFolder, 'api.js'), 'utf8');
const accountCode = fs.readFileSync(path.join(scriptFolder, 'account.js'), 'utf8');

// A pretend place for the message under a form.
function fakeMessage() {
  const message = { textContent: '', isGood: false };
  message.classList = {
    toggle: (name, on) => {
      assert.equal(name, 'form__message--good');
      message.isGood = on;
    },
  };
  return message;
}

// A pretend form with fields, one button and a message place.
function fakeForm(values) {
  const fields = {};
  const names = Object.keys(values);
  for (let i = 0; i < names.length; i++) {
    fields[names[i]] = { value: values[names[i]] };
  }

  const form = {
    elements: fields,
    buttons: [{ disabled: false }],
    message: fakeMessage(),
    handlers: {},
    prevented: false,
    addEventListener: (type, handler) => {
      form.handlers[type] = handler;
    },
    querySelectorAll: (selector) => {
      if (selector === 'button') {
        return form.buttons;
      }
      return [];
    },
    querySelector: (selector) => {
      if (selector === '[data-message]') {
        return form.message;
      }
      return null;
    },
    reset: () => {
      for (let i = 0; i < names.length; i++) {
        fields[names[i]].value = '';
      }
    },
    // The visitor presses "submit". We give back the promise of the handler, so the test can wait for it.
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

// A pretend "close account" box with its one button.
function fakeCloseBox() {
  const button = {
    disabled: false,
    handlers: {},
    addEventListener: (type, handler) => {
      button.handlers[type] = handler;
    },
  };
  const box = {
    button: button,
    message: fakeMessage(),
    querySelectorAll: (selector) => {
      if (selector === 'button') {
        return [button];
      }
      return [];
    },
    querySelector: (selector) => {
      if (selector === 'button') {
        return button;
      }
      if (selector === '[data-message]') {
        return box.message;
      }
      return null;
    },
  };
  return box;
}

// Builds the pretend page, runs the two real scripts in it, and gives back what a test needs.
// options.answer is what the pretend server says: { ok, body } (body null = no body), or 'network' for no connection.
// options.confirmAnswer is what the visitor clicks in the "are you sure" box.
// options.empty means a page that has none of the forms.
function startPage(options) {
  const detailsForm = fakeForm({ name: 'Ayesha', email: 'ayesha@example.com' });
  const passwordForm = fakeForm({ passwordCurrent: 'old-pass-1', password: 'new-pass-2', passwordConfirm: 'new-pass-2' });
  const closeBox = fakeCloseBox();
  const headerName = { textContent: 'Ayesha' };
  const calls = [];
  const assigned = [];
  const elements = { 'details-form': detailsForm, 'password-form': passwordForm, 'close-account': closeBox };

  const document = {
    getElementById: (id) => {
      if (options.empty) {
        return null;
      }
      return elements[id] || null;
    },
    querySelector: (selector) => {
      if (selector === '[data-user-name]') {
        return headerName;
      }
      return null;
    },
  };

  const window = {
    confirm: () => options.confirmAnswer !== false,
    location: {
      assign: (url) => {
        assigned.push(url);
      },
    },
  };

  const fakeFetch = async (url, settings) => {
    calls.push({
      url: url,
      method: settings.method,
      body: settings.body,
      // Were the buttons switched off while the request was on its way?
      disabledDuringCall: detailsForm.buttons[0].disabled || passwordForm.buttons[0].disabled || closeBox.button.disabled,
    });
    if (options.answer === 'network') {
      throw new Error('offline');
    }
    return {
      ok: options.answer.ok,
      json: async () => {
        if (options.answer.body === null) {
          throw new Error('no body');
        }
        return options.answer.body;
      },
    };
  };

  const context = vm.createContext({ document: document, window: window, fetch: fakeFetch });
  vm.runInContext(apiCode, context, { filename: 'api.js' });
  vm.runInContext(accountCode, context, { filename: 'account.js' });

  return { detailsForm, passwordForm, closeBox, headerName, calls, assigned };
}

describe('the details form', () => {
  it('sends PATCH /updateMe and then shows what the server saved', async () => {
    const page = startPage({
      answer: { ok: true, body: { status: 'success', data: { user: { name: 'Ayesha Khan', email: 'ayesha.khan@example.com' } } } },
    });
    page.detailsForm.elements.email.value = 'Ayesha.Khan@Example.com';

    await page.detailsForm.submit();

    assert.equal(page.detailsForm.prevented, true);
    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/users/updateMe');
    assert.equal(page.calls[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(page.calls[0].body), { name: 'Ayesha', email: 'Ayesha.Khan@Example.com' });
    assert.equal(page.calls[0].disabledDuringCall, true);
    assert.equal(page.detailsForm.buttons[0].disabled, false);
    assert.equal(page.detailsForm.elements.name.value, 'Ayesha Khan');
    assert.equal(page.detailsForm.elements.email.value, 'ayesha.khan@example.com');
    assert.equal(page.headerName.textContent, 'Ayesha Khan');
    assert.equal(page.detailsForm.message.textContent, 'Your details were saved.');
    assert.equal(page.detailsForm.message.isGood, true);
  });

  it('shows the message of the API when the change is refused, and changes nothing', async () => {
    const page = startPage({ answer: { ok: false, body: { status: 'fail', message: 'email is already taken' } } });

    await page.detailsForm.submit();

    assert.equal(page.detailsForm.message.textContent, 'email is already taken');
    assert.equal(page.detailsForm.message.isGood, false);
    assert.equal(page.headerName.textContent, 'Ayesha');
    assert.equal(page.detailsForm.elements.name.value, 'Ayesha');
    assert.equal(page.detailsForm.buttons[0].disabled, false);
  });

  it('says so when the server cannot be reached', async () => {
    const page = startPage({ answer: 'network' });

    await page.detailsForm.submit();

    assert.equal(page.detailsForm.message.textContent, 'Could not reach the server. Please try again.');
    assert.equal(page.detailsForm.buttons[0].disabled, false);
  });
});

describe('the password form', () => {
  it('sends the three passwords with PATCH /updateMyPassword and then empties the fields', async () => {
    const page = startPage({ answer: { ok: true, body: { status: 'success' } } });

    await page.passwordForm.submit();

    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/users/updateMyPassword');
    assert.equal(page.calls[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(page.calls[0].body), { passwordCurrent: 'old-pass-1', password: 'new-pass-2', passwordConfirm: 'new-pass-2' });
    assert.equal(page.passwordForm.elements.passwordCurrent.value, '');
    assert.equal(page.passwordForm.elements.password.value, '');
    assert.equal(page.passwordForm.elements.passwordConfirm.value, '');
    assert.equal(page.passwordForm.message.textContent, 'Your password was changed.');
    assert.equal(page.passwordForm.message.isGood, true);
    assert.equal(page.passwordForm.buttons[0].disabled, false);
  });

  it('keeps what the visitor typed when the current password is wrong', async () => {
    const page = startPage({ answer: { ok: false, body: { status: 'fail', message: 'Your current password is wrong' } } });

    await page.passwordForm.submit();

    assert.equal(page.passwordForm.message.textContent, 'Your current password is wrong');
    assert.equal(page.passwordForm.message.isGood, false);
    assert.equal(page.passwordForm.elements.passwordCurrent.value, 'old-pass-1');
    assert.equal(page.passwordForm.elements.password.value, 'new-pass-2');
  });
});

describe('the close account button', () => {
  it('does nothing when the visitor says no in the "are you sure" box', async () => {
    const page = startPage({ confirmAnswer: false, answer: { ok: true, body: null } });

    await page.closeBox.button.handlers.click();

    assert.equal(page.calls.length, 0);
    assert.deepEqual(page.assigned, []);
    assert.equal(page.closeBox.button.disabled, false);
  });

  it('sends DELETE /deleteMe without a body and goes to the home page', async () => {
    // The API answers 204 with no body at all.
    const page = startPage({ answer: { ok: true, body: null } });

    await page.closeBox.button.handlers.click();

    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/users/deleteMe');
    assert.equal(page.calls[0].method, 'DELETE');
    assert.equal(page.calls[0].body, undefined);
    assert.deepEqual(page.assigned, ['/']);
  });

  it('shows the message and stays on the page when the account cannot be closed', async () => {
    const page = startPage({ answer: { ok: false, body: { status: 'fail', message: 'You are the only admin. Make another user an admin before closing your account' } } });

    await page.closeBox.button.handlers.click();

    assert.equal(page.closeBox.message.textContent, 'You are the only admin. Make another user an admin before closing your account');
    assert.deepEqual(page.assigned, []);
    assert.equal(page.closeBox.button.disabled, false);
  });
});

describe('a page without the forms', () => {
  it('runs the script without an error', () => {
    assert.doesNotThrow(() => startPage({ empty: true, answer: { ok: true, body: null } }));
  });
});