// Load the app we built in app.js.
const app = require('./app');

// Use the port from the environment if there is one (hosting sites give us one),
// otherwise use 3000 on our own computer.
const port = process.env.PORT || 3000;

// Start listening for visitors.
app.listen(port, function () {
  console.log('Server is running on port ' + port);
});
