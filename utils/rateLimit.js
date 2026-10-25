// utils/rateLimit.js - the "too many requests" guards.
const { rateLimit } = require('express-rate-limit');
const AppError = require('./appError');

// Makes one limiter: one IP address may send at most "limit" requests in "windowMs" milliseconds.
function createLimiter(limit, windowMs, message) {
  return rateLimit({
    windowMs: windowMs,
    limit: limit,
    // Tell the visitor how much is left, in the standard RateLimit header.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The tests may switch limits off with DISABLE_RATE_LIMIT=true.
    // This never works on the live server, because there NODE_ENV is "production".
    skip: () => process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true',
    // Answer with our own error, so the answer looks like all the other errors.
    handler: (req, res, next) => {
      next(new AppError(message, 429));
    },
  });
}

// All /api requests together: 300 in 15 minutes from one IP address.
const apiLimiter = createLimiter(300, 15 * 60 * 1000, 'Too many requests from this IP. Please try again in a few minutes');

// Login and signup: only 10 in 15 minutes, to slow down people who guess passwords.
const authLimiter = createLimiter(10, 15 * 60 * 1000, 'Too many login or signup attempts from this IP. Please try again in 15 minutes');

// Photo uploads: only 20 per hour from one IP address. Making a picture small costs the server real work.
const uploadLimiter = createLimiter(20, 60 * 60 * 1000, 'Too many photo uploads from this IP. Please try again later');

module.exports = {
  createLimiter,
  apiLimiter,
  authLimiter,
  uploadLimiter,
};