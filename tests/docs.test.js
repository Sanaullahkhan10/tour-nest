// tests/docs.test.js - the documents must keep up with the code.
// If somebody adds a route and forgets docs/API.md, or adds a setting and forgets the README, a test fails.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// The route files and the address that app.js puts in front of each one.
const mounts = {
  'routes/tourRoutes.js': '/api/v1/tours',
  'routes/userRoutes.js': '/api/v1/users',
  'routes/reviewRoutes.js': '/api/v1/reviews',
  'routes/bookingRoutes.js': '/api/v1/bookings',
};

// Reads "router.get('/path', ...)" lines, and the router.route('/path').get(...).post(...) line.
function readRoutes(file, prefix) {
  const code = read(file);
  const routes = [];
  const simple = /router\.(get|post|patch|delete)\('([^']*)'/g;
  let match;
  while ((match = simple.exec(code)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + (prefix + (match[2] === '/' ? '' : match[2])));
  }
  const chained = /router\.route\('([^']*)'\)([^;]*);/g;
  while ((match = chained.exec(code)) !== null) {
    const methods = match[2].match(/\.(get|post|patch|delete)\(/g) || [];
    for (let i = 0; i < methods.length; i++) {
      routes.push(methods[i].slice(1, -1).toUpperCase() + ' ' + (prefix + match[1]));
    }
  }
  return routes;
}

describe('docs/API.md', () => {
  const docs = read('docs/API.md');

  it('describes every route of the API', () => {
    let total = 0;
    const files = Object.keys(mounts);
    for (let i = 0; i < files.length; i++) {
      const routes = readRoutes(files[i], mounts[files[i]]);
      assert.ok(routes.length > 0, 'no routes found in ' + files[i]);
      for (let j = 0; j < routes.length; j++) {
        total++;
        assert.ok(docs.includes('`' + routes[j] + '`'), 'docs/API.md does not describe ' + routes[j]);
      }
    }
    assert.ok(total >= 37, 'the route reader found only ' + total + ' routes');
  });

  it('describes the picture and health addresses too', () => {
    assert.ok(docs.includes('`GET /img/:id`'));
    assert.ok(docs.includes('`GET /health`'));
  });

  it('does not describe a route that does not exist', () => {
    const real = new Set();
    const files = Object.keys(mounts);
    for (let i = 0; i < files.length; i++) {
      readRoutes(files[i], mounts[files[i]]).forEach((route) => real.add(route));
    }
    // The headings look like: ### `GET /api/v1/tours/:id`. Two routes can share one heading with "and".
    const headings = docs.match(/^### .*$/gm) || [];
    for (let i = 0; i < headings.length; i++) {
      const found = headings[i].match(/`([A-Z]+ \/[^`]*)`/g) || [];
      for (let j = 0; j < found.length; j++) {
        const route = found[j].slice(1, -1);
        if (route.startsWith('GET /img') || route.startsWith('GET /health')) {
          continue;
        }
        assert.ok(real.has(route), 'docs/API.md describes ' + route + ', but the code has no such route');
      }
    }
  });
});

describe('README.md', () => {
  const readme = read('README.md');

  it('names every setting of .env.example', () => {
    const names = read('.env.example').match(/^[A-Z][A-Z0-9_]*(?==)/gm) || [];
    assert.ok(names.length >= 20);
    for (let i = 0; i < names.length; i++) {
      assert.ok(readme.includes('`' + names[i] + '`'), 'README.md does not name the setting ' + names[i]);
    }
  });

  it('links to the API document, and that file exists', () => {
    assert.ok(readme.includes('docs/API.md'));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'API.md')));
  });

  it('every npm script and dev-data script it shows exists', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.ok(scripts.dev && scripts.test && scripts.start);
    const files = readme.match(/dev-data\/[a-z-]+\.js/g) || [];
    assert.ok(files.length >= 3);
    for (let i = 0; i < files.length; i++) {
      assert.ok(fs.existsSync(path.join(root, files[i])), files[i] + ' does not exist');
    }
  });

  it('has no screenshot link to a file that is missing', () => {
    const images = readme.match(/\]\((docs\/screenshots\/[^)]+)\)/g) || [];
    for (let i = 0; i < images.length; i++) {
      const file = images[i].slice(2, -1);
      assert.ok(fs.existsSync(path.join(root, file)), file + ' is in the README but not in the folder');
    }
  });
});
