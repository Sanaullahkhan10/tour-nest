// dev-data/make-admin.js - makes an existing user an admin.
// Run it by hand, from your own computer:
//   node --env-file-if-exists=.env dev-data/make-admin.js someone@example.com
// The person must have signed up first (POST /api/v1/users/signup).
const mongoose = require('mongoose');
const validator = require('validator');
const connectToDatabase = require('../utils/database');

async function makeAdmin() {
  // Spaces and capital letters around the email do not matter.
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email || !validator.isEmail(email)) {
    console.error('Give the email of an existing user, like: node dev-data/make-admin.js someone@example.com');
    process.exit(1);
  }

  try {
    await connectToDatabase();

    // We read the raw collection. This script is for the owner, not for the website.
    const users = mongoose.connection.collection('users');
    const user = await users.findOne({ email: email, active: { $ne: false } });

    if (!user) {
      console.error('No active user with this email. The person must sign up first.');
      process.exitCode = 1;
    } else if (user.role === 'admin') {
      console.log(user.name + ' is already an admin');
    } else {
      await users.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
      console.log(user.name + ' is now an admin');
    }
  } catch (error) {
    console.error('Could not make the admin:', error.message);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

makeAdmin();