// routes/tourRoutes.js - connects tour URLs to the functions in the controller.
const express = require('express');
const tourController = require('../controllers/tourController');

const router = express.Router();

// GET /api/v1/tours  (the "/api/v1/tours" part is added in app.js)
router.get('/', tourController.getAllTours);

// POST /api/v1/tours  (creates a new tour)
router.post('/', tourController.createTour);

// GET /api/v1/tours/:id  (":id" is a blank that the visitor fills in)
router.get('/:id', tourController.getTour);

// PATCH /api/v1/tours/:id  (changes some fields of one tour)
router.patch('/:id', tourController.updateTour);

// DELETE /api/v1/tours/:id  (removes one tour)
router.delete('/:id', tourController.deleteTour);

module.exports = router;
