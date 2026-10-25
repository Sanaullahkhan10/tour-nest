// utils/checkBody.js - a guard that refuses request bodies with dangerous field names.
const AppError = require('./appError');

// How many levels deep a body may go. Our own bodies have one or two levels.
const maxDepth = 10;

// Looks through one value and everything inside it.
// It returns a message about the first problem, or null if all is well.
function findProblem(value, depth) {
  if (depth > maxDepth) {
    return 'The request body is nested too deeply';
  }

  // Only lists and objects can hold field names. Text and numbers are fine.
  if (value === null || typeof value !== 'object') {
    return null;
  }

  // A list: look at every item in it.
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const problem = findProblem(value[i], depth + 1);
      if (problem) {
        return problem;
      }
    }
    return null;
  }

  // An object: look at every field name, then at the value of every field.
  const names = Object.keys(value);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    // A name that starts with $ is a MongoDB operator (like $gt). A dot reaches into other fields.
    if (name.startsWith('$') || name.includes('.') || name === '__proto__') {
      return 'Field names cannot start with $, contain a dot, or be __proto__';
    }
    const problem = findProblem(value[name], depth + 1);
    if (problem) {
      return problem;
    }
  }
  return null;
}

// The guard itself. It runs after the body has been read.
function rejectOperatorKeys(req, res, next) {
  const problem = findProblem(req.body, 0);
  if (problem) {
    throw new AppError(problem, 400);
  }
  next();
}

module.exports = {
  rejectOperatorKeys,
};