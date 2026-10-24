// models/tourModel.js - describes what a tour looks like in the database.
const mongoose = require('mongoose');

// A schema is the "shape" of one tour: which fields it has and the rules for each.
const tourSchema = new mongoose.Schema({
  // The tour name: text, required, no extra spaces, 5 to 60 characters, no duplicates.
  name: {
    type: String,
    required: [true, 'A tour must have a name'],
    unique: true,
    trim: true,
    minlength: [5, 'A tour name must have at least 5 characters'],
    maxlength: [60, 'A tour name must have at most 60 characters'],
  },

  // How many days the tour lasts.
  duration: {
    type: Number,
    required: [true, 'A tour must have a duration in days'],
    min: [1, 'A tour must last at least 1 day'],
  },

  // The biggest group of people the tour can take.
  maxGroupSize: {
    type: Number,
    required: [true, 'A tour must have a group size'],
    min: [1, 'A group must have at least 1 person'],
  },

  // Only these three words are allowed.
  difficulty: {
    type: String,
    required: [true, 'A tour must have a difficulty'],
    enum: {
      values: ['easy', 'medium', 'difficult'],
      message: 'Difficulty must be easy, medium or difficult',
    },
  },

  // The price per person (we will use Pakistani rupees).
  price: {
    type: Number,
    required: [true, 'A tour must have a price'],
    min: [0, 'The price cannot be negative'],
  },

  // A short text for the tour card, and an optional longer text for the tour page.
  summary: {
    type: String,
    required: [true, 'A tour must have a summary'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },

  // The average of all the ratings of the reviews of this tour, rounded to one decimal.
  // 0 means "no reviews yet". The app updates it by itself when reviews change.
  // Staff cannot set it by hand (the tour controller refuses it).
  ratingsAverage: {
    type: Number,
    default: 0,
    min: [0, 'ratingsAverage cannot be less than 0'],
    max: [5, 'ratingsAverage cannot be more than 5'],
  },

  // How many reviews this tour has. The app updates this one too.
  ratingsQuantity: {
    type: Number,
    default: 0,
    min: [0, 'ratingsQuantity cannot be less than 0'],
  },

  // The days a tour starts. One tour can start on several days.
  // Dates are sent as text like "2027-06-25" and Mongoose turns them into real dates.
  // A tour without dates has an empty list.
  startDates: {
    type: [Date],
    validate: {
      validator: function (dates) {
        return dates.length <= 30;
      },
      message: 'A tour can have at most 30 start dates',
    },
  },
});

// A model is made from the schema. Mongoose stores its documents in a
// collection called "tours" (the model name, lowercased and made plural).
const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
