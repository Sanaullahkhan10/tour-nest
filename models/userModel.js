// models/userModel.js - the shape and the rules of one user.
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A user must have a name'],
    trim: true,
    maxlength: [50, 'A name must have at most 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'A user must have an email'],
    // Two users cannot share one email.
    unique: true,
    // "Ali@X.com" is saved as "ali@x.com", so one person cannot sign up twice.
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Please give a valid email'],
  },
  photo: {
    type: String,
    default: 'default.jpg',
  },
  role: {
    type: String,
    enum: {
      values: ['user', 'guide', 'lead-guide', 'admin'],
      message: 'Role must be user, guide, lead-guide or admin',
    },
    default: 'user',
  },
  password: {
    type: String,
    required: [true, 'Please give a password'],
    minlength: [8, 'A password must have at least 8 characters'],
    // bcrypt only reads the first 72 bytes of a password, so very long ones are pointless.
    maxlength: [64, 'A password must have at most 64 characters'],
    // A normal search never returns the password. We ask for it by name when we need it.
    select: false,
  },
  passwordConfirm: {
    type: String,
    // It is needed for a new user and whenever the password is being changed.
    // It is not saved in the database, so a user loaded from the database
    // (who only changes the name, for example) must not be asked for it again.
    required: [
      function () {
        return this.isNew || this.isModified('password');
      },
      'Please confirm your password',
    ],
    validate: {
      // This only checks that the two passwords are the same. It works when we create
      // or save a user, not when we use findByIdAndUpdate.
      validator: function (value) {
        return value === this.password;
      },
      message: 'The two passwords are not the same',
    },
  },
  // When the password was changed the last time. A new user has no value here.
  passwordChangedAt: {
    type: Date,
  },
});

// Runs just before a user is saved: hides the password behind a hash.
userSchema.pre('save', async function () {
  // If the password did not change (for example the user only changed the name), do nothing.
  if (!this.isModified('password')) {
    return;
  }

  // 12 is how slow the hashing is on purpose. Higher is safer but slower.
  this.password = await bcrypt.hash(this.password, 12);

  // We only needed passwordConfirm to compare. It is not saved in the database.
  this.passwordConfirm = undefined;

  // For an existing user this is a password change, so we remember the time.
  // The "protect" guard refuses every login token that was made before this moment
  // (see changedPasswordAfter below). Both times are compared in whole seconds, and
  // the new token we make right after this save has the same second or a later one,
  // so the new login stays valid.
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
  }
});

// Checks a typed password against the saved hash. We pass the hash in ourselves
// because the password field is hidden from normal searches.
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return bcrypt.compare(candidatePassword, userPassword);
};

// Tells if the password was changed AFTER a login token was made.
// "tokenIssuedAt" is the time the token was made, in whole seconds (the "iat" inside a token).
// If it returns true, that token is old and must not be accepted any more.
userSchema.methods.changedPasswordAfter = function (tokenIssuedAt) {
  // The password was never changed, so no token can be older than the change.
  if (!this.passwordChangedAt) {
    return false;
  }

  // Our date is in milliseconds. A token time is in seconds, so we divide by 1000.
  const changedAtInSeconds = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return changedAtInSeconds > tokenIssuedAt;
};

// Whenever a user is turned into JSON for a reply, we remove the private fields.
userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.passwordConfirm;
    delete ret.passwordChangedAt;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;