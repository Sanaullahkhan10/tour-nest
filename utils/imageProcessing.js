// utils/imageProcessing.js - turns the file of a visitor into a small, safe picture.
// We never save the original file. We open it, cut it to a square, make it small, and save a new JPEG.
// That also removes everything hidden inside photos (for example the place where it was taken).
const sharp = require('sharp');
const AppError = require('./appError');

// Do not keep pictures in sharp's memory after we are done (the free server has little memory).
sharp.cache(false);

// The only kinds of picture we accept. We read the kind from inside the file,
// never from its name or from what the browser says, because both can be faked.
// SVG is not allowed on purpose: it is a program-like text file, not a photo.
const allowedFormats = ['jpeg', 'png', 'webp'];

// A picture with more pixels than this is refused before we open it (a small file can hide a huge picture).
const maxPixels = 40000000;

// The photo of a user is a square of this many pixels on each side.
const photoSize = 400;

const unreadableMessage = 'We could not read that file. Please choose a JPEG, PNG or WebP picture';

// Gives back { data, contentType } with a JPEG of exactly width x height pixels (cut from the middle).
// "options.maxPixels" is only for the tests.
async function makePicture(buffer, width, height, options) {
  const limit = (options && options.maxPixels) || maxPixels;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(unreadableMessage, 400);
  }

  // metadata() only reads the head of the file. It does not open the whole picture.
  let info;
  try {
    info = await sharp(buffer).metadata();
  } catch (error) {
    throw new AppError(unreadableMessage, 400);
  }
  if (!allowedFormats.includes(info.format) || !info.width || !info.height) {
    throw new AppError(unreadableMessage, 400);
  }
  if (info.width * info.height > limit) {
    throw new AppError('That picture is too large. Please choose a smaller one', 400);
  }

  try {
    const data = await sharp(buffer, { limitInputPixels: limit })
      // Turn the picture the right way up (phones save it sideways and write a note about it).
      .rotate()
      // A JPEG has no see-through parts, so see-through parts of a PNG become white.
      .flatten({ background: '#ffffff' })
      // Cut the picture to the wanted size from the middle.
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: data, contentType: 'image/jpeg' };
  } catch (error) {
    throw new AppError(unreadableMessage, 400);
  }
}

// The photo of a user: a square.
function makeSquarePhoto(buffer, options) {
  return makePicture(buffer, photoSize, photoSize, options);
}

// The sizes of the pictures of a tour.
const coverSize = { width: 1400, height: 900 };
const gallerySize = { width: 1200, height: 800 };

module.exports = {
  maxPixels,
  photoSize,
  coverSize,
  gallerySize,
  makePicture,
  makeSquarePhoto,
};
