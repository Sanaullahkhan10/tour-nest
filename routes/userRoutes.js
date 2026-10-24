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

// The routes below are for admins only: protect (logged in?), then restrictTo (is an admin?).
// They must stay AFTER the fixed names above. Otherwise "/me" would be read as an id.

// GET /api/v1/users  (the list of users)
router.get('/', authController.protect, authController.restrictTo('admin'), userController.getAllUsers);

// GET /api/v1/users/:id  (one user)
router.get('/:id', authController.protect, authController.restrictTo('admin'), userController.getUser);

// PATCH /api/v1/users/:id  (an admin changes the role of a user)
router.patch('/:id', authController.protect, authController.restrictTo('admin'), userController.updateUser);

// DELETE /api/v1/users/:id  (an admin closes the account of a user)
router.delete('/:id', authController.protect, authController.restrictTo('admin'), userController.deleteUser);

module.exports = router;