// utils/token.js - makes and checks login tokens (JWT) and describes the cookie that carries them.
const jwt = require('jsonwebtoken');

// The name of the cookie that holds the token.
const cookieName = 'jwt';

// A secret shorter than this is too easy to guess, so we refuse to start with it.
const minSecretLength = 64;

// Reads the two JWT settings from .env and checks them.
// If something is wrong it throws an error with a clear message.
function readJwtSettings() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing setting JWT_SECRET in .env file');
  }
  if (secret.length < minSecretLength) {
    throw new Error(`JWT_SECRET must have at least ${minSecretLength} characters`);
  }

  // How many days a login lasts. It must be a whole number from 1 to 30.
  const days = Number(process.env.JWT_EXPIRES_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('JWT_EXPIRES_DAYS in .env must be a whole number from 1 to 30');
  }

  return { secret: secret, days: days };
}

// Makes a token for one user. The token holds only the user id, nothing private.
function signToken(userId) {
  const settings = readJwtSettings();
  return jwt.sign({ id: String(userId) }, settings.secret, {
    expiresIn: `${settings.days}d`,
    algorithm: 'HS256',
  });
}

// Checks a token. If it is fake, changed, or too old, jwt.verify throws an error.
// We allow only HS256, so nobody can sneak in a token that claims "no signature needed".
function verifyToken(token) {
  const settings = readJwtSettings();
  return jwt.verify(token, settings.secret, { algorithms: ['HS256'] });
}

// The settings for the cookie we send to the browser.
function cookieOptions() {
  const settings = readJwtSettings();
  return {
    // The browser's JavaScript cannot read this cookie, so a script that sneaks into
    // a page cannot steal the login.
    httpOnly: true,
    // The cookie is not sent when another website makes our visitor's browser call us
    // (for example a hidden form). Normal clicks on links to our site still work.
    sameSite: 'lax',
    // On the live server the cookie travels only over https.
    secure: process.env.NODE_ENV === 'production',
    // How long the browser keeps the cookie, in milliseconds.
    maxAge: settings.days * 24 * 60 * 60 * 1000,
  };
}

module.exports = {
  cookieName,
  readJwtSettings,
  signToken,
  verifyToken,
  cookieOptions,
};