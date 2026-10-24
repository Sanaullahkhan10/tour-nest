// controllers/reviewController.js - the functions that handle review requests.
const Review = require('../models/reviewModel');
const Tour = require('../models/tourModel');
const AppError = require('../utils/appError');

// The only fields a visitor may fill in. The tour comes from the URL,
// and the user comes from the login, so nobody can write a review in someone else's name.
const reviewFields = ['review', 'rating'];

// POST /api/v1/tours/:tourId/reviews - the logged-in user writes a review of a tour.
async function createReview(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);

  // Check every field before we do anything.
  for (let i = 0; i < keys.length; i++) {
    if (!reviewFields.includes(keys[i])) {
      throw new AppError(`You cannot set ${keys[i]} in a review`, 400);
    }
  }
  if (body.review !== undefined && typeof body.review !== 'string') {
    throw new AppError('review must be text', 400);
  }
  if (body.rating !== undefined && typeof body.rating !== 'number') {
    throw new AppError('rating must be a number', 400);
  }

  // The model only checks that an id looks right. Here we check that the tour really exists.
  // A badly shaped id makes Mongoose throw an error that the global handler turns into a 400.
  const tour = await Tour.findById(req.params.tourId);
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  let newReview;
  try {
    // The model checks every rule (empty text, rating from 1 to 5, whole number).
    newReview = await Review.create({
      review: body.review,
      rating: body.rating,
      tour: tour._id,
      user: req.user._id,
    });
  } catch (error) {
    // Error code 11000: the database refused a second review of the same tour by the same user.
    if (error.code === 11000) {
      throw new AppError('You have already reviewed this tour', 400);
    }
    throw error;
  }

  // 201 means "created".
  res.status(201).json({
    status: 'success',
    data: {
      review: newReview,
    },
  });
}

module.exports = {
  createReview,
};