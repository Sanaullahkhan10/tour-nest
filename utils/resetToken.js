// utils/resetToken.js - the secret link of "forgot password": making it, hiding it, checking its shape.
const crypto = require('crypto');

// How long a reset link works, and how long the visitor must wait before we send another one.
const lifetimeMinutes = 10;
const cooldownMinutes = 1;

// Turns a token into a short fixed text (a SHA-256 hash). We save only this hash in the database,
// so if somebody reads the database, they still cannot use the links.
// A token is already long and random, so a fast hash is enough here (a password needs bcrypt).
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Makes a new token. "token" goes into the email, "hash" goes into the database.
function makeResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token: token,
    hash: hashToken(token),
    expires: new Date(Date.now() + lifetimeMinutes * 60 * 1000),
  };
}

// A real token is exactly 64 characters: the digits 0 to 9 and the letters a to f.
// Anything else cannot be ours, so we refuse it before we ask the database.
function looksLikeToken(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

// True when the last link was made less than "cooldownMinutes" ago (its end time is still far away).
// Then we send no new email, so nobody can fill the inbox of another person.
function lastLinkIsTooNew(expires) {
  if (!(expires instanceof Date)) {
    return false;
  }
  const minutesLeft = (expires.getTime() - Date.now()) / 60000;
  return minutesLeft > lifetimeMinutes - cooldownMinutes;
}

module.exports = {
  lifetimeMinutes,
  hashToken,
  makeResetToken,
  looksLikeToken,
  lastLinkIsTooNew,
};
