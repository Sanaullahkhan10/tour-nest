// controllers/viewController.js - the functions that build the web pages (HTML) of the site.
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const User = require('../models/userModel');
const { looksLikeSlug } = require('../utils/slug');
const AppError = require('../utils/appError');
const { buildMapPoints } = require('../utils/mapPoints');
const { looksLikeToken } = require('../utils/resetToken');

// The id of a tour is 24 characters: the digits 0 to 9 and the letters a to f.
const idPattern = /^[0-9a-fA-F]{24}$/;

// GET / - the overview page: a card for every tour.
async function getOverview(req, res) {
  // lean() gives plain objects, which is all a page needs. We take only the fields the cards show.
  // The limit is a safety net. Paging for the website comes later.
  const tours = await Tour.find()
    .sort({ name: 1, _id: 1 })
    .select('name duration maxGroupSize difficulty price summary ratingsAverage ratingsQuantity startDates slug imageCover')
    .limit(100)
    .lean();

  res.status(200).render('overview', {
    title: 'All tours',
    tours: tours,
  });
}

// The guides of a tour, in the order of the tour: only name, photo and role (never the email).
// A closed account is not found, so that guide is left out.
async function findGuides(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }
  const found = await User.find({ _id: { $in: ids } }).select('name photo role').lean();
  const guides = [];
  for (let i = 0; i < ids.length; i++) {
    const guide = found.find((user) => String(user._id) === String(ids[i]));
    if (guide) {
      guides.push(guide);
    }
  }
  return guides;
}

// GET /tours/:id - the page of one tour. The address holds the id of the tour or its slug.
async function getTour(req, res) {
  // An address that is neither an id nor a slug cannot belong to a tour, so for the visitor it is simply "not found".
  let search;
  if (idPattern.test(req.params.id)) {
    search = Tour.findById(req.params.id);
  } else if (looksLikeSlug(req.params.id)) {
    search = Tour.findOne({ slug: req.params.id });
  } else {
    throw new AppError('We could not find that tour', 404);
  }

  const tour = await search.lean();
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

  // The review of the visitor who is logged in (if there is one), so the page can offer "change" and "delete".
  let myReview = null;
  if (res.locals.user) {
    const mine = await Review.findOne({ tour: tour._id, user: res.locals.user._id }).lean();
    if (mine) {
      myReview = { _id: String(mine._id), review: mine.review, rating: mine.rating };
    }
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
    myReview: myReview,
    tourId: String(tour._id),
    mapPoints: buildMapPoints(tour),
    guides: await findGuides(tour.guides),
  });
}

// GET /login - the login page. A visitor who is already logged in goes to the home page.
function getLoginPage(req, res) {
  if (res.locals.user) {
    return res.redirect('/');
  }
  res.status(200).render('login', { title: 'Log in' });
}

// GET /signup - the signup page. A visitor who is already logged in goes to the home page.
function getSignupPage(req, res) {
  if (res.locals.user) {
    return res.redirect('/');
  }
  res.status(200).render('signup', { title: 'Sign up' });
}

// GET /me - the account page of the logged-in visitor.
function getAccountPage(req, res) {
  // Only a logged-in visitor has an account page. Anybody else goes to the login page.
  if (!res.locals.user) {
    return res.redirect('/login');
  }

  // The page shows private data, so the browser and proxies must not keep a copy of it.
  res.set('Cache-Control', 'no-store');
  res.status(200).render('account', { title: 'My account' });
}

// GET /forgot-password - asks for the email. A visitor who is already logged in goes to the home page.
function getForgotPasswordPage(req, res) {
  if (res.locals.user) {
    return res.redirect('/');
  }
  res.status(200).render('forgot-password', { title: 'Forgot your password' });
}

// GET /reset-password/:token - the page where the visitor chooses a new password.
// Whether the link is still good is checked when the form is sent. Here we only check its shape.
function getResetPasswordPage(req, res) {
  if (!looksLikeToken(req.params.token)) {
    throw new AppError('This reset link is not valid or has expired. Please ask for a new one', 400);
  }

  // The address holds a secret, so the browser and proxies must not keep a copy of the page.
  res.set('Cache-Control', 'no-store');
  res.status(200).render('reset-password', { title: 'Choose a new password', token: req.params.token });
}

module.exports = {
  getOverview,
  getTour,
  getLoginPage,
  getSignupPage,
  getAccountPage,
  getForgotPasswordPage,
  getResetPasswordPage,
};
