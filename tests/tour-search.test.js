// tests/tour-search.test.js - the search form of the home page: the helper that reads the address,
// the form in the template, and the route. No database: the tour search is replaced by a fake.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const Tour = require('../models/tourModel');
const { readSearch, sortLabels } = require('../utils/tourSearch');
const { startApp } = require('./helpers');

describe('readSearch', () => {
  it('gives an empty filter and the order by name when the address has no search', () => {
    for (const query of [{}, undefined, null]) {
      const search = readSearch(query);
      assert.deepEqual(search.filter, {});
      assert.deepEqual(search.sort, { name: 1, _id: 1 });
      assert.deepEqual(search.shown, { q: '', difficulty: '', maxPrice: '', sort: 'name' });
      assert.equal(search.filtersActive, false);
      assert.equal(search.anythingChanged, false);
    }
  });

  it('looks for the words in the name and in the summary, without caring for capital letters', () => {
    const search = readSearch({ q: '  Hunza  ' });
    assert.equal(search.shown.q, 'Hunza');
    assert.deepEqual(search.filter.$or, [{ name: { $regex: 'Hunza', $options: 'i' } }, { summary: { $regex: 'Hunza', $options: 'i' } }]);
    assert.equal(search.filtersActive, true);
  });

  it('looks for the words as plain letters: nobody can send a pattern', () => {
    const search = readSearch({ q: 'a.b(c)*' });
    const pattern = new RegExp(search.filter.$or[0].name.$regex, 'i');
    assert.ok(pattern.test('xx a.b(c)* yy'));
    assert.ok(!pattern.test('aXb(c)'));
    assert.ok(!pattern.test('ab'));
    // A pattern that would hang a regular expression is just text too.
    const nasty = readSearch({ q: '(a+)+$' });
    assert.ok(new RegExp(nasty.filter.$or[0].name.$regex).test('(a+)+$'));
  });

  it('cuts the words at 50 characters, and ignores empty words and lists', () => {
    assert.equal(readSearch({ q: 'x'.repeat(80) }).shown.q.length, 50);
    assert.equal(readSearch({ q: '   ' }).filtersActive, false);
    assert.equal(readSearch({ q: ['a', 'b'] }).filtersActive, false);
    assert.equal(readSearch({ q: { $ne: 'x' } }).filtersActive, false);
  });

  it('takes only the three difficulties', () => {
    assert.equal(readSearch({ difficulty: 'easy' }).filter.difficulty, 'easy');
    assert.equal(readSearch({ difficulty: 'medium' }).filter.difficulty, 'medium');
    assert.equal(readSearch({ difficulty: 'difficult' }).filter.difficulty, 'difficult');
    for (const bad of ['EASY', 'hard', '', ['easy'], { $ne: 'easy' }, 'easy ']) {
      const search = readSearch({ difficulty: bad });
      if (bad === 'easy ') {
        assert.equal(search.filter.difficulty, 'easy');
      } else {
        assert.equal(search.filter.difficulty, undefined, JSON.stringify(bad));
      }
    }
  });

  it('takes the top price only as a whole number from 1 to 8 digits', () => {
    assert.deepEqual(readSearch({ maxPrice: '95000' }).filter.price, { $lte: 95000 });
    assert.equal(readSearch({ maxPrice: '95000' }).shown.maxPrice, '95000');
    assert.equal(readSearch({ maxPrice: '007' }).shown.maxPrice, '7');
    for (const bad of ['0', '00', '-5', '12.5', '1e5', 'abc', '', '123456789', ' ', ['5'], { $gt: 1 }]) {
      assert.equal(readSearch({ maxPrice: bad }).filter.price, undefined, JSON.stringify(bad));
    }
  });

  it('knows five orders, and uses the order by name for anything else', () => {
    const orders = { name: { name: 1, _id: 1 }, 'price-low': { price: 1, ratingsAverage: -1, _id: 1 }, 'price-high': { price: -1, ratingsAverage: -1, _id: 1 }, rating: { ratingsAverage: -1, ratingsQuantity: -1, _id: 1 }, shortest: { duration: 1, _id: 1 } };
    for (const key of Object.keys(orders)) {
      assert.deepEqual(readSearch({ sort: key }).sort, orders[key], key);
    }
    for (const bad of ['price', '-price', 'toString', '__proto__', 'constructor', ['rating'], 7]) {
      const search = readSearch({ sort: bad });
      assert.deepEqual(search.sort, orders.name, String(bad));
      assert.equal(search.shown.sort, 'name');
    }
    assert.deepEqual(sortLabels.map((entry) => entry[0]), Object.keys(orders));
  });

  it('a different order alone is a change (Clear link), but not a filter', () => {
    const search = readSearch({ sort: 'rating' });
    assert.equal(search.filtersActive, false);
    assert.equal(search.anythingChanged, true);
  });

  it('puts everything together', () => {
    const search = readSearch({ q: 'lake', difficulty: 'easy', maxPrice: '100000', sort: 'price-low', other: 'ignored' });
    assert.equal(search.filter.difficulty, 'easy');
    assert.deepEqual(search.filter.price, { $lte: 100000 });
    assert.equal(search.filter.$or.length, 2);
    assert.deepEqual(Object.keys(search.filter).sort(), ['$or', 'difficulty', 'price']);
  });
});

function render(data) {
  return new Promise((resolve, reject) => {
    app.render('overview', Object.assign({ title: 'All tours' }, data), (error, html) => (error ? reject(error) : resolve(html)));
  });
}
const tour = { _id: '64b7f0c2a1b2c3d4e5f60001', name: 'The Hunza Valley Explorer', duration: 7, maxGroupSize: 12, difficulty: 'easy', price: 95000, summary: 'Seven relaxed days.', ratingsAverage: 4.5, ratingsQuantity: 2, startDates: [] };
const startForm = readSearch({});

