// tests/helpers.js - small tools shared by the tests.
const app = require('../app');

// Starts the app on any free port. Gives back its address and a function that stops it.
function startApp() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({
        baseUrl: 'http://127.0.0.1:' + server.address().port,
        stop: () => {
          return new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          });
        },
      });
    });
  });
}

// Sends one request. "rawBody" is the exact text to send as JSON (leave it out for no body).
// Gives back the status, the headers, and the answer read as JSON (null if it is not JSON).
async function send(baseUrl, path, method, rawBody) {
  const settings = { method: method, headers: {} };
  if (rawBody !== undefined) {
    settings.headers['Content-Type'] = 'application/json';
    settings.body = rawBody;
  }

  const reply = await fetch(baseUrl + path, settings);
  const text = await reply.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    json = null;
  }
  return { status: reply.status, headers: reply.headers, json: json };
}

module.exports = {
  startApp,
  send,
};