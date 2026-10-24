// routes/tourRoutes.js - connects tour URLs to the functions in the controller.
const express = require('express');
const tourController = require('../controllers/tourController');
const authController = require('../controllers/authController');

const router = express.Router();

// Visitors may look at tours without logging in.
// GET /api/v1/tours  (the "/api/v1/tours" part is added in app.js)
router.get('/', tourController.getAllTours);

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

module.exports = router;