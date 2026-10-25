// server.js - checks the settings, connects to the database, then starts the web server.
const mongoose = require('mongoose');
const app = require('./app');
const connectToDatabase = require('./utils/database');
const { readJwtSettings } = require('./utils/token');
const { shutDown } = require('./utils/shutdown');

const port = process.env.PORT || 3000;

// If something unexpected breaks outside of a request, the app is in an unknown state.
// The safest thing is to write the error down and stop. The hosting service starts the app again.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

async function startServer() {
  // A weak or missing login secret would make every login unsafe, so we stop right away.
  try {
    readJwtSettings();
  } catch (error) {
    console.error('Login settings problem:', error.message);
    process.exit(1);
  }

  try {
    await connectToDatabase();
  } catch (error) {
    // No database means the server would fail on every request, so we stop here.
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  // The hosting service sends SIGTERM before it stops the app (for example when a new version
  // is deployed). Ctrl+C on our own computer sends SIGINT. In both cases we let the running
  // requests finish, close the database, and then stop.
  function stopSoftly(signal) {
    console.log(`${signal} received. Shutting down...`);

    // If shutting down takes too long, we stop anyway.
    const timer = setTimeout(() => {
      console.error('Shutting down took too long. Stopping now.');
      process.exit(1);
    }, 10000);
    timer.unref();

    shutDown(server, mongoose.connection)
      .then(() => {
        console.log('Shut down cleanly.');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Problem while shutting down:', error.message);
        process.exit(1);
      });
  }
  process.on('SIGTERM', () => stopSoftly('SIGTERM'));
  process.on('SIGINT', () => stopSoftly('SIGINT'));
}

startServer();