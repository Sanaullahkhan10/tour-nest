// Import Express, the library that helps us build a web server.
const express = require('express');

// Create our app. Think of it as the "brain" of the website.
const app = express();

// A route: when someone opens "/" (the home address) with a GET request,
// we send back a small JSON message.
app.get('/', function (request, response) {
  response.status(200).json({
    status: 'success',
    message: 'Welcome to Tour Nest API',
  });
});

// Share the app so other files (like server.js) can use it.
module.exports = app;
