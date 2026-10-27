// routes/bookingRoutes.js - the API of the bookings. Every route starts with /api/v1/bookings.
const express = require('express');
const bookingController = require('../controllers/bookingController');
const authController = require('../controllers/authController');

const router = express.Router();

// PayFast may send its message as a form (POST) or as an address (GET). Only this route reads forms.
const readForm = express.urlencoded({ extended: false, limit: '10kb' });

// GET or POST /api/v1/bookings/payfast-ipn  (the server of PayFast tells us about a payment: no login, the validation hash is the proof)
// It must come before the routes with :id, or "payfast-ipn" would be read as an id.
router.route('/payfast-ipn').get(bookingController.payfastIpn).post(readForm, bookingController.payfastIpn);

// GET /api/v1/bookings/my  (the bookings of the logged-in user)
router.get('/my', authController.protect, bookingController.getMyBookings);

// POST /api/v1/bookings  (book a tour)
router.post('/', authController.protect, bookingController.createBooking);

// GET /api/v1/bookings  (all the bookings: staff only)
router.get('/', authController.protect, authController.restrictTo('admin', 'lead-guide'), bookingController.getAllBookings);

// GET /api/v1/bookings/:id  (one booking: its owner, or the staff)
router.get('/:id', authController.protect, bookingController.getBooking);

// DELETE /api/v1/bookings/:id  (cancel a booking that still waits for its payment)
router.delete('/:id', authController.protect, bookingController.cancelBooking);

// POST /api/v1/bookings/:id/demo-pay  (the pretend payment of the demo checkout)
router.post('/:id/demo-pay', authController.protect, bookingController.demoPay);

module.exports = router;
