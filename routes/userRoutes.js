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

// PATCH /api/v1/users/updateMyPassword  (the logged-in user chooses a new password)
router.patch('/updateMyPassword', authController.protect, authController.updateMyPassword);

// PATCH /api/v1/users/updateMe  (the logged-in user changes their name or email)
router.patch('/updateMe', authController.protect, userController.updateMe);

// DELETE /api/v1/users/deleteMe  (the logged-in user closes their account)
router.delete('/deleteMe', authController.protect, userController.deleteMe);

module.exports = router;