// tests/admin-script.test.js - the script of the admin tour pages (list buttons and the tour form),
// run against a pretend page. The real api.js and admin-tours.js run in a sandbox.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.join(__dirname, '..', 'public', 'js');
const apiCode = fs.readFileSync(path.join(folder, 'api.js'), 'utf8');
const adminCode = fs.readFileSync(path.join(folder, 'admin-tours.js'), 'utf8');

class FakeFormData {
  constructor() {
    this.items = [];
  }
  append(name, value) {
    this.items.push([name, value]);
  }
}

// Objects made inside the sandbox are not "the same kind" as ours, so we compare them as plain JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

const field = (value) => ({ value: value === undefined ? '' : value });

// A row of the stops: its fields are found by data-field="day" and so on.
function makeRow(values, rows) {
  const row = {
    removed: false,
    querySelector: (selector) => field(values[/"(\w+)"/.exec(selector)[1]]),
    remove: () => {
      row.removed = true;
      if (rows) {
        rows.splice(rows.indexOf(row), 1);
      }
    },
  };
  return row;
}

// The values of a good form. "extra" changes some of them.
function goodValues(extra) {
  return Object.assign(
    { name: ' The Hunza Valley Explorer ', summary: 'Seven days.', description: 'Start in Karimabad.', difficulty: 'easy', duration: '7', maxGroupSize: '12', price: '95000', startDates: '2027-04-15\n\n 2027-05-20 \r\n', startAddress: 'Karimabad, Hunza', startDescription: '', startLat: '36.3269', startLng: '74.6614' },
    extra || {}
  );
}

// Builds the pretend page and runs the real scripts in it.
// options: values, hidden (secretTour), stops (list of value objects), guides ([{value, checked}]), tourId,
//          cover, gallery (files), answers (what the pretend server says, one for each request), buttons.
function startPage(options) {
  const rows = (options.stops || []).map((values) => makeRow(values));
  const container = {
    handlers: {},
    querySelectorAll: () => rows,
    appendChild: (row) => rows.push(row),
    addEventListener: (type, handler) => (container.handlers[type] = handler),
  };
  const template = { content: { firstElementChild: { cloneNode: () => makeRow({}, rows) } } };
  rows.forEach((row) => {
    const original = row.remove;
    row.remove = () => {
      original();
      rows.splice(rows.indexOf(row), 1);
    };
  });

  const message = { textContent: 'old', isGood: null };
  message.classList = { toggle: (name, on) => (message.isGood = on) };
  const submitButton = { disabled: false };
  const addButton = { handlers: {}, addEventListener: (type, handler) => (addButton.handlers[type] = handler) };
  const values = goodValues(options.values);
  let form = null;
  if (!options.noForm) {
    form = {
      dataset: { tourId: options.tourId || '' },
      handlers: {},
      elements: {
        name: field(values.name), summary: field(values.summary), description: field(values.description), difficulty: field(values.difficulty),
        secretTour: { checked: Boolean(options.hidden) },
        duration: field(values.duration), maxGroupSize: field(values.maxGroupSize), price: field(values.price), startDates: field(values.startDates),
        startAddress: field(values.startAddress), startDescription: field(values.startDescription), startLat: field(values.startLat), startLng: field(values.startLng),
        imageCover: { files: options.cover ? [options.cover] : [] },
        images: { files: options.gallery || [] },
      },
      addEventListener: (type, handler) => (form.handlers[type] = handler),
      querySelectorAll: (selector) => (selector === '[data-stop]' ? rows : selector === 'input[name="guides"]' ? options.guides || [] : []),
      querySelector: (selector) => (selector === '[data-message]' ? message : selector === 'button[type="submit"]' ? submitButton : selector === '[data-add-stop]' ? addButton : null),
      submit: () => form.handlers.submit({ preventDefault: () => {} }),
    };
  }

  const makeButton = (dataset) => {
    const button = { disabled: false, dataset: dataset, handlers: {} };
    button.addEventListener = (type, handler) => (button.handlers[type] = handler);
    return button;
  };
  const toggleButtons = (options.toggles || []).map(makeButton);
  const deleteButtons = (options.deletes || []).map(makeButton);

  const calls = [];
  const assigned = [];
  const alerts = [];
  let reloads = 0;
  let asked = 0;
  const document = {
    getElementById: (id) => (id === 'tour-form' ? form : id === 'stops' ? container : id === 'stop-template' ? template : null),
    querySelectorAll: (selector) => (selector === '[data-toggle-hidden]' ? toggleButtons : selector === '[data-delete-tour]' ? deleteButtons : []),
  };
  const window = {
    location: { assign: (url) => assigned.push(url), reload: () => reloads++ },
    confirm: () => {
      asked++;
      return options.confirm !== false;
    },
    alert: (text) => alerts.push(text),
  };
  const answers = (options.answers || []).slice();
  const fetch = async (url, settings) => {
    calls.push({ url: url, method: settings.method, body: typeof settings.body === 'string' ? JSON.parse(settings.body) : settings.body, headers: settings.headers });
    const answer = answers.shift() || { ok: true, body: {} };
    if (answer === 'network') {
      throw new Error('offline');
    }
    return { ok: answer.ok, json: async () => answer.body };
  };

  const context = vm.createContext({ document: document, window: window, fetch: fetch, FormData: FakeFormData });
  vm.runInContext(apiCode, context, { filename: 'api.js' });
  vm.runInContext(adminCode, context, { filename: 'admin-tours.js' });
  return { form: form, rows: rows, container: container, template: template, message: message, submitButton: submitButton, addButton: addButton, toggleButtons: toggleButtons, deleteButtons: deleteButtons, calls: calls, assigned: assigned, alerts: alerts, reloads: () => reloads, asked: () => asked, tools: window.tourFormTools };
}

