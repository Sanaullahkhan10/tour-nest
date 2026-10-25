// utils/format.js - small helpers that make numbers and dates nice to read on the web pages.

// 95000 becomes "PKR 95,000".
function formatPrice(price) {
  return 'PKR ' + Number(price).toLocaleString('en-US');
}

// A date becomes "Apr 2027". We use UTC, because the dates are saved in UTC.
function formatMonthYear(date) {
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Of all the start dates of a tour, gives the nearest one that is not in the past.
// Gives null when there is none. "now" is only a parameter so that tests can set the time.
function nextStart(startDates, now) {
  if (!startDates) {
    return null;
  }
  const today = now || new Date();

  let nearest = null;
  for (let i = 0; i < startDates.length; i++) {
    const date = startDates[i];
    if (date >= today && (nearest === null || date < nearest)) {
      nearest = date;
    }
  }
  return nearest;
}

module.exports = {
  formatPrice,
  formatMonthYear,
  nextStart,
};
