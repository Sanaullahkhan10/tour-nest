// dev-data/seed.js - loads the sample tours into the database, or deletes them.
//
// How to run (from the project folder):
//   node --env-file-if-exists=.env dev-data/seed.js --import
//   node --env-file-if-exists=.env dev-data/seed.js --delete
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectToDatabase = require('../utils/database');
const Tour = require('../models/tourModel');

async function runSeed() {
  // 1. Safety: this script can erase data, so never run it on the live server.
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script refuses to run when NODE_ENV is production');
    process.exit(1);
  }

  // 2. Check that we were told what to do.
  const action = process.argv[2];
  if (action !== '--import' && action !== '--delete') {
    console.error('Please add --import or --delete at the end of the command');
    process.exit(1);
  }

  try {
    await connectToDatabase();

    if (action === '--delete') {
      // Remove every tour from the database.
      await Tour.deleteMany({});
      console.log('All tours deleted');
    } else {
      // Read tours.json (it sits next to this file) and turn the text into a list.
      const filePath = path.join(__dirname, 'tours.json');
      const text = fs.readFileSync(filePath, 'utf8');
      const tours = JSON.parse(text);

      // Save all tours. The model checks every one against its rules first.
      await Tour.create(tours);
      console.log(`${tours.length} tours imported`);
    }
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  }

  // 3. Close the connection so the script can finish.
  await mongoose.disconnect();
}

runSeed();
