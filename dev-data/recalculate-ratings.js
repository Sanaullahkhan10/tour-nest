// dev-data/recalculate-ratings.js - works out the rating numbers of every tour again from its reviews.
// It only changes ratingsAverage and ratingsQuantity. It never deletes anything.
//
// How to run (from the project folder):
//   node --env-file-if-exists=.env dev-data/recalculate-ratings.js
const mongoose = require('mongoose');
const connectToDatabase = require('../utils/database');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');

async function run() {
  try {
    await connectToDatabase();

    const tours = await Tour.find().select('_id');
    for (let i = 0; i < tours.length; i++) {
      await Review.updateTourRatings(tours[i]._id);
    }
    console.log(`Ratings recalculated for ${tours.length} tours`);
  } catch (error) {
    console.error('Recalculation failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();