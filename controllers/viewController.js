// controllers/viewController.js - the functions that build the web pages (HTML) of the site.
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const AppError = require('../utils/appError');

// The id of a tour is 24 characters: the digits 0 to 9 and the letters a to f.
const idPattern = /^[0-9a-fA-F]{24}$/;

// GET / - the overview page: a card for every tour.
async function getOverview(req, res) {
  // lean() gives plain objects, which is all a page needs. We take only the fields the cards show.
  // The limit is a safety net. Paging for the website comes later.
  const tours = await Tour.find()
    .sort({ name: 1, _id: 1 })
    .select('name duration maxGroupSize difficulty price summary ratingsAverage ratingsQuantity startDates')
    .limit(100)
    .lean();

  res.status(200).render('overview', {
    title: 'All tours',
    tours: tours,
  });
}

// GET /tours/:id - the page of one tour.
async function getTour(req, res) {
  // A badly shaped id cannot belong to a tour, so for the visitor it is simply "not found".
  if (!idPattern.test(req.params.id)) {
    throw new AppError('We could not find that tour', 404);
  }

  const tour = await Tour.findById(req.params.id).lean();
  if (!tour) {
    throw new AppError('We could not find that tour', 404);
  }

  // The newest 20 reviews. We ask only for the name of the writer, never the email.
  // A writer who closed their account is not found by populate, so we show "Deleted user".
  const found = await Review.find({ tour: tour._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(20)
    .populate({ path: 'user', select: 'name' })
    .lean();

  const reviews = [];
  for (let i = 0; i < found.length; i++) {
    let userName = 'Deleted user';
    if (found[i].user) {
      userName = found[i].user.name;
    }
    reviews.push({
      review: found[i].review,
      rating: found[i].rating,
      createdAt: found[i].createdAt,
      userName: userName,
    });
  }

  // The places of the tour in the order of its days (we copy the list before sorting it).
  const stops = (tour.locations || []).slice();
  stops.sort((a, b) => a.day - b.day);

  // Only the start dates that are not in the past, the nearest one first.
  const now = new Date();
  const startDates = [];
  for (let i = 0; i < (tour.startDates || []).length; i++) {
    if (tour.startDates[i] >= now) {
      startDates.push(tour.startDates[i]);
    }
  }
  startDates.sort((a, b) => a - b);

  res.status(200).render('tour', {
    title: tour.name,
    tour: tour,
    stops: stops,
    reviews: reviews,
    startDates: startDates,
  });
}

module.exports = {
  getOverview,
  getTour,
};
