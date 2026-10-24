// controllers/authController.js - signing up, and (in later steps) logging in and out.
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { signToken, cookieOptions, cookieName } = require('../utils/token');

// The only fields a new visitor may fill in. Anything else they send is ignored,
// so nobody can send "role": "admin" and make themselves an admin.
const signupFields = ['name', 'email', 'password', 'passwordConfirm'];

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

module.exports = {
  signup,
};