// app.js - creates the Express app and connects URLs to the code that handles them.
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const tourRoutes = require('./routes/tourRoutes');
const userRoutes = require('./routes/userRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const viewRoutes = require('./routes/viewRoutes');
const AppError = require('./utils/appError');
const { apiLimiter, authLimiter } = require('./utils/rateLimit');
const { rejectOperatorKeys } = require('./utils/checkBody');
const { readTrustProxyHops } = require('./utils/settings');
const { globalErrorHandler } = require('./controllers/errorController');
const formatHelpers = require('./utils/format');

const app = express();

// The pages of the website are written with Pug. The templates are in the "views" folder.
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// The small helpers for prices and dates can be used in every template.
Object.assign(app.locals, formatHelpers);

// Behind a proxy (a hosting service), the real IP address of a visitor is in the X-Forwarded-For header.
// TRUST_PROXY_HOPS tells Express how many proxies to believe. 0 (the default) means we trust none.
const proxyHops = readTrustProxyHops(process.env.TRUST_PROXY_HOPS);
if (proxyHops > 0) {
  app.set('trust proxy', proxyHops);
}

// Adds safe HTTP headers to every answer (for example: do not guess file types,
// do not allow our pages inside other sites' frames). It goes first, so every answer gets them.
app.use(helmet());

// The files in the "public" folder (the CSS, later the images) are sent as they are.
// This comes right after helmet, so these files get the safe headers too.
app.use(express.static(path.join(__dirname, 'public')));

// Read the URL query the simple way: "price[lte]=80000" stays one plain name.
// We read those names ourselves in the tour controller, so only allowed filters work.
app.set('query parser', 'simple');

// Too many requests from one IP address get a 429. This goes before the body is read,
// so a visitor who is over the limit costs us almost nothing.
app.use('/api', apiLimiter);
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/signup', authLimiter);

// Lets the app read JSON sent in the body of a request. A body bigger than 10 kb is refused.
app.use(express.json({ limit: '10kb' }));

// Reads the cookies the browser sends and puts them in req.cookies (we need the login cookie).
app.use(cookieParser());

// Refuses bodies with field names like "$gt" (a MongoDB operator) or with dots.
app.use(rejectOperatorKeys);

// A check for the hosting service: is the app alive, and is the database connected?
// It is outside /api, so these checks never count against the rate limit.
app.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'not connected',
  });
});

// The pages of the website (the home page with all the tours, and later more).
app.use('/', viewRoutes);

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

// The body reader (express.json) has its own kinds of errors. We turn the two common ones
// into our own errors, so they get a clear message and the same shape as every other error.
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return next(new AppError('The request body is too big (the limit is 10 kb)', 413));
  }
  if (error.type === 'entity.parse.failed') {
    return next(new AppError('The request body is not valid JSON', 400));
  }
  next(error);
});

// Every error from anywhere in the app ends up here. It must stay the last one.
app.use(globalErrorHandler);

module.exports = app;
