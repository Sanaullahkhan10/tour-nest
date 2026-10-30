// utils/tourSearch.js - the search form of the home page: what the visitor typed, made safe for the database.
// A word we do not know, or a number that is not a number, is simply left out. It is never an error.

// The ways to sort the list. The key goes in the address (?sort=price-low), the value is the order for MongoDB.
// "_id" at the end keeps the order the same every time when two tours are equal.
const sortOrders = {
  name: { name: 1, _id: 1 },
  'price-low': { price: 1, ratingsAverage: -1, _id: 1 },
  'price-high': { price: -1, ratingsAverage: -1, _id: 1 },
  rating: { ratingsAverage: -1, ratingsQuantity: -1, _id: 1 },
  shortest: { duration: 1, _id: 1 },
};

// The same choices with a name for the form: [['name', 'Name (A to Z)'], ...]
const sortLabels = [
  ['name', 'Name (A to Z)'],
  ['price-low', 'Price: low to high'],
  ['price-high', 'Price: high to low'],
  ['rating', 'Best rated'],
  ['shortest', 'Shortest first'],
];

const difficulties = ['easy', 'medium', 'difficult'];

// Only real text counts. A list (?q=a&q=b) or anything else is ignored.
function readText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Puts a backslash before every character that has a meaning in a regular expression,
// so the search words are looked for as plain letters (nobody can send a pattern).
function escapeForRegex(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

// Reads the address query. Gives:
//   filter: for Tour.find()
//   sort: for .sort()
//   shown: the values to put back in the form
//   filtersActive: the visitor searches or filters (used for the "no tours match" message)
//   anythingChanged: the form is not in its start state (used for the "Clear" link)
function readSearch(query) {
  const source = query || {};
  const filter = {};
  const shown = { q: '', difficulty: '', maxPrice: '', sort: 'name' };

  const words = readText(source.q).slice(0, 50).trim();
  if (words !== '') {
    shown.q = words;
    const pattern = escapeForRegex(words);
    filter.$or = [{ name: { $regex: pattern, $options: 'i' } }, { summary: { $regex: pattern, $options: 'i' } }];
  }

  const difficulty = readText(source.difficulty);
  if (difficulties.includes(difficulty)) {
    shown.difficulty = difficulty;
    filter.difficulty = difficulty;
  }

  // Digits only, up to 8 of them. "12.5", "-3", "1e5" and "0" are all left out.
  const maxPrice = readText(source.maxPrice);
  if (/^\d{1,8}$/.test(maxPrice) && Number(maxPrice) >= 1) {
    shown.maxPrice = String(Number(maxPrice));
    filter.price = { $lte: Number(maxPrice) };
  }

  const sortKey = readText(source.sort);
  if (Object.prototype.hasOwnProperty.call(sortOrders, sortKey)) {
    shown.sort = sortKey;
  }

  const filtersActive = shown.q !== '' || shown.difficulty !== '' || shown.maxPrice !== '';
  return {
    filter: filter,
    sort: sortOrders[shown.sort],
    shown: shown,
    filtersActive: filtersActive,
    anythingChanged: filtersActive || shown.sort !== 'name',
  };
}

module.exports = {
  sortLabels,
  readSearch,
};
