// app.js - creates the Express app and connects URLs to the code that handles them.
const express = require('express');
const cookieParser = require('cookie-parser');
const tourRoutes = require('./routes/tourRoutes');
const userRoutes = require('./routes/userRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const AppError = require('./utils/appError');
const { globalErrorHandler } = require('./controllers/errorController');

const app = express();

// Read the URL query the simple way: "price[lte]=80000" stays one plain name.
// We read those names ourselves in the tour controller, so only allowed filters work.
app.set('query parser', 'simple');

// Lets the app read JSON sent in the body of a request (we need this for POST).
app.use(express.json());

// Reads the cookies the browser sends and puts them in req.cookies (we need the login cookie).
app.use(cookieParser());

// The home page of the API.
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Tour Nest API',
  });
});

// Every URL that starts with /api/v1/tours is handled by the tour routes.
app.use('/api/v1/tours', tourRoutes);

// Every URL that starts with /api/v1/users is handled by the user routes.
app.use('/api/v1/users', userRoutes);

// Every URL that starts with /api/v1/reviews is handled by the review routes.
app.use('/api/v1/reviews', reviewRoutes);

// If we reach this line, no route above matched the URL, so it is a 404.
app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Every error from anywhere in the app ends up here. It must stay the last one.
app.use(globalErrorHandler);

module.exports = app;