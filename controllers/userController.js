// controllers/userController.js - the functions that handle user requests.
const User = require('../models/userModel');
const Image = require('../models/imageModel');
const AppError = require('../utils/appError');
const { buildPaging } = require('../utils/paging');
const { cookieName, cookieOptions } = require('../utils/token');
const { makeSquarePhoto } = require('../utils/imageProcessing');
const { looksLikeImageId } = require('../utils/photoUrl');

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

// Removes a saved picture, if "photo" is the id of one. A failure here is only written down:
// the user already has the new photo, and a picture nobody uses costs us nothing but a little space.
async function removeSavedPhoto(photo) {
  if (!looksLikeImageId(photo)) {
    return;
  }
  try {
    await Image.deleteOne({ _id: photo });
  } catch (error) {
    console.error('Could not remove an old photo:', error.message);
  }
}

// PATCH /api/v1/users/updateMyPhoto - the logged-in user uploads a new photo.
// The route runs protect and then uploadPhoto first, so the file is in req.file.
async function updateMyPhoto(req, res) {
  if (!req.file) {
    throw new AppError('Please send a photo (a form with one file, in a field called photo)', 400);
  }

  // The file becomes a small square JPEG. Anything that is not a real picture is refused here.
  const picture = await makeSquarePhoto(req.file.buffer);
  const image = await Image.create({ data: picture.data, contentType: picture.contentType });

  const user = req.user;
  const oldPhoto = user.photo;
  user.photo = String(image._id);
  try {
    await user.save();
  } catch (error) {
    // The user did not get the new picture, so we do not keep it either.
    await Image.deleteOne({ _id: image._id });
    throw error;
  }

  await removeSavedPhoto(oldPhoto);

  res.status(200).json({
    status: 'success',
    data: {
      user: user,
    },
  });
}

// DELETE /api/v1/users/deleteMyPhoto - the logged-in user goes back to the plain avatar.
async function deleteMyPhoto(req, res) {
  const user = req.user;
  const oldPhoto = user.photo;
  user.photo = 'default.jpg';
  await user.save();

  await removeSavedPhoto(oldPhoto);

  res.status(200).json({
    status: 'success',
    data: {
      user: user,
    },
  });
}

// DELETE /api/v1/users/deleteMe - the logged-in user closes their own account.
async function deleteMe(req, res) {
  // The only admin cannot close their account. Otherwise nobody could manage the site.
  if (req.user.role === 'admin') {
    const otherAdmins = await User.countDocuments({
      role: 'admin',
      active: { $ne: false },
      _id: { $ne: req.user._id },
    });
    if (otherAdmins === 0) {
      throw new AppError('You are the only admin. Make another user an admin before closing your account', 400);
    }
  }

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

// PATCH /api/v1/users/:id - an admin changes the role of a user (for admins only).
async function updateUser(req, res) {
  // An admin cannot change their own role. Otherwise the last admin could take away
  // their own rights and leave the site with no admin at all.
  if (req.params.id === String(req.user._id)) {
    throw new AppError('You cannot change your own role', 400);
  }

  const body = req.body || {};
  const keys = Object.keys(body);

  if (keys.length === 0) {
    throw new AppError('Please give the role to set', 400);
  }

  // The role is the only thing an admin may change here (never a password or a name).
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== 'role') {
      throw new AppError(`You cannot change ${keys[i]} here`, 400);
    }
  }

  // The role must be plain text, and one of the roles we know.
  if (typeof body.role !== 'string') {
    throw new AppError('role must be text', 400);
  }
  if (!validRoles.includes(body.role)) {
    throw new AppError('role must be user, guide, lead-guide or admin', 400);
  }

  // The user model hides deleted users, so they are "not found" too.
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError('No user found with that id', 404);
  }

  // save() runs the model rules before storing the new role.
  user.role = body.role;
  await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      user: user,
    },
  });
}

// DELETE /api/v1/users/:id - an admin closes the account of a user (for admins only).
async function deleteUser(req, res) {
  // An admin closes their own account with /deleteMe, which has its own safety check.
  if (req.params.id === String(req.user._id)) {
    throw new AppError('To close your own account, use /deleteMe', 400);
  }

  // The user model hides deleted users, so they are "not found" too.
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError('No user found with that id', 404);
  }

  // Like deleteMe, we only mark the account as not active. We do not remove it.
  await User.updateOne({ _id: user._id }, { active: false });

  // 204 means "done, and there is nothing to send back", so there is no body.
  res.status(204).send();
}

module.exports = {
  getMe,
  updateMe,
  updateMyPhoto,
  deleteMyPhoto,
  deleteMe,
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
};