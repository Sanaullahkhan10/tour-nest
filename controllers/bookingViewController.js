// controllers/bookingViewController.js - the pages of the bookings: My tours, the payment page, and where PayFast sends the customer back.
const Booking = require('../models/bookingModel');
const AppError = require('../utils/appError');
const payfast = require('../utils/payfast');
const { readSiteUrl } = require('../utils/email');
const bookingController = require('./bookingController');

const idShape = /^[0-9a-fA-F]{24}$/;

// The notice on top of My tours, after a payment. The address says ?payment=success, failed or unverified.
const notices = {
  success: { good: true, text: 'Payment received. Your booking is confirmed.' },
  failed: { good: false, text: 'The payment was not completed. You can try again with "Pay now" below.' },
  unverified: { good: false, text: 'We could not check that payment. If money was taken, please contact us with your booking reference.' },
};

// GET /my-tours - the bookings of the logged-in visitor.
async function getMyToursPage(req, res) {
  if (!res.locals.user) {
    return res.redirect('/login');
  }

  const bookings = await Booking.find({ user: res.locals.user._id }).sort('-startDate').lean();
  const now = new Date();
  const rows = bookings.map((booking) => Object.assign({}, booking, { expired: booking.status === 'pending' && booking.expiresAt <= now }));

  const word = typeof req.query.payment === 'string' ? req.query.payment : '';
  const notice = Object.prototype.hasOwnProperty.call(notices, word) ? notices[word] : null;

  // The page shows private data, so the browser and proxies must not keep a copy of it.
  res.set('Cache-Control', 'no-store');
  res.status(200).render('my-tours', { title: 'My tours', bookings: rows, notice: notice });
}

// GET /pay/:id - the payment page of a booking that waits for its payment.
// Demo checkout: a pretend payment page. PayFast: a form that sends the customer to PayFast.
async function getPayPage(req, res) {
  if (!res.locals.user) {
    return res.redirect('/login');
  }
  if (!idShape.test(req.params.id)) {
    throw new AppError('We could not find that booking', 404);
  }

  const booking = await Booking.findOne({ _id: req.params.id, user: res.locals.user._id });
  if (!booking) {
    throw new AppError('We could not find that booking', 404);
  }
  if (booking.status !== 'pending') {
    return res.redirect('/my-tours');
  }
  if (booking.expiresAt <= new Date()) {
    throw new AppError('This booking has expired. Please book the tour again', 400);
  }

  res.set('Cache-Control', 'no-store');

  if (booking.gateway === 'demo') {
    return res.status(200).render('pay-demo', { title: 'Demo payment', booking: booking });
  }

  const settings = payfast.readSettings();
  const token = await payfast.getAccessToken(settings, booking.basketId, booking.amount);
  const form = payfast.buildCheckoutForm(settings, token, {
    amount: booking.amount,
    mobile: booking.mobile,
    email: res.locals.user.email,
    description: 'Tour Nest: ' + booking.tourName,
    basketId: booking.basketId,
    date: new Date(),
    siteUrl: readSiteUrl(),
  });
  res.status(200).render('pay-payfast', { title: 'Pay with PayFast', booking: booking, form: form });
}

// GET or POST /payment/payfast/success and /payment/payfast/failure - PayFast sends the customer back here.
// We do not trust the address (success or failure): only the validation_hash in the answer counts.
async function payfastReturn(req, res) {
  const result = await bookingController.applyPayfastResult(bookingController.readAnswer(req));

  let word = 'unverified';
  if (result.outcome === 'paid') {
    word = 'success';
  } else if (result.outcome === 'failed') {
    word = 'failed';
  }
  res.redirect('/my-tours?payment=' + word);
}

module.exports = {
  getMyToursPage,
  getPayPage,
  payfastReturn,
};
