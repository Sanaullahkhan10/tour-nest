// routes/viewRoutes.js - connects the web page URLs (not the API) to the view controller.
const express = require('express');
const viewController = require('../controllers/viewController');

const router = express.Router();

// GET /  (the home page, with all the tours)
router.get('/', viewController.getOverview);

module.exports = router;
