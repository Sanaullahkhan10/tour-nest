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

// A date becomes "Apr 15, 2027" (in UTC, like the saved dates).
function formatDate(date) {
  return date.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// A rating of 4 becomes four full stars and one empty star. We always show 5 stars in total.
// (9733 is the code of the full star character, 9734 of the empty one.)
function stars(rating) {
  let whole = Math.round(Number(rating));
  if (Number.isNaN(whole) || whole < 0) {
    whole = 0;
  }
  if (whole > 5) {
    whole = 5;
  }
  return String.fromCharCode(9733).repeat(whole) + String.fromCharCode(9734).repeat(5 - whole);
}

module.exports = {
  formatPrice,
  formatMonthYear,
  formatDate,
  stars,
  nextStart,
};