const goodStop = { day: '1', description: 'Baltit Fort', lat: '36.3', lng: '74.6' };

describe('readTourForm', () => {
  it('turns a good form into the body of the API', () => {
    const page = startPage({ stops: [goodStop, { day: '2', description: 'Attabad Lake', lat: '36.4', lng: '74.9' }], guides: [{ value: 'g1', checked: true }, { value: 'g2', checked: false }, { value: 'g3', checked: true }] });
    const result = page.tools.readTourForm(page.form);
    assert.equal(result.error, undefined);
    assert.deepEqual(plain(result.body), {
      name: 'The Hunza Valley Explorer',
      summary: 'Seven days.',
      description: 'Start in Karimabad.',
      difficulty: 'easy',
      secretTour: false,
      duration: 7,
      maxGroupSize: 12,
      price: 95000,
      startDates: ['2027-04-15', '2027-05-20'],
      startLocation: { type: 'Point', coordinates: [74.6614, 36.3269], address: 'Karimabad, Hunza' },
      locations: [
        { type: 'Point', coordinates: [74.6, 36.3], description: 'Baltit Fort', day: 1 },
        { type: 'Point', coordinates: [74.9, 36.4], description: 'Attabad Lake', day: 2 },
      ],
      guides: ['g1', 'g3'],
    });
  });

  it('writes the coordinates with the longitude first, and keeps the hidden choice', () => {
    const page = startPage({ hidden: true, values: { startDescription: 'Below the fort' } });
    const body = page.tools.readTourForm(page.form).body;
    assert.deepEqual(plain(body.startLocation.coordinates), [74.6614, 36.3269]);
    assert.equal(body.startLocation.description, 'Below the fort');
    assert.equal(body.secretTour, true);
  });

  it('leaves out a number that was not written, so the API can say what is missing', () => {
    const page = startPage({ values: { duration: '', price: '  ' } });
    const body = page.tools.readTourForm(page.form).body;
    assert.equal('duration' in body, false);
    assert.equal('price' in body, false);
    assert.equal(body.maxGroupSize, 12);
  });

  it('refuses a start date that is not like 2027-04-15, and says which one', () => {
    for (const bad of ['15-04-2027', '2027/04/15', '2027-13-45', 'soon']) {
      const page = startPage({ values: { startDates: '2027-04-15\n' + bad } });
      const result = page.tools.readTourForm(page.form);
      assert.ok(result.error.includes(bad), bad);
      assert.equal(result.body, undefined);
    }
  });

  it('has no start location when its fields are all empty', () => {
    const page = startPage({ values: { startAddress: '', startLat: '', startLng: '' } });
    assert.equal('startLocation' in page.tools.readTourForm(page.form).body, false);
  });

  it('needs both numbers for the start location, inside the real limits', () => {
    for (const values of [{ startLat: '' }, { startLng: '' }, { startLat: 'abc' }, { startLat: '91' }, { startLng: '-181' }, { startLat: '' , startLng: '' }]) {
      const page = startPage({ values: values });
      assert.ok(page.tools.readTourForm(page.form).error.includes('start location'), JSON.stringify(values));
    }
  });

  it('skips an empty stop, and numbers the stops that have a problem', () => {
    const empty = { day: '', description: '', lat: '', lng: '' };
    assert.equal(startPage({ stops: [empty] }).tools.readTourForm(startPage({ stops: [empty] }).form).body.locations.length, 0);
    const cases = [
      [[goodStop, { day: '', description: 'x', lat: '1', lng: '1' }], 'Stop 2: the day'],
      [[goodStop, { day: '2.5', description: 'x', lat: '1', lng: '1' }], 'Stop 2: the day'],
      [[{ day: '0', description: 'x', lat: '1', lng: '1' }], 'Stop 1: the day'],
      [[goodStop, { day: '2', description: '', lat: '1', lng: '1' }], 'Stop 2: please write'],
      [[goodStop, { day: '2', description: 'x', lat: 'north', lng: '1' }], 'Stop 2: it needs a latitude'],
      [[{ day: '1', description: 'x', lat: '1', lng: '200' }], 'Stop 1: it needs a latitude'],
    ];
    for (const [stops, text] of cases) {
      const page = startPage({ stops: stops });
      assert.ok(page.tools.readTourForm(page.form).error.startsWith(text), text);
    }
  });
});

