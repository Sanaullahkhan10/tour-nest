// utils/uploadPhoto.js - reads one uploaded file (a form with a file field called "photo").
// multer puts the file in req.file, in memory. The route then gives it to sharp.
const multer = require('multer');
const AppError = require('./appError');

// The biggest file we accept: 5 MB.
const maxBytes = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxBytes,
    // One file, and no other fields in the form.
    files: 1,
    fields: 0,
  },
}).single('photo');

// The guard for a route. It never passes a bad upload on: it turns every problem into a clear AppError.
function uploadPhoto(req, res, next) {
  // The browser tells the size of the upload before it sends it. A far too big upload is refused at once.
  const declared = Number(req.headers['content-length']);
  if (declared > maxBytes + 64 * 1024) {
    return next(new AppError('The photo is too big (the limit is 5 MB)', 413));
  }

  upload(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('The photo is too big (the limit is 5 MB)', 413));
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
        return next(new AppError('Please send one file, in a field called photo', 400));
      }
      if (error.code === 'LIMIT_FIELD_COUNT') {
        return next(new AppError('Please send only the photo file, with no other fields', 400));
      }
    }
    // A broken form (the parser's own errors) is the visitor's mistake too.
    return next(new AppError('The upload was not understood. Please send the photo as a form with one file', 400));
  });
}

module.exports = {
  maxBytes,
  uploadPhoto,
};
