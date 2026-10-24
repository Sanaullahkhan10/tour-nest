// utils/appError.js - an error that knows its HTTP status code.
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // 4xx codes (the visitor made a mistake) are "fail". 5xx codes (our fault) are "error".
    if (String(statusCode).startsWith('4')) {
      this.status = 'fail';
    } else {
      this.status = 'error';
    }

    // This flag says "we threw this on purpose", so its message is safe to show.
    this.isOperational = true;

    // Keeps the stack (the list of files and lines) clean and useful.
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
