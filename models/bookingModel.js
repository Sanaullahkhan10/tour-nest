// models/bookingModel.js - one booking: one user, one tour, one start date, some guests.
const mongoose = require('mongoose');

// A booking waits this long for its payment. After that, its places are free for other people.
const pendingMinutes = 30;

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A booking must belong to a user'],
  },
  tour: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tour',
    required: [true, 'A booking must belong to a tour'],
  },
  // The name of the tour and its price at the moment of the booking. If the tour changes later,
  // this booking still shows what the customer agreed to.
  tourName: {
    type: String,
    required: true,
  },
  pricePerPerson: {
    type: Number,
    required: true,
    min: 0,
  },
  startDate: {
    type: Date,
    required: [true, 'A booking must have a start date'],
  },
  guests: {
    type: Number,
    required: [true, 'A booking must have the number of guests'],
    min: [1, 'A booking needs at least 1 guest'],
    max: [20, 'A booking can have at most 20 guests'],
    validate: {
      validator: Number.isInteger,
      message: 'The number of guests must be a whole number',
    },
  },
  // The total in rupees: pricePerPerson x guests. The server works it out, never the browser.
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  // The mobile number of the customer, like 03451234567 (PayFast asks for it).
  mobile: {
    type: String,
    required: [true, 'A booking must have a mobile number'],
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending',
  },
  // Which payment service this booking uses: "payfast" or "demo" (a pretend checkout, no real money).
  gateway: {
    type: String,
    enum: ['payfast', 'demo'],
    required: true,
  },
  // Our own reference of the booking. The payment service sends it back, so we know which booking was paid.
  basketId: {
    type: String,
    required: true,
    unique: true,
  },
  transactionId: {
    type: String,
  },
  paidAt: {
    type: Date,
  },
  // When a booking that is still "pending" stops holding its places.
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// "My bookings" and the check for an earlier booking of the same date are the common searches.
bookingSchema.index({ user: 1, startDate: -1 });
bookingSchema.index({ tour: 1, startDate: 1, status: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
module.exports.pendingMinutes = pendingMinutes;
