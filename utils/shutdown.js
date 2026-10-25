// utils/shutdown.js - closes the web server and then the database, one after the other.

// "server" needs a close(callback) function (the Express server has one).
// "database" needs a close() function that returns a promise (the Mongoose connection has one).
async function shutDown(server, database) {
  // 1. Stop taking new requests. The requests that are already running may finish.
  let serverError = null;
  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    serverError = error;
  }

  // 2. Close the database in every case, even if the server had a problem.
  await database.close();

  // 3. Now tell the caller about the server problem, if there was one.
  if (serverError) {
    throw serverError;
  }
}

module.exports = {
  shutDown,
};