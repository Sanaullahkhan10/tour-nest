// models/reviewModel.js - the shape and the rules of one review.
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // What the visitor wrote about the tour.
  review: {
    type: String,
    required: [true, 'A review cannot be empty'],
    trim: true,
    maxlength: [1000, 'A review can have at most 1000 characters'],
  },

  // The stars: a whole number from 1 to 5.
  rating: {
    type: Number,
    required: [true, 'A review must have a rating'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot be more than 5'],
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be a whole number',
    },
  },

  // When the review was written. It is filled in by itself.
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // Which tour this review is about. We store only its _id (a "reference").
  tour: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tour',
    required: [true, 'A review must belong to a tour'],
  },

  // Who wrote the review. Also only an _id.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A review must belong to a user'],
  },
});

// One user can review one tour only once. The database itself enforces this:
// a second review with the same tour and the same user is refused.
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;