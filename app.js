// app.js - creates the Express app and connects URLs to the code that handles them.
const express = require('express');
const tourRoutes = require('./routes/tourRoutes');

const app = express();

// Read the URL query the simple way: "price[lte]=80000" stays one plain name.
// We read those names ourselves in the tour controller, so only allowed filters work.
app.set('query parser', 'simple');

// Lets the app read JSON sent in the body of a request (we need this for POST).
app.use(express.json());

// The home page of the API.
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Tour Nest API',
  });
});

// Every URL that starts with /api/v1/tours is handled by the tour routes.
app.use('/api/v1/tours', tourRoutes);

module.exports = app;
