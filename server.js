// server.js - connects to the database first, then starts the web server.
const app = require('./app');
const connectToDatabase = require('./utils/database');

const port = process.env.PORT || 3000;

async function startServer() {
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
