// tests/photo-script.test.js - the photo card of the My account page, run against a pretend page
// (the real api.js and account.js run in a sandbox, the same way as tests/account-script.test.js).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.join(__dirname, '..', 'public', 'js');
const apiCode = fs.readFileSync(path.join(folder, 'api.js'), 'utf8');
const accountCode = fs.readFileSync(path.join(folder, 'account.js'), 'utf8');

const newId = '64b7f0c2a1b2c3d4e5f6cccc';

// A pretend FormData: it only remembers what was added.
class FakeFormData {
  constructor() {
    this.items = [];
  }
  append(name, value) {
    this.items.push([name, value]);
  }
}

// Builds the pretend page with the photo card, runs the real scripts, and gives back what a test needs.
// options.file is the chosen file ({ size, name }) or null. options.answer is what the pretend server says.
function startPage(options) {
  const message = { textContent: 'old', isGood: null };
  message.classList = {
    toggle: (name, on) => {
      assert.equal(name, 'form__message--good');
      message.isGood = on;
    },
  };
  const buttons = [{ disabled: false }, { disabled: false, handlers: {}, addEventListener: (type, handler) => (buttons[1].handlers[type] = handler) }];
  const form = {
    elements: { photo: { files: options.file ? [options.file] : [] } },
    handlers: {},
    resets: 0,
    prevented: false,
    addEventListener: (type, handler) => {
      form.handlers[type] = handler;
    },
    querySelectorAll: (selector) => (selector === 'button' ? buttons : []),
    querySelector: (selector) => {
      if (selector === '[data-message]') {
        return message;
      }
      if (selector === '[data-remove-photo]') {
        return buttons[1];
      }
      return null;
    },
    reset: () => {
      form.resets++;
    },
    submit: () => form.handlers.submit({ preventDefault: () => (form.prevented = true) }),
  };
  const preview = { src: '/img/default-user.svg' };
  const headerPhoto = { src: '/img/default-user.svg' };
  const calls = [];

  const document = {
    getElementById: (id) => (id === 'photo-form' ? form : null),
    querySelector: (selector) => {
      if (selector === '[data-photo-preview]') {
        return preview;
      }
      if (selector === '[data-user-photo]') {
        return headerPhoto;
      }
      return null;
    },
  };
  const fetch = async (url, settings) => {
    calls.push({ url: url, settings: settings });
    if (options.answer === 'network') {
      throw new Error('offline');
    }
    return { ok: options.answer.ok, json: async () => options.answer.body };
  };

  const context = vm.createContext({ document: document, window: { confirm: () => true, location: { assign: () => {} } }, fetch: fetch, FormData: FakeFormData });
  vm.runInContext(apiCode, context, { filename: 'api.js' });
  vm.runInContext(accountCode, context, { filename: 'account.js' });
  return { form: form, message: message, buttons: buttons, preview: preview, headerPhoto: headerPhoto, calls: calls };
}

const saved = { ok: true, body: { status: 'success', data: { user: { photo: newId } } } };

describe('the photo card: choosing a file', () => {
  it('asks for a picture when no file is chosen, and sends nothing', async () => {
    const page = startPage({ file: null, answer: saved });
    await page.form.submit();
    assert.equal(page.message.textContent, 'Please choose a picture first.');
    assert.equal(page.calls.length, 0);
  });

  it('refuses a file over 5 MB before sending it', async () => {
    const page = startPage({ file: { size: 6 * 1024 * 1024, name: 'big.jpg' }, answer: saved });
    await page.form.submit();
    assert.equal(page.message.textContent, 'That file is too big. The limit is 5 MB.');
    assert.equal(page.calls.length, 0);
  });
});

describe('the photo card: uploading', () => {
  it('sends the file as a form with PATCH, and shows the new photo in the card and in the header', async () => {
    const file = { size: 1000, name: 'me.jpg' };
    const page = startPage({ file: file, answer: saved });
    await page.form.submit();

    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/users/updateMyPhoto');
    assert.equal(page.calls[0].settings.method, 'PATCH');
    assert.ok(page.calls[0].settings.body instanceof FakeFormData);
    assert.deepEqual(page.calls[0].settings.body.items, [['photo', file]]);
    // The browser must set the Content-Type itself (it adds the boundary of the form).
    assert.equal(page.calls[0].settings.headers, undefined);

    assert.equal(page.preview.src, '/img/' + newId);
    assert.equal(page.headerPhoto.src, '/img/' + newId);
    assert.equal(page.message.textContent, 'Your photo was saved.');
    assert.equal(page.message.isGood, true);
    assert.equal(page.form.resets, 1);
    assert.equal(page.buttons[0].disabled, false);
    assert.equal(page.buttons[1].disabled, false);
  });

  it('shows the message of the API when it refuses, and keeps the old photo', async () => {
    const page = startPage({ file: { size: 1000, name: 'me.txt' }, answer: { ok: false, body: { message: 'We could not read that file.' } } });
    await page.form.submit();
    assert.equal(page.message.textContent, 'We could not read that file.');
    assert.equal(page.message.isGood, false);
    assert.equal(page.preview.src, '/img/default-user.svg');
    assert.equal(page.buttons[0].disabled, false);
  });

  it('shows a plain message when the server cannot be reached', async () => {
    const page = startPage({ file: { size: 1000, name: 'me.jpg' }, answer: 'network' });
    await page.form.submit();
    assert.equal(page.message.textContent, 'Could not reach the server. Please try again.');
    assert.equal(page.buttons[0].disabled, false);
  });
});

describe('the photo card: removing', () => {
  it('asks the API to remove the photo and goes back to the plain avatar', async () => {
    const page = startPage({ file: null, answer: { ok: true, body: { status: 'success', data: { user: { photo: 'default.jpg' } } } } });
    await page.buttons[1].handlers.click();

    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/users/deleteMyPhoto');
    assert.equal(page.calls[0].settings.method, 'DELETE');
    assert.equal(page.preview.src, '/img/default-user.svg');
    assert.equal(page.headerPhoto.src, '/img/default-user.svg');
    assert.equal(page.message.textContent, 'Your photo was removed.');
    assert.equal(page.message.isGood, true);
  });
});
