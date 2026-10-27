// controllers/bookingController.js - bookings: make one, list them, cancel one, and the payment results.
const crypto = require('crypto');
const Booking = require('../models/bookingModel');
const Tour = require('../models/tourModel');
const AppError = require('../utils/appError');
const payfast = require('../utils/payfast');
const { chooseGateway } = require('../utils/payments');

const idShape = /^[0-9a-fA-F]{24}$/;

// A mobile number of Pakistan: 03451234567, 923451234567, +92-345-... without the dashes in the middle.
// It is saved in one form: 03451234567. Gives null when the text does not look like a mobile number.
function readMobile(text) {
  const match = /^(?:0|\+?92-?)(3\d{9})$/.exec(text);
  return match ? '0' + match[1] : null;
}

// How many places other people already hold on this date: paid bookings, and bookings that still
// wait for their payment (and have not expired). The places of the user themself are not counted,
// because their old waiting booking is replaced by the new one.
async function countTakenPlaces(tourId, startDate, userId) {
  const found = await Booking.aggregate([
    {
      $match: {
        tour: tourId,
        startDate: startDate,
        user: { $ne: userId },
        $or: [{ status: 'paid' }, { status: 'pending', expiresAt: { $gt: new Date() } }],
      },
    },
    { $group: { _id: null, guests: { $sum: '$guests' } } },
  ]);
  return found.length > 0 ? found[0].guests : 0;
}

// Turns a waiting booking into a paid one. It only works once: the booking must still be in one of the
// "fromStatuses", so a payment message that arrives twice (the browser AND the server of PayFast) changes nothing the second time.
function markPaid(bookingId, transactionId, fromStatuses) {
  return Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: fromStatuses } },
    { status: 'paid', paidAt: new Date(), transactionId: transactionId },
    { returnDocument: 'after' }
  );
}

// POST /api/v1/bookings - the logged-in user books a tour. The price is worked out here from the
// price of the tour, never taken from the browser. The answer holds the address of the payment page.
async function createBooking(req, res) {
  const body = req.body || {};

  if (typeof body.tour !== 'string' || !idShape.test(body.tour)) {
    throw new AppError('tour must be the id of a tour', 400);
  }
  if (typeof body.startDate !== 'string' || body.startDate === '') {
    throw new AppError('Please choose a start date', 400);
  }
  if (!Number.isInteger(body.guests)) {
    throw new AppError('guests must be a whole number', 400);
  }
  const mobile = typeof body.mobile === 'string' ? readMobile(body.mobile.trim()) : null;
  if (!mobile) {
    throw new AppError('Please give a mobile number like 03451234567', 400);
  }

  const tour = await Tour.findById(body.tour).select('name price maxGroupSize startDates');
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  // The date must be one of the start dates of the tour, and it must still be ahead of us.
  const startDate = new Date(body.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new AppError('The start date is not a valid date', 400);
  }
  const known = (tour.startDates || []).find((date) => date.getTime() === startDate.getTime());
  if (!known || startDate <= new Date()) {
    throw new AppError('That is not an upcoming start date of this tour', 400);
  }

  if (body.guests < 1 || body.guests > tour.maxGroupSize) {
    throw new AppError('guests must be from 1 to ' + tour.maxGroupSize, 400);
  }

  const user = req.user;
  const alreadyPaid = await Booking.findOne({ user: user._id, tour: tour._id, startDate: startDate, status: 'paid' });
  if (alreadyPaid) {
    throw new AppError('You have already booked this tour for that date', 400);
  }

  const taken = await countTakenPlaces(tour._id, startDate, user._id);
  if (taken + body.guests > tour.maxGroupSize) {
    const left = Math.max(0, tour.maxGroupSize - taken);
    throw new AppError(left === 0 ? 'That date is full' : 'Only ' + left + ' places are left on that date', 400);
  }

  const amount = Math.round(tour.price * body.guests);
  if (!Number.isSafeInteger(amount)) {
    throw new AppError('The price of this tour is not usable. Please contact us', 400);
  }

  // A booking of the same date that still waits for its payment is replaced by this new one.
  await Booking.deleteMany({ user: user._id, tour: tour._id, startDate: startDate, status: 'pending' });

  const booking = await Booking.create({
    user: user._id,
    tour: tour._id,
    tourName: tour.name,
    pricePerPerson: tour.price,
    startDate: startDate,
    guests: body.guests,
    amount: amount,
    mobile: mobile,
    gateway: chooseGateway(),
    basketId: 'TN-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    expiresAt: new Date(Date.now() + Booking.pendingMinutes * 60 * 1000),
  });

  res.status(201).json({
    status: 'success',
    data: {
      booking: booking,
      payUrl: '/pay/' + booking._id,
    },
  });
}

// GET /api/v1/bookings/my - the bookings of the logged-in user, the newest start date first.
async function getMyBookings(req, res) {
  const bookings = await Booking.find({ user: req.user._id }).sort('-startDate').lean();
  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      bookings: bookings,
    },
  });
}

// A whole number of 1 or more from the address, at most "max". Anything else gives "fallback".
function readWholeNumber(text, fallback, max) {
  const number = parseInt(text, 10);
  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }
  return Math.min(number, max);
}

// GET /api/v1/bookings - all the bookings, for the staff. ?page=2&limit=20
async function getAllBookings(req, res) {
  const page = readWholeNumber(req.query.page, 1, 100000);
  const limit = readWholeNumber(req.query.limit, 20, 100);

  const bookings = await Booking.find()
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({ path: 'user', select: 'name email' })
    .lean();

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      bookings: bookings,
    },
  });
}