describe('the search form in the template', () => {
  it('has the five fields and the search button, filled with the start values', async () => {
    const html = await render({ tours: [tour], search: startForm.shown, sortLabels: sortLabels, filtersActive: false, anythingChanged: false });
    assert.ok(html.includes('role="search"'));
    assert.ok(html.includes('method="get"'));
    assert.ok(html.includes('name="q"'));
    assert.ok(html.includes('name="difficulty"'));
    assert.ok(html.includes('name="maxPrice"'));
    assert.ok(html.includes('name="sort"'));
    assert.ok(html.includes('>Search</button>'));
    for (const label of ['Name (A to Z)', 'Price: low to high', 'Price: high to low', 'Best rated', 'Shortest first', 'Easy', 'Medium', 'Difficult']) {
      assert.ok(html.includes('>' + label + '<'), label);
    }
    assert.ok(!html.includes('search__clear'));
    assert.ok(!html.includes('search__count'));
  });

  it('puts the values of the visitor back in the form, and offers Clear', async () => {
    const search = readSearch({ q: 'hunza', difficulty: 'medium', maxPrice: '95000', sort: 'rating' });
    const html = await render({ tours: [tour], search: search.shown, sortLabels: sortLabels, filtersActive: search.filtersActive, anythingChanged: search.anythingChanged });
    assert.ok(html.includes('value="hunza"'));
    assert.ok(html.includes('value="95000"'));
    assert.ok(/<option value="medium" selected>/.test(html));
    assert.ok(/<option value="rating" selected>/.test(html));
    assert.ok(html.includes('class="search__clear" href="/"'));
    assert.ok(html.includes('1 tour found'));
  });

  it('turns HTML in the words into harmless text', async () => {
    const search = readSearch({ q: '"><script>alert(1)</script>' });
    const html = await render({ tours: [], search: search.shown, sortLabels: sortLabels, filtersActive: true, anythingChanged: true });
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
  });

  it('counts the tours that were found', async () => {
    const search = readSearch({ difficulty: 'easy' });
    const html = await render({ tours: [tour, Object.assign({}, tour, { _id: '64b7f0c2a1b2c3d4e5f60002' })], search: search.shown, sortLabels: sortLabels, filtersActive: true, anythingChanged: true });
    assert.ok(html.includes('2 tours found'));
  });

  it('says that nothing matches, with a Clear link, when a search finds no tour', async () => {
    const search = readSearch({ q: 'nothing' });
    const html = await render({ tours: [], search: search.shown, sortLabels: sortLabels, filtersActive: true, anythingChanged: true });
    assert.ok(html.includes('No tours match your search.'));
    assert.ok(!html.includes('There are no tours yet'));
  });

  it('keeps the old message when there are no tours at all', async () => {
    const html = await render({ tours: [], search: startForm.shown, sortLabels: sortLabels, filtersActive: false, anythingChanged: false });
    assert.ok(html.includes('There are no tours yet. Please come back soon.'));
  });

  it('still draws without any search data (the old way)', async () => {
    const html = await render({ tours: [tour] });
    assert.ok(!html.includes('role="search"'));
    assert.ok(html.includes('The Hunza Valley Explorer'));
  });
});

describe('GET /', () => {
  let site;
  let found;
  const calls = [];

  before(async () => {
    mock.method(Tour, 'find', (filter) => {
      calls.push({ filter: filter });
      const chain = {};
      for (const step of ['sort', 'select', 'limit']) {
        chain[step] = (...args) => {
          calls.push({ step: step, args: args });
          return chain;
        };
      }
      chain.lean = () => Promise.resolve(found);
      return chain;
    });
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });
  beforeEach(() => {
    found = [tour];
    calls.length = 0;
  });
  const sortCall = () => calls.find((entry) => entry.step === 'sort').args[0];

  it('without a search, finds every tour in the order by name', async () => {
    const reply = await fetch(site.baseUrl + '/');
    assert.equal(reply.status, 200);
    assert.deepEqual(calls[0].filter, {});
    assert.deepEqual(sortCall(), { name: 1, _id: 1 });
  });

  it('gives the search of the address to the database, in a safe form', async () => {
    const html = await (await fetch(site.baseUrl + '/?q=hunza&difficulty=easy&maxPrice=100000&sort=price-high')).text();
    assert.deepEqual(calls[0].filter.difficulty, 'easy');
    assert.deepEqual(calls[0].filter.price, { $lte: 100000 });
    assert.equal(calls[0].filter.$or.length, 2);
    assert.deepEqual(sortCall(), { price: -1, ratingsAverage: -1, _id: 1 });
    assert.ok(html.includes('value="hunza"'));
    assert.ok(html.includes('1 tour found'));
  });

  it('ignores what it does not know, and does not fail', async () => {
    const reply = await fetch(site.baseUrl + '/?difficulty=extreme&maxPrice=abc&sort=drop&q[$ne]=x&q=&unknown=1');
    assert.equal(reply.status, 200);
    assert.deepEqual(calls[0].filter, {});
    assert.deepEqual(sortCall(), { name: 1, _id: 1 });
  });

  it('shows the "nothing matches" message when a search finds no tour', async () => {
    found = [];
    const html = await (await fetch(site.baseUrl + '/?q=zzz')).text();
    assert.ok(html.includes('No tours match your search.'));
  });
});
