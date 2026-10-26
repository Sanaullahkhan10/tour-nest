// utils/uploadTourImages.js - reads the files of a tour upload: one "imageCover" and up to three "images".
// multer puts them in req.files, in memory. The tour controller then gives them to sharp.
const multer = require('multer');
const AppError = require('./appError');
const { maxBytes, uploadErrorFor } = require('./uploadPhoto');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxBytes,
    // At most 4 files in all, and no other fields in the form.
    files: 4,
    fields: 0,
  },
}).fields([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 3 },
]);

function uploadTourImages(req, res, next) {
  // Four files of 5 MB are the most we accept. A far bigger upload is refused before we read it.
  const declared = Number(req.headers['content-length']);
  if (declared > 4 * maxBytes + 64 * 1024) {
    return next(new AppError('The upload is too big (the limit is 5 MB for each file)', 413));
  }

  upload(req, res, (error) => {
    if (!error) {
      return next();
    }
    return next(uploadErrorFor(error, 'Please send at most one file in imageCover and three files in images, and nothing else'));
  });
}

module.exports = {
  uploadTourImages,
};
