// utils/paging.js - turns ?page=2&limit=3 from the URL into numbers for the database.
// Every list in the app (tours, users, reviews ...) can use it.

// How many items one page holds when the visitor does not say, and the biggest allowed.
const defaultLimit = 10;
const maxLimit = 50;
// The biggest page number we accept.
const maxPage = 100000;

// Turns the page and limit from the URL (for example "2" and "3") into numbers
// for the database. If something is wrong it returns an error message.
function buildPaging(pageText, limitText) {
  let page = 1;
  let limit = defaultLimit;

  if (pageText !== undefined) {
    // The value must be one single piece of text (not a list).
    if (typeof pageText !== 'string') {
      return { error: 'Use page only once' };
    }
    page = Number(pageText);
    if (pageText.trim() === '' || !Number.isInteger(page) || page < 1 || page > maxPage) {
      return { error: `page must be a whole number from 1 to ${maxPage}` };
    }
  }

  if (limitText !== undefined) {
    if (typeof limitText !== 'string') {
      return { error: 'Use limit only once' };
    }
    limit = Number(limitText);
    if (limitText.trim() === '' || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      return { error: `limit must be a whole number from 1 to ${maxLimit}` };
    }
  }

  // How many items to jump over before we start collecting.
  const skip = (page - 1) * limit;

  return { page: page, limit: limit, skip: skip };
}

module.exports = {
  buildPaging,
};