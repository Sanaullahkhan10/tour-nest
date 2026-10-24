// controllers/userController.js - the functions that handle user requests.
const AppError = require('../utils/appError');

// The only fields a user may change about themselves here.
const updatableFields = ['name', 'email'];

// Passwords have their own route (updateMyPassword), which asks for the old password first.
const passwordFieldNames = ['password', 'passwordConfirm', 'passwordCurrent'];

// GET /api/v1/users/me - sends back the user who is logged in.
function getMe(req, res) {
  // The "protect" guard already found this user from the login cookie
  // and put it in req.user. We only have to send it back.
  // The user model removes the private fields (password and so on) when it becomes JSON.
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
}

// PATCH /api/v1/users/updateMe - the logged-in user changes their own name or email.
async function updateMe(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);

  if (keys.length === 0) {
    throw new AppError('Please give a name or an email to change', 400);
  }

  // Check every field before we change anything.
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (passwordFieldNames.includes(key)) {
      throw new AppError('This route is not for passwords. Please use /updateMyPassword', 400);
    }
    if (!updatableFields.includes(key)) {
      throw new AppError(`You cannot change ${key} here`, 400);
    }
    if (typeof body[key] !== 'string') {
      throw new AppError(`${key} must be text`, 400);
    }
  }

  // Copy the new values into the user that "protect" found.
  // We only get here with "name" and "email", so nothing else can be changed.
  const user = req.user;
  for (let i = 0; i < keys.length; i++) {
    user[keys[i]] = body[keys[i]];
  }

  // save() runs the model rules (valid email, not empty name, email not taken).
  // If a rule is broken, Mongoose throws and the global error handler answers 400.
  await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      user: user,
    },
  });
}

module.exports = {
  getMe,
  updateMe,
};