// controllers/reviewController.js - the functions that handle review requests.
const Review = require('../models/reviewModel');
const Tour = require('../models/tourModel');
const AppError = require('../utils/appError');
const { buildPaging } = require('../utils/paging');

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

  // The tour shows its average rating and its number of reviews, so we work them out again.
  // The review is already saved. If this fails, we do not turn a saved review into an error.
  // We only log it. The script dev-data/recalculate-ratings.js can fix the numbers later.
  try {
    await Review.updateTourRatings(tour._id);
  } catch (error) {
    console.error('Could not update the rating of the tour:', error.message);
  }
  // 201 means "created".
  res.status(201).json({
    status: 'success',
    data: {
      review: newReview,
    },
  });
}

// GET /api/v1/tours/:tourId/reviews - the reviews of one tour, newest first, a page at a time.
async function getTourReviews(req, res) {
  // Only page and limit are understood here.
  const keys = Object.keys(req.query);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== 'page' && keys[i] !== 'limit') {
      throw new AppError(`You cannot use ${keys[i]} when listing reviews`, 400);
    }
  }

  const paging = buildPaging(req.query.page, req.query.limit);
  if (paging.error) {
    throw new AppError(paging.error, 400);
  }

  // A tour that does not exist is "not found", which is different from "no reviews yet".
  const tour = await Tour.findById(req.params.tourId);
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  // populate swaps the saved user id for the user's name. We ask only for the name,
  // so the email and the role of the writer are never sent.
  const found = await Review.find({ tour: tour._id })
    .sort({ createdAt: -1, _id: -1 })
    .skip(paging.skip)
    .limit(paging.limit)
    .populate({ path: 'user', select: 'name' });

  // The user model hides deleted users, so populate finds nobody for their reviews.
  // We keep those reviews and show the writer as "Deleted user".
  const reviews = [];
  for (let i = 0; i < found.length; i++) {
    const item = found[i].toObject();
    if (!item.user) {
      item.user = { name: 'Deleted user' };
    }
    reviews.push(item);
  }

  // How many reviews this tour has in total (not only on this page).
  const total = await Review.countDocuments({ tour: tour._id });
  const totalPages = Math.ceil(total / paging.limit);

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    page: paging.page,
    limit: paging.limit,
    total: total,
    totalPages: totalPages,
    data: {
      reviews: reviews,
    },
  });
}

// Updates the rating numbers of a tour. The review is already saved by then, so if this
// fails we only log it instead of turning a saved change into an error.
// (dev-data/recalculate-ratings.js can fix the numbers later.)
async function refreshTourRatings(tourId) {
  try {
    await Review.updateTourRatings(tourId);
  } catch (error) {
    console.error('Could not update the rating of the tour:', error.message);
  }
}

// PATCH /api/v1/reviews/:id - the writer of a review changes its text or its rating.
async function updateReview(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);

  if (keys.length === 0) {
    throw new AppError('Please give a review or a rating to change', 400);
  }

  // Check every field before we change anything.
  for (let i = 0; i < keys.length; i++) {
    if (!reviewFields.includes(keys[i])) {
      throw new AppError(`You cannot change ${keys[i]} in a review`, 400);
    }
  }
  if (body.review !== undefined && typeof body.review !== 'string') {
    throw new AppError('review must be text', 400);
  }
  if (body.rating !== undefined && typeof body.rating !== 'number') {
    throw new AppError('rating must be a number', 400);
  }

  // A badly shaped id makes Mongoose throw an error that the global handler turns into a 400.
  const review = await Review.findById(req.params.id);
  if (!review) {
    throw new AppError('No review found with that id', 404);
  }

  // Only the writer may change a review. Not even an admin can put new words in someone's mouth.
  if (String(review.user) !== String(req.user._id)) {
    throw new AppError('You can change only your own reviews', 403);
  }

  // save() runs the model rules (empty text, rating from 1 to 5, whole number).
  for (let i = 0; i < keys.length; i++) {
    review[keys[i]] = body[keys[i]];
  }
  await review.save();

  // The average of the tour only changes when a rating changes.
  if (keys.includes('rating')) {
    await refreshTourRatings(review.tour);
  }

  res.status(200).json({
    status: 'success',
    data: {
      review: review,
    },
  });
}

module.exports = {
  createReview,
  getTourReviews,
  updateReview,
};