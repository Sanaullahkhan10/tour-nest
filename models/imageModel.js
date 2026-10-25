// models/imageModel.js - one picture, saved inside the database.
// The hosting service we use (Render, free plan) erases every file we write to its disk
// each time the site is deployed again. The database keeps its data, so the pictures live there.
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  // The picture itself, already made small by sharp (see utils/imageProcessing.js).
  data: {
    type: Buffer,
    required: [true, 'A picture must have data'],
  },
  contentType: {
    type: String,
    required: [true, 'A picture must have a content type'],
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Image = mongoose.model('Image', imageSchema);

module.exports = Image;
