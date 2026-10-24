// models/reviewModel.js - the shape and the rules of one review.
const mongoose = require('mongoose');
const Tour = require('./tourModel');

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

// Works out the average rating and the number of reviews of one tour from its reviews,
// and saves both numbers in the tour. With no reviews, both become 0.
reviewSchema.statics.updateTourRatings = async function (tourId) {
  // aggregate does not turn a text id into an ObjectId by itself, so we do it here.
  const id = new mongoose.Types.ObjectId(String(tourId));

  // 1. Take only the reviews of this tour. 2. Count them and average their ratings.
  const stats = await this.aggregate([
    { $match: { tour: id } },
    { $group: { _id: '$tour', count: { $sum: 1 }, average: { $avg: '$rating' } } },
  ]);

  let average = 0;
  let count = 0;
  if (stats.length > 0) {
    count = stats[0].count;
    // One decimal is enough for stars: 4.333 becomes 4.3.
    average = Math.round(stats[0].average * 10) / 10;
  }

  await Tour.findByIdAndUpdate(id, { ratingsAverage: average, ratingsQuantity: count });
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;