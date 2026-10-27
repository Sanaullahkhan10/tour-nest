// routes/viewRoutes.js - connects the web page URLs (not the API) to the view controller.
const express = require('express');
const viewController = require('../controllers/viewController');
const authController = require('../controllers/authController');
const bookingViewController = require('../controllers/bookingViewController');

const router = express.Router();

// GET /  (the home page, with all the tours)
// Every page first runs attachUser, so the header knows who is logged in.
// (It is not used for the whole router, because the router is also reached by /api addresses.)
router.get('/', authController.attachUser, viewController.getOverview);

// GET /tours/:id  (the page of one tour)
router.get('/tours/:id', authController.attachUser, viewController.getTour);

// GET /login  (the login page)
router.get('/login', authController.attachUser, viewController.getLoginPage);

// GET /signup  (the signup page)
router.get('/signup', authController.attachUser, viewController.getSignupPage);

// GET /me  (the account page of the logged-in visitor)
router.get('/me', authController.attachUser, viewController.getAccountPage);

// GET /forgot-password  (asks for the email, to send the reset link)
router.get('/forgot-password', authController.attachUser, viewController.getForgotPasswordPage);

// GET /reset-password/:token  (the page of the link in the email)
router.get('/reset-password/:token', authController.attachUser, viewController.getResetPasswordPage);

// GET /my-tours  (the bookings of the logged-in visitor)
router.get('/my-tours', authController.attachUser, bookingViewController.getMyToursPage);

// GET /pay/:id  (the payment page of a booking)
router.get('/pay/:id', authController.attachUser, bookingViewController.getPayPage);

// PayFast sends the customer back to one of these two addresses, by GET (an address) or by POST (a form).
// There is no login check: the customer's cookie may not come along. The validation hash is the proof.
const readForm = express.urlencoded({ extended: false, limit: '10kb' });
router.get('/payment/payfast/success', bookingViewController.payfastReturn);
router.post('/payment/payfast/success', readForm, bookingViewController.payfastReturn);
router.get('/payment/payfast/failure', bookingViewController.payfastReturn);
router.post('/payment/payfast/failure', readForm, bookingViewController.payfastReturn);

module.exports = router;
