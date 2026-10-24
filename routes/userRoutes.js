// routes/userRoutes.js - connects user URLs to the functions in the controllers.
const express = require('express');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

const router = express.Router();

// POST /api/v1/users/signup  (the "/api/v1/users" part is added in app.js)
router.post('/signup', authController.signup);

// POST /api/v1/users/login  (checks email and password)
router.post('/login', authController.login);

// POST /api/v1/users/logout  (removes the login cookie)
router.post('/logout', authController.logout);

// GET /api/v1/users/me  (shows the logged-in user; "protect" runs first)
router.get('/me', authController.protect, userController.getMe);

module.exports = router;