describe('readPictures', () => {
  it('gives the cover and the gallery files', () => {
    const cover = { name: 'c.jpg', size: 1000 };
    const gallery = [{ name: '1.jpg', size: 1 }, { name: '2.jpg', size: 2 }];
    const page = startPage({ cover: cover, gallery: gallery });
    assert.deepEqual(plain(page.tools.readPictures(page.form)), plain({ cover: cover, gallery: gallery }));
    const none = startPage({});
    assert.deepEqual(plain(none.tools.readPictures(none.form)), { cover: null, gallery: [] });
  });

  it('refuses more than 3 gallery pictures, and a picture over 5 MB', () => {
    const four = startPage({ gallery: [1, 2, 3, 4].map((n) => ({ name: n + '.jpg', size: 10 })) });
    assert.ok(four.tools.readPictures(four.form).error.includes('at most 3'));
    const big = startPage({ cover: { name: 'huge.jpg', size: 6 * 1024 * 1024 } });
    assert.ok(big.tools.readPictures(big.form).error.includes('"huge.jpg" is too big'));
  });
});

describe('the stops in the form', () => {
  it('Add a stop puts a blank row from the template into the list', () => {
    const page = startPage({ stops: [goodStop] });
    page.addButton.handlers.click();
    assert.equal(page.rows.length, 2);
  });

  it('refuses a 21st stop', () => {
    const page = startPage({ stops: new Array(20).fill(goodStop) });
    page.addButton.handlers.click();
    assert.equal(page.rows.length, 20);
    assert.equal(page.message.textContent, 'A tour can have at most 20 stops.');
  });

  it('Remove takes out the row of its own button', () => {
    const page = startPage({ stops: [goodStop, goodStop] });
    const row = page.rows[0];
    page.container.handlers.click({ target: { closest: (selector) => (selector === '[data-remove-stop]' ? { closest: () => row } : null) } });
    assert.equal(row.removed, true);
    assert.equal(page.rows.length, 1);
    // A click on something else does nothing.
    page.container.handlers.click({ target: { closest: () => null } });
    assert.equal(page.rows.length, 1);
  });
});

