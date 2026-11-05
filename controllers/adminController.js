// controllers/adminController.js - the pages of the admin panel: the dashboard, the list of tours, and the tour form.
// The pages only show data. The changes (create, update, delete, pictures) go through the API, from public/js/admin-tours.js.
const Tour = require('../models/tourModel');
const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
const AppError = require('../utils/appError');
const { tourToForm } = require('../utils/adminTourForm');

const idShape = /^[0-9a-fA-F]{24}$/;

// The staff can see hidden ("secret") tours too. This option tells the tour model not to hide them
// (see hideSecretTours in models/tourModel.js). Only code like this file, behind requireStaff, ever sets it.
const withHidden = { includeSecret: true };

// A guard for the admin pages: only the roles admin and lead-guide come in.
// A visitor who is not logged in goes to the login page. Everybody else gets 403.
function requireStaff(req, res, next) {
  const user = res.locals.user;
  if (!user) {
    return res.redirect('/login');
  }
  if (user.role !== 'admin' && user.role !== 'lead-guide') {
    return next(new AppError('You do not have permission to see this page', 403));
  }
  next();
}

// GET /admin - numbers about the site, and the newest bookings.
async function getDashboardPage(req, res) {
  const [toursTotal, toursHidden, users, byStatus, recent] = await Promise.all([
    Tour.countDocuments({}).setOptions(withHidden),
    Tour.countDocuments({ secretTour: true }).setOptions(withHidden),
    // Closed accounts are not counted. (countDocuments does not run the "hide closed accounts" step of the user model.)
    User.countDocuments({ active: { $ne: false } }),
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Booking.find().sort('-createdAt').limit(5).populate({ path: 'user', select: 'name email' }).lean(),
  ]);

  const bookings = { pending: 0, paid: 0, cancelled: 0 };
  let revenue = 0;
  for (let i = 0; i < byStatus.length; i++) {
    if (Object.prototype.hasOwnProperty.call(bookings, byStatus[i]._id)) {
      bookings[byStatus[i]._id] = byStatus[i].count;
    }
    if (byStatus[i]._id === 'paid') {
      revenue = byStatus[i].amount;
    }
  }

  res.set('Cache-Control', 'no-store');
  res.status(200).render('admin-dashboard', {
    title: 'Admin',
    stats: { toursTotal: toursTotal, toursHidden: toursHidden, toursVisible: toursTotal - toursHidden, users: users, bookings: bookings, revenue: revenue },
    recent: recent,
  });
}

// GET /admin/tours - every tour, hidden ones too.
async function getAdminToursPage(req, res) {
  const tours = await Tour.find()
    .setOptions(withHidden)
    .sort({ name: 1, _id: 1 })
    .select('name slug price duration difficulty maxGroupSize startDates secretTour imageCover')
    .limit(200)
    .lean();

  res.set('Cache-Control', 'no-store');
  res.status(200).render('admin-tours', { title: 'Admin: tours', tours: tours });
}

// The people who can be chosen as guides of a tour.
function findGuideChoices() {
  return User.find({ role: { $in: ['guide', 'lead-guide'] } })
    .sort({ name: 1, _id: 1 })
    .select('name role')
    .lean();
}

// GET /admin/tours/new - an empty form.
async function getNewTourPage(req, res) {
  const guides = await findGuideChoices();
  res.set('Cache-Control', 'no-store');
  res.status(200).render('admin-tour-form', { title: 'Admin: new tour', isNew: true, tourId: '', form: tourToForm(null), guides: guides });
}

// GET /admin/tours/:id - the form of a tour that exists.
async function getEditTourPage(req, res) {
  if (!idShape.test(req.params.id)) {
    throw new AppError('We could not find that tour', 404);
  }
  const tour = await Tour.findById(req.params.id).setOptions(withHidden).lean();
  if (!tour) {
    throw new AppError('We could not find that tour', 404);
  }

  const guides = await findGuideChoices();
  res.set('Cache-Control', 'no-store');
  res.status(200).render('admin-tour-form', { title: 'Admin: ' + tour.name, isNew: false, tourId: String(tour._id), form: tourToForm(tour), guides: guides, slug: tour.slug || '' });
}

module.exports = {
  requireStaff,
  getDashboardPage,
  getAdminToursPage,
  getNewTourPage,
  getEditTourPage,
};