const isStaff = (user) => user.role === 'admin' || user.role === 'lead-guide';

// Finds a booking that the logged-in user may use: their own, or any for the staff.
// Everybody else gets "not found", so nobody learns which ids exist.
async function findAllowedBooking(req) {
  if (!idShape.test(req.params.id)) {
    throw new AppError('No booking found with that id', 404);
  }
  const booking = await Booking.findById(req.params.id);
  if (!booking || (!isStaff(req.user) && String(booking.user) !== String(req.user._id))) {
    throw new AppError('No booking found with that id', 404);
  }
  return booking;
}

// GET /api/v1/bookings/:id
async function getBooking(req, res) {
  const booking = await findAllowedBooking(req);
  res.status(200).json({
    status: 'success',
    data: {
      booking: booking,
    },
  });
}

// DELETE /api/v1/bookings/:id - cancels a booking that still waits for its payment.
// A paid booking cannot be cancelled here, because the money must go back through the payment service.
async function cancelBooking(req, res) {
  const booking = await findAllowedBooking(req);

  if (booking.status === 'paid') {
    throw new AppError('A paid booking cannot be cancelled here. Please contact us for a refund', 400);
  }

  const cancelled = await Booking.findOneAndUpdate({ _id: booking._id, status: { $in: ['pending', 'cancelled'] } }, { status: 'cancelled' }, { returnDocument: 'after' });
  if (!cancelled) {
    // The payment came in a moment ago, between our two steps.
    throw new AppError('A paid booking cannot be cancelled here. Please contact us for a refund', 400);
  }

  res.status(200).json({
    status: 'success',
    data: {
      booking: cancelled,
    },
  });
}

// POST /api/v1/bookings/:id/demo-pay - the pretend payment of the demo checkout. No money is taken.
async function demoPay(req, res) {
  const booking = await Booking.findOne({ _id: idShape.test(req.params.id) ? req.params.id : null, user: req.user._id });
  if (!booking) {
    throw new AppError('No booking found with that id', 404);
  }
  if (booking.gateway !== 'demo') {
    throw new AppError('This booking is paid with PayFast, not with the demo checkout', 400);
  }
  if (booking.status !== 'pending') {
    throw new AppError('This booking is not waiting for a payment', 400);
  }
  if (booking.expiresAt <= new Date()) {
    throw new AppError('This booking has expired. Please book the tour again', 400);
  }

  const paid = await markPaid(booking._id, 'DEMO-' + crypto.randomBytes(5).toString('hex').toUpperCase(), ['pending']);
  if (!paid) {
    throw new AppError('This booking is not waiting for a payment', 400);
  }

  res.status(200).json({
    status: 'success',
    data: {
      booking: paid,
    },
  });
}

// The names of the values that PayFast sends back. We read only these, as plain text.
const answerFields = ['basket_id', 'err_code', 'err_msg', 'validation_hash', 'transaction_id', 'transaction_amount', 'txnamt'];

// Collects them from the body (a form) and from the address (a query). The body comes first.
function readAnswer(req) {
  const answer = {};
  for (let i = 0; i < answerFields.length; i++) {
    const name = answerFields[i];
    const fromBody = req.body && typeof req.body[name] === 'string' ? req.body[name] : '';
    const fromQuery = req.query && typeof req.query[name] === 'string' ? req.query[name] : '';
    answer[name] = fromBody || fromQuery;
  }
  return answer;
}

// Looks at an answer of PayFast and updates the booking. Gives { outcome, booking }, where outcome is:
//   "paid"     - the answer is real and says paid (the booking is paid now, or was paid before)
//   "failed"   - the answer is real and says not paid (the booking stays as it is, the customer may try again)
//   "invalid"  - the answer is fake, or its amount does not fit, or PayFast is not set up here
//   "unknown"  - the answer is real, but we have no booking with that basket id
// The customer's browser and the server of PayFast may both tell us about the same payment.
// That is fine: a booking can become paid only once (see markPaid).
async function applyPayfastResult(params) {
  if (!payfast.isConfigured()) {
    return { outcome: 'invalid' };
  }

  const answer = payfast.checkAnswer(payfast.readSettings(), params || {});
  if (!answer.valid) {
    return { outcome: 'invalid' };
  }

  const booking = await Booking.findOne({ basketId: answer.basketId });
  if (!booking || booking.gateway !== 'payfast') {
    return { outcome: 'unknown' };
  }
  if (!answer.approved) {
    return { outcome: 'failed', booking: booking };
  }

  // If PayFast tells the amount, it must be the amount of the booking.
  if (answer.amount !== '' && Number(answer.amount) !== booking.amount) {
    console.error('The amount of a PayFast answer does not fit booking ' + booking.basketId);
    return { outcome: 'invalid' };
  }

  if (booking.status === 'paid') {
    return { outcome: 'paid', booking: booking };
  }
  // A customer may have cancelled while paying. The money is taken, so the booking counts as paid.
  const paid = await markPaid(booking._id, answer.transactionId || 'PAYFAST', ['pending', 'cancelled']);
  return { outcome: 'paid', booking: paid || booking };
}

// GET or POST /api/v1/bookings/payfast-ipn - the message of the PayFast server about a payment.
async function payfastIpn(req, res) {
  const result = await applyPayfastResult(readAnswer(req));
  res.status(200).json({ status: 'ok', result: result.outcome });
}

module.exports = {
  readMobile,
  readAnswer,
  applyPayfastResult,
  createBooking,
  getMyBookings,
  getAllBookings,
  getBooking,
  cancelBooking,
  demoPay,
  payfastIpn,
};