describe('saving the form', () => {
  const created = { ok: true, body: { data: { tour: { _id: 'newid1' } } } };

  it('makes a new tour with POST and goes to the list', async () => {
    const page = startPage({ answers: [created] });
    await page.form.submit();
    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].url, '/api/v1/tours');
    assert.equal(page.calls[0].method, 'POST');
    assert.equal(page.calls[0].body.name, 'The Hunza Valley Explorer');
    assert.deepEqual(page.assigned, ['/admin/tours']);
  });

  it('changes a tour that exists with PATCH to its own address', async () => {
    const page = startPage({ tourId: 'abc/1', answers: [{ ok: true, body: { data: { tour: { _id: 'abc/1' } } } }] });
    await page.form.submit();
    assert.equal(page.calls[0].url, '/api/v1/tours/abc%2F1');
    assert.equal(page.calls[0].method, 'PATCH');
  });

  it('then sends the chosen pictures as a form, to the pictures address of the saved tour', async () => {
    const cover = { name: 'c.jpg', size: 10 };
    const g1 = { name: '1.jpg', size: 10 };
    const page = startPage({ cover: cover, gallery: [g1], answers: [created, { ok: true, body: {} }] });
    await page.form.submit();
    assert.equal(page.calls.length, 2);
    assert.equal(page.calls[1].url, '/api/v1/tours/newid1/images');
    assert.equal(page.calls[1].method, 'PATCH');
    assert.deepEqual(plain(page.calls[1].body.items), plain([['imageCover', cover], ['images', g1]]));
    // The browser must add the Content-Type of the form itself.
    assert.equal(page.calls[1].headers, undefined);
    assert.deepEqual(page.assigned, ['/admin/tours']);
  });

  it('shows the message of the API when the tour is refused, and sends no pictures', async () => {
    const page = startPage({ cover: { name: 'c.jpg', size: 10 }, answers: [{ ok: false, body: { message: 'A tour name must have at least 5 characters' } }] });
    await page.form.submit();
    assert.equal(page.message.textContent, 'A tour name must have at least 5 characters');
    assert.equal(page.submitButton.disabled, false);
    assert.equal(page.calls.length, 1);
    assert.deepEqual(page.assigned, []);
  });

  it('keeps the form on the saved tour when only the pictures fail, so the next save does not make a second tour', async () => {
    const page = startPage({ cover: { name: 'c.jpg', size: 10 }, answers: [created, { ok: false, body: { message: 'We could not read that file.' } }, { ok: true, body: { data: { tour: { _id: 'newid1' } } } }, { ok: true, body: {} }] });
    await page.form.submit();
    assert.equal(page.message.textContent, 'The tour was saved, but the pictures were not: We could not read that file.');
    assert.equal(page.form.dataset.tourId, 'newid1');
    assert.deepEqual(page.assigned, []);
    await page.form.submit();
    assert.equal(page.calls[2].method, 'PATCH');
    assert.equal(page.calls[2].url, '/api/v1/tours/newid1');
  });

  it('shows a problem with the fields or the pictures without sending anything', async () => {
    const badDate = startPage({ values: { startDates: 'soon' } });
    await badDate.form.submit();
    assert.ok(badDate.message.textContent.includes('Start dates must look like'));
    const tooMany = startPage({ gallery: [1, 2, 3, 4].map((n) => ({ name: n + '.jpg', size: 1 })) });
    await tooMany.form.submit();
    assert.ok(tooMany.message.textContent.includes('at most 3'));
    assert.equal(badDate.calls.length + tooMany.calls.length, 0);
  });

  it('shows a plain message when the server cannot be reached', async () => {
    const page = startPage({ answers: ['network'] });
    await page.form.submit();
    assert.equal(page.message.textContent, 'Could not reach the server. Please try again.');
    assert.equal(page.submitButton.disabled, false);
  });
});

describe('the buttons of the list', () => {
  it('Hide sends secretTour true, and Show sends secretTour false, then reloads', async () => {
    const page = startPage({ noForm: true, toggles: [{ toggleHidden: 'id1', hidden: 'false' }, { toggleHidden: 'id2', hidden: 'true' }] });
    await page.toggleButtons[0].handlers.click();
    await page.toggleButtons[1].handlers.click();
    assert.deepEqual(page.calls.map((call) => [call.url, call.method, call.body]), [
      ['/api/v1/tours/id1', 'PATCH', { secretTour: true }],
      ['/api/v1/tours/id2', 'PATCH', { secretTour: false }],
    ]);
    assert.equal(page.reloads(), 2);
  });

  it('tells the admin when the API refuses, and turns the button on again', async () => {
    const page = startPage({ noForm: true, toggles: [{ toggleHidden: 'id1', hidden: 'false' }], answers: [{ ok: false, body: { message: 'No tour found with that id' } }] });
    await page.toggleButtons[0].handlers.click();
    assert.deepEqual(page.alerts, ['No tour found with that id']);
    assert.equal(page.toggleButtons[0].disabled, false);
    assert.equal(page.reloads(), 0);
  });

  it('Delete asks first, and does nothing when the admin says no', async () => {
    const page = startPage({ noForm: true, confirm: false, deletes: [{ deleteTour: 'id1', name: 'Old tour' }] });
    await page.deleteButtons[0].handlers.click();
    assert.equal(page.asked(), 1);
    assert.equal(page.calls.length, 0);
  });

  it('Delete sends DELETE and goes to the list', async () => {
    const page = startPage({ noForm: true, deletes: [{ deleteTour: 'id1', name: 'Old tour' }] });
    await page.deleteButtons[0].handlers.click();
    assert.deepEqual(page.calls.map((call) => [call.url, call.method]), [['/api/v1/tours/id1', 'DELETE']]);
    assert.deepEqual(page.assigned, ['/admin/tours']);
  });

  it('a page with none of these parts does nothing and throws nothing', () => {
    assert.doesNotThrow(() => startPage({ noForm: true }));
  });
});
