// controllers/errorController.js - turns every error into a clear JSON answer.
const AppError = require('../utils/appError');

// Changes errors we know about (from Mongoose or Express) into friendly AppErrors.
// Errors we do not know about are returned unchanged.
function convertKnownErrors(err) {
  // A badly shaped id, like /tours/abc.
  if (err.name === 'CastError') {
    return new AppError(`Invalid ${err.path}`, 400);
  }

  // The data broke a rule of the model. We join all the messages into one text.
  if (err.name === 'ValidationError') {
    const messages = [];
    const fieldNames = Object.keys(err.errors);
    for (let i = 0; i < fieldNames.length; i++) {
      messages.push(err.errors[fieldNames[i]].message);
    }
    return new AppError(messages.join('. '), 400);
  }

  // A value that must be unique (like a tour name) already exists.
  if (err.code === 11000) {
    let field = 'value';
    if (err.keyValue) {
      field = Object.keys(err.keyValue)[0];
    }
    return new AppError(`${field} is already taken`, 400);
  }

  // The visitor sent a body that is not valid JSON.
  if (err.type === 'entity.parse.failed') {
    return new AppError('The request body is not valid JSON', 400);
  }

  return err;
}

// Express knows this is an error handler because it has exactly four parameters.
function globalErrorHandler(err, req, res, next) {
  // If the answer already started going out, we cannot change it. Let Express finish.
  if (res.headersSent) {
    return next(err);
  }

  const knownError = convertKnownErrors(err);

  // An error we threw on purpose: its message is safe to show.
  if (knownError.isOperational) {
    return res.status(knownError.statusCode).json({
      status: knownError.status,
      message: knownError.message,
    });
  }

  // Anything else is a bug. The real error goes to our terminal only.
  console.error('Unexpected error:', err);

  const body = {
    status: 'error',
    message: 'Something went wrong',
  };
  // On our own computer we also show where it happened, to help us fix it.
  if (process.env.NODE_ENV === 'development') {
    body.stack = err.stack;
  }
  res.status(500).json(body);
}

module.exports = {
  globalErrorHandler,
  convertKnownErrors,
};
