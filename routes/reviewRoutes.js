// routes/reviewRoutes.js - connects review URLs to the functions in the review controller.
const express = require('express');
const authController = require('../controllers/authController');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

// PATCH /api/v1/reviews/:id  (the writer changes their review; protect checks the login first)
router.patch('/:id', authController.protect, reviewController.updateReview);

module.exports = router;