// routes/imageRoutes.js - the address of the saved pictures.
const express = require('express');
const imageController = require('../controllers/imageController');

const router = express.Router();

// GET /img/:id  (the "/img" part is added in app.js)
router.get('/:id', imageController.getImage);

module.exports = router;
