// routes/viewRoutes.js - connects the web page URLs (not the API) to the view controller.
const express = require('express');
const viewController = require('../controllers/viewController');
const authController = require('../controllers/authController');

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

module.exports = router;
