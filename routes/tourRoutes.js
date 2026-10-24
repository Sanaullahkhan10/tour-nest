// routes/tourRoutes.js - connects tour URLs to the functions in the controller.
const express = require('express');
const tourController = require('../controllers/tourController');
const authController = require('../controllers/authController');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

// Visitors may look at tours without logging in.
// GET /api/v1/tours  (the "/api/v1/tours" part is added in app.js)
router.get('/', tourController.getAllTours);

// GET /api/v1/tours/tour-stats  (numbers about the tours, one line for each difficulty)
// This route must come BEFORE "/:id". Express checks routes from top to bottom,
// and "/:id" would take the word "tour-stats" as a tour id.
router.get('/tour-stats', tourController.getTourStats);
// GET /api/v1/tours/monthly-plan/:year  (which tours start in which month of a year; staff only)
router.get('/monthly-plan/:year', authController.protect, authController.restrictTo('admin', 'lead-guide', 'guide'), tourController.getMonthlyPlan);
// GET /api/v1/tours/tours-within/:distance/center/:latlng/unit/:unit  (tours that start near a place)
// For example: /api/v1/tours/tours-within/200/center/36.3269,74.6614/unit/km
router.get('/tours-within/:distance/center/:latlng/unit/:unit', tourController.getToursWithin);
// GET /api/v1/tours/:id  (":id" is a blank that the visitor fills in)
router.get('/:id', tourController.getTour);

// Changing tours is only for staff. For each of these routes, protect runs first
// (is the visitor logged in?), then restrictTo (is the role allowed?), then the real function.

// POST /api/v1/tours  (creates a new tour)
router.post('/', authController.protect, authController.restrictTo('admin', 'lead-guide'), tourController.createTour);

// PATCH /api/v1/tours/:id  (changes some fields of one tour)
router.patch('/:id', authController.protect, authController.restrictTo('admin', 'lead-guide'), tourController.updateTour);

// DELETE /api/v1/tours/:id  (removes one tour)
router.delete('/:id', authController.protect, authController.restrictTo('admin', 'lead-guide'), tourController.deleteTour);

// POST /api/v1/tours/:tourId/reviews  (a logged-in user writes a review of this tour)
router.post('/:tourId/reviews', authController.protect, authController.restrictTo('user'), reviewController.createReview);

// GET /api/v1/tours/:tourId/reviews  (anyone may read the reviews of a tour)
router.get('/:tourId/reviews', reviewController.getTourReviews);

module.exports = router;