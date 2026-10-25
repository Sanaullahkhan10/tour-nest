// controllers/imageController.js - sends a saved picture to the browser.
const Image = require('../models/imageModel');
const AppError = require('../utils/appError');
const { looksLikeImageId } = require('../utils/photoUrl');

// GET /img/:id - the picture with that id.
async function getImage(req, res) {
  // A badly shaped id cannot be ours, so we do not even ask the database.
  if (!looksLikeImageId(req.params.id)) {
    throw new AppError('Picture not found', 404);
  }

  const image = await Image.findById(req.params.id);
  if (!image) {
    throw new AppError('Picture not found', 404);
  }

  res.set('Content-Type', image.contentType);
  // A new upload always gets a new id, so the same address never shows a different picture.
  // That is why the browser may keep this one for a year without asking again.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).send(image.data);
}

module.exports = {
  getImage,
};
