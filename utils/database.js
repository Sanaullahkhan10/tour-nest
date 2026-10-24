// utils/database.js - connects Mongoose to MongoDB Atlas using the settings in .env.
const mongoose = require('mongoose');

async function connectToDatabase() {
  // 1. Make sure all four database settings exist in .env.
  const requiredSettings = [
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_HOST',
    'DATABASE_NAME',
  ];

  for (let i = 0; i < requiredSettings.length; i++) {
    const settingName = requiredSettings[i];
    if (!process.env[settingName]) {
      // We throw an error. The file that called us decides what to do about it.
      throw new Error(`Missing setting ${settingName} in .env file`);
    }
  }

  // 2. Build the connection string from the four settings.
  // encodeURIComponent keeps special characters safe inside a URL.
  const user = encodeURIComponent(process.env.DATABASE_USER);
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD);
  const host = process.env.DATABASE_HOST;
  const databaseName = process.env.DATABASE_NAME;

  const connectionString = `mongodb+srv://${user}:${password}@${host}/${databaseName}?retryWrites=true&w=majority`;

  // 3. Connect. Give up after 10 seconds instead of waiting forever.
  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10000,
  });

  // We print only the host and database name, never the password.
  console.log(`Database connected: ${host}/${databaseName}`);
}

module.exports = connectToDatabase;
