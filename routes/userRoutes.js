// routes/userRoutes.js - connects user URLs to the functions in the controllers.
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// POST /api/v1/users/signup  (the "/api/v1/users" part is added in app.js)
router.post('/signup', authController.signup);

// POST /api/v1/users/login  (checks email and password)
router.post('/login', authController.login);

// POST /api/v1/users/logout  (removes the login cookie)
router.post('/logout', authController.logout);

module.exports = router;