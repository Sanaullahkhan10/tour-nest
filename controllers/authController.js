// controllers/authController.js - signing up, logging in and out, and guarding routes.
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { signToken, verifyToken, cookieOptions, cookieName } = require('../utils/token');

// The only fields a new visitor may fill in. Anything else they send is ignored,
// so nobody can send "role": "admin" and make themselves an admin.
const signupFields = ['name', 'email', 'password', 'passwordConfirm'];

// A made-up hash. When someone logs in with an email we do not know, we still check
// their password against this one, so the answer takes the same time as for a known
// email. Otherwise the time taken would show which emails have an account.
// The 12 must be the same number the user model uses when it hashes passwords.
const fakeHash = bcrypt.hashSync('not-a-real-password', 12);

// Gives the browser a login cookie and sends back the user (never the password).
function sendToken(user, statusCode, res) {
  const token = signToken(user._id);
  res.cookie(cookieName, token, cookieOptions());

  res.status(statusCode).json({
    status: 'success',
    data: {
      user: user,
    },
  });
}

// POST /api/v1/users/signup - creates a new user and logs them in.
async function signup(req, res) {
  // If the visitor sent no JSON at all, Express leaves req.body empty, so we use {}.
  const body = req.body || {};

  // Copy only the allowed fields, and make sure each one is plain text.
  const userData = {};
  for (let i = 0; i < signupFields.length; i++) {
    const fieldName = signupFields[i];
    const value = body[fieldName];

    if (value !== undefined && typeof value !== 'string') {
      throw new AppError(`${fieldName} must be text`, 400);
    }
    userData[fieldName] = value;
  }

  // The model checks every rule and hashes the password before saving.
  // If a rule is broken, Mongoose throws and the global error handler answers 400.
  const newUser = await User.create(userData);

  // 201 means "created".
  sendToken(newUser, 201, res);
}

// POST /api/v1/users/login - checks the email and password and logs the user in.
async function login(req, res) {
  const body = req.body || {};
  const email = body.email;
  const password = body.password;

  // Both must be given, and both must be plain text. If "email" were an object like
  // {"$gt": ""}, the database could treat it as a search rule and return the first user.
  if (email === undefined || password === undefined || email === '' || password === '') {
    throw new AppError('Please give your email and password', 400);
  }
  if (typeof email !== 'string') {
    throw new AppError('email must be text', 400);
  }
  if (typeof password !== 'string') {
    throw new AppError('password must be text', 400);
  }

  // The model saves emails in small letters without spaces, so we search the same way.
  const cleanEmail = email.trim().toLowerCase();

  // The password is hidden from normal searches, so we ask for it by name.
  const user = await User.findOne({ email: cleanEmail }).select('+password');

  // We check the password in both cases (see fakeHash above).
  let passwordIsRight = false;
  if (user) {
    passwordIsRight = await user.correctPassword(password, user.password);
  } else {
    await bcrypt.compare(password, fakeHash);
  }

  // One message for "no such email" and "wrong password", so a visitor
  // cannot find out which emails have an account.
  if (!user || !passwordIsRight) {
    throw new AppError('Incorrect email or password', 401);
  }

  sendToken(user, 200, res);
}

// POST /api/v1/users/logout - removes the login cookie from the browser.
function logout(req, res) {
  // To remove a cookie, the browser needs the same settings it was given with.
  res.clearCookie(cookieName, cookieOptions());

  res.status(200).json({
    status: 'success',
  });
}

// A guard for routes. It runs before the route's own function and lets the visitor
// through only if the login cookie holds a good token of a user who still exists.
async function protect(req, res, next) {
  // 1. The token must be in the login cookie (cookie-parser puts cookies in req.cookies).
  const token = req.cookies[cookieName];
  if (!token) {
    throw new AppError('You are not logged in. Please log in to get access', 401);
  }
  // A cookie that looks like JSON can turn into an object, and a token is always text.
  if (typeof token !== 'string') {
    throw new AppError('Your login is not valid or has expired. Please log in again', 401);
  }

  // 2. The token must be real, not changed, and not too old.
  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    // Only a bad token means "log in again". Any other error is our own problem.
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AppError('Your login is not valid or has expired. Please log in again', 401);
    }
    throw error;
  }

  // 3. The user must still exist (the account may have been deleted after the login).
  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError('The user of this login no longer exists', 401);
  }

  // 4. Remember who is asking, so the next functions can use req.user.
  req.user = user;
  next();
}

// Lets only the named roles through, for example restrictTo('admin', 'lead-guide').
// "...allowedRoles" collects all the names we pass into one list.
// It must run after protect, because protect is what sets req.user.
function restrictTo(...allowedRoles) {
  return function (req, res, next) {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('You do not have permission to do this', 403);
    }
    next();
  };
}

module.exports = {
  signup,
  login,
  logout,
  protect,
  restrictTo,
};