// server.js - checks the settings, connects to the database, then starts the web server.
const app = require('./app');
const connectToDatabase = require('./utils/database');
const { readJwtSettings } = require('./utils/token');

const port = process.env.PORT || 3000;

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

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();