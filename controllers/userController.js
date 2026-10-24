// controllers/userController.js - the functions that handle user requests.
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { buildPaging } = require('../utils/paging');
const { cookieName, cookieOptions } = require('../utils/token');

// The only fields a user may change about themselves here.
const updatableFields = ['name', 'email'];

// Passwords have their own route (updateMyPassword), which asks for the old password first.
const passwordFieldNames = ['password', 'passwordConfirm', 'passwordCurrent'];

// The roles a user can have. An admin may filter the user list by one of them.
const validRoles = ['user', 'guide', 'lead-guide', 'admin'];

// Turns the URL query of the user list (for example ?role=guide) into a filter for the database.
// If something is wrong it returns an error message.
function buildUserFilter(query) {
  // Deleted users (active: false) never appear in the list.
  // The model hides them from searches too, but counting needs this line as well,
  // because the model's hook does not run for countDocuments.
  const filter = { active: { $ne: false } };
  const keys = Object.keys(query);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // page and limit are not filters. The paging helper reads them.
    if (key === 'page' || key === 'limit') {
      continue;
    }

    // The only filter for users is the role.
    if (key !== 'role') {
      return { error: `You cannot filter users by ${key}` };
    }

    const value = query[key];
    // The value must be one single piece of text (not a list).
    if (typeof value !== 'string') {
      return { error: 'Use role only once, with one value' };
    }
    if (!validRoles.includes(value)) {
      return { error: 'role must be user, guide, lead-guide or admin' };
    }

    filter.role = value;
  }

  return { filter: filter };
}

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

// DELETE /api/v1/users/deleteMe - the logged-in user closes their own account.
async function deleteMe(req, res) {
  // We do not remove the user from the database. We only mark the account as not active.
  // From now on the user model hides this user from every search.
  await User.updateOne({ _id: req.user._id }, { active: false });

  // Log this browser out too.
  res.clearCookie(cookieName, cookieOptions());

  // 204 means "done, and there is nothing to send back", so there is no body.
  res.status(204).send();
}

// GET /api/v1/users - sends back the users, a page at a time (for admins only).
async function getAllUsers(req, res) {
  const result = buildUserFilter(req.query);
  if (result.error) {
    throw new AppError(result.error, 400);
  }

  const paging = buildPaging(req.query.page, req.query.limit);
  if (paging.error) {
    throw new AppError(paging.error, 400);
  }

  // Sorted by name. Users with the same name always come in the same order (by _id),
  // so a user cannot show up on two pages or be skipped.
  const users = await User.find(result.filter)
    .sort({ name: 1, _id: 1 })
    .skip(paging.skip)
    .limit(paging.limit);

  // How many users match the filter in total (not only on this page).
  const total = await User.countDocuments(result.filter);
  const totalPages = Math.ceil(total / paging.limit);

  res.status(200).json({
    status: 'success',
    results: users.length,
    page: paging.page,
    limit: paging.limit,
    total: total,
    totalPages: totalPages,
    data: {
      users: users,
    },
  });
}

// GET /api/v1/users/:id - sends back one user (for admins only).
async function getUser(req, res) {
  // A badly shaped id makes Mongoose throw an error that the global handler turns into a 400.
  // The user model hides deleted users, so they are "not found" too.
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new AppError('No user found with that id', 404);
  }

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
  deleteMe,
  getAllUsers,
  getUser,
};