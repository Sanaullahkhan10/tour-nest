// server.js - connects to the database first, then starts the web server.
const mongoose = require('mongoose');
const app = require('./app');

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
    console.error(`Missing setting ${settingName} in .env file`);
    process.exit(1);
  }
}

// 2. Build the connection string from the four settings.
// encodeURIComponent keeps special characters safe inside a URL.
const user = encodeURIComponent(process.env.DATABASE_USER);
const password = encodeURIComponent(process.env.DATABASE_PASSWORD);
const host = process.env.DATABASE_HOST;
const databaseName = process.env.DATABASE_NAME;

const connectionString = `mongodb+srv://${user}:${password}@${host}/${databaseName}?retryWrites=true&w=majority`;

const port = process.env.PORT || 3000;

// 3. Connect to the database, then start listening for requests.
async function startServer() {
  try {
    // Give up after 10 seconds instead of waiting forever.
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 10000,
    });
    // We print only the host and database name, never the password.
    console.log(`Database connected: ${host}/${databaseName}`);
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
