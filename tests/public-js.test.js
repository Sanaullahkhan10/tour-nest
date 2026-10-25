// tests/public-js.test.js - the scripts that run in the browser.
// While we test the server, nobody runs these scripts, so a typing mistake in one of them would only
// show up in a visitor's browser. Here every script is compiled (not run) to catch such mistakes,
// and the shared helper showMessage is tried with a pretend form.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.join(__dirname, '..', 'public', 'js');
const files = fs.readdirSync(folder).filter((name) => name.endsWith('.js'));

describe('the scripts of the website', () => {
  it('are all there', () => {
    assert.ok(files.includes('api.js'));
    assert.ok(files.includes('auth.js'));
    assert.ok(files.includes('reviews.js'));
    assert.ok(files.includes('account.js'));
  });

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    it(name + ' has no syntax error', () => {
      const code = fs.readFileSync(path.join(folder, name), 'utf8');
      assert.doesNotThrow(() => new vm.Script(code, { filename: name }));
    });
  }
});

describe('showMessage', () => {
  // Runs api.js in a sandbox. The function showMessage then exists in the sandbox.
  function loadApi() {
    const context = vm.createContext({ fetch: async () => ({ ok: true, json: async () => ({}) }) });
    vm.runInContext(fs.readFileSync(path.join(folder, 'api.js'), 'utf8'), context, { filename: 'api.js' });
    return context;
  }

  // A pretend form with one message place.
  function fakeForm() {
    const place = { textContent: 'old', good: null };
    place.classList = {
      toggle: (name, on) => {
        assert.equal(name, 'form__message--good');
        place.good = on;
      },
    };
    return {
      place: place,
      querySelector: (selector) => {
        if (selector === '[data-message]') {
          return place;
        }
        return null;
      },
    };
  }

  it('shows good news in the green style when the third value is true', () => {
    const context = loadApi();
    const form = fakeForm();
    context.showMessage(form, 'Saved', true);
    assert.equal(form.place.textContent, 'Saved');
    assert.equal(form.place.good, true);
  });

  it('shows an error without the green style when the third value is left out', () => {
    const context = loadApi();
    const form = fakeForm();
    context.showMessage(form, 'Oops');
    assert.equal(form.place.textContent, 'Oops');
    assert.equal(form.place.good, false);
  });

  it('does nothing when the form has no place for a message', () => {
    const context = loadApi();
    assert.doesNotThrow(() => context.showMessage({ querySelector: () => null }, 'Hello', true));
  });
});