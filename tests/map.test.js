// tests/map.test.js - the map on the tour page (Leaflet and OpenStreetMap).
// No database is needed: the routes get fake search results, and the map script runs
// against a pretend page and a pretend Leaflet.
process.env.DISABLE_RATE_LIMIT = 'true';
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = require('../app');
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const { buildMapPoints } = require('../utils/mapPoints');
const { startApp } = require('./helpers');

const tourId = '64b7f0c2a1b2c3d4e5f60002';

// The places are [longitude, latitude], the way MongoDB keeps them.
const tour = {
  _id: tourId,
  name: 'The Hunza Valley Explorer',
  duration: 7,
  maxGroupSize: 12,
  difficulty: 'easy',
  price: 95000,
  summary: 'Seven relaxed days among apricot orchards.',
  ratingsAverage: 0,
  ratingsQuantity: 0,
  startLocation: { type: 'Point', coordinates: [74.66, 36.32], address: 'Karimabad, Hunza', description: 'Meet at the old bazaar' },
  locations: [
    { type: 'Point', coordinates: [74.88, 36.62], day: 3, description: 'Village walk in Gulmit' },
    { type: 'Point', coordinates: [74.67, 36.33], day: 1, description: 'Baltit Fort' },
  ],
};

describe('buildMapPoints', () => {
  it('puts the start first, then the stops in the order of their days', () => {
    const points = buildMapPoints(tour);
    assert.deepEqual(
      points.map((point) => point.title),
      ['Start', 'Day 1', 'Day 3']
    );
    assert.deepEqual(
      points.map((point) => point.kind),
      ['start', 'stop', 'stop']
    );
  });

  it('turns longitude, latitude into latitude (lat) and longitude (lng)', () => {
    const start = buildMapPoints(tour)[0];
    assert.equal(start.lat, 36.32);
    assert.equal(start.lng, 74.66);
  });

  it('uses the description of a place, or the address of the start when there is no description', () => {
    const points = buildMapPoints(tour);
    assert.equal(points[0].text, 'Meet at the old bazaar');
    assert.equal(points[1].text, 'Baltit Fort');
    const noDescription = { ...tour, startLocation: { type: 'Point', coordinates: [74.66, 36.32], address: 'Karimabad, Hunza' } };
    assert.equal(buildMapPoints(noDescription)[0].text, 'Karimabad, Hunza');
  });

  it('does not change the order of the list inside the tour', () => {
    const copy = { ...tour, locations: tour.locations.slice() };
    buildMapPoints(copy);
    assert.equal(copy.locations[0].day, 3);
  });

  it('leaves out places with bad coordinates and keeps the good ones', () => {
    const messy = {
      startLocation: { coordinates: [200, 36] },
      locations: [
        { coordinates: [74, 95], day: 1, description: 'latitude too big' },
        { coordinates: ['74', '36'], day: 2, description: 'text instead of numbers' },
        { coordinates: [74], day: 3, description: 'only one number' },
        { coordinates: null, day: 4, description: 'nothing' },
        { coordinates: [NaN, 36], day: 5, description: 'not a number' },
        { coordinates: [75.1, 35.2], day: 6, description: 'good' },
      ],
    };
    const points = buildMapPoints(messy);
    assert.equal(points.length, 1);
    assert.equal(points[0].title, 'Day 6');
  });

  it('copes with a missing tour, no start and no stops', () => {
    assert.deepEqual(buildMapPoints(null), []);
    assert.deepEqual(buildMapPoints({}), []);
    assert.deepEqual(buildMapPoints({ startLocation: undefined, locations: undefined }), []);
  });
});

// Draws a template with the given data and gives back the HTML.
function render(name, data) {
  return new Promise((resolve, reject) => {
    app.render(name, data, (error, html) => {
      if (error) {
        reject(error);
      } else {
        resolve(html);
      }
    });
  });
}

describe('tour template with a map', () => {
  const base = { title: tour.name, tour: tour, stops: [], reviews: [], startDates: [] };

  it('has the map box, the Leaflet files and the map script when there are points', async () => {
    const points = buildMapPoints(tour);
    const html = await render('tour', { ...base, mapPoints: points });
    assert.ok(html.includes('id="tour-map"'));
    assert.ok(html.includes('href="/vendor/leaflet/leaflet.css"'));
    assert.ok(html.includes('src="/vendor/leaflet/leaflet.js"'));
    assert.ok(html.includes('src="/js/map.js"'));
    // Leaflet must load before our map script.
    assert.ok(html.indexOf('/vendor/leaflet/leaflet.js') < html.indexOf('/js/map.js'));
  });

  it('puts the points in the page as JSON that can be read back', async () => {
    const points = buildMapPoints(tour);
    const html = await render('tour', { ...base, mapPoints: points });
    const found = html.match(/data-points="([^"]*)"/);
    assert.ok(found, 'data-points was not found');
    const text = found[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(text), points);
  });

  it('has no map, no Leaflet and no map script when there are no points', async () => {
    for (const mapPoints of [[], undefined]) {
      const html = await render('tour', { ...base, mapPoints: mapPoints });
      assert.ok(!html.includes('tour-map'));
      assert.ok(!html.includes('leaflet'));
      assert.ok(!html.includes('/js/map.js'));
    }
  });

  it('turns HTML inside the text of a place into harmless text', async () => {
    const evil = [{ kind: 'stop', lat: 36, lng: 74, title: 'Day 1', text: '"><script>alert(1)</script>' }];
    const html = await render('tour', { ...base, mapPoints: evil });
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(!html.includes('"><script>'));
  });
});

describe('map page route and Leaflet files', () => {
  let site;

  before(async () => {
    mock.method(Tour, 'findById', (id) => ({ lean: () => Promise.resolve(id === tourId ? { ...tour } : null) }));
    const chain = {
      sort: () => chain,
      limit: () => chain,
      populate: () => chain,
      lean: () => Promise.resolve([]),
    };
    mock.method(Review, 'find', () => chain);
    site = await startApp();
  });
  after(async () => {
    mock.restoreAll();
    await site.stop();
  });

  it('the tour page has the map with the start and the stops in order', async () => {
    const reply = await fetch(site.baseUrl + '/tours/' + tourId);
    const html = await reply.text();
    assert.equal(reply.status, 200);
    const found = html.match(/data-points="([^"]*)"/);
    assert.ok(found);
    const points = JSON.parse(found[1].replace(/&quot;/g, '"'));
    assert.deepEqual(
      points.map((point) => point.title),
      ['Start', 'Day 1', 'Day 3']
    );
  });

  it('sends the Leaflet script, style and pictures from our own server', async () => {
    const script = await fetch(site.baseUrl + '/vendor/leaflet/leaflet.js');
    assert.equal(script.status, 200);
    assert.ok(script.headers.get('content-type').includes('javascript'));
    assert.ok((await script.text()).includes('Leaflet'));

    const style = await fetch(site.baseUrl + '/vendor/leaflet/leaflet.css');
    assert.equal(style.status, 200);
    assert.ok(style.headers.get('content-type').includes('text/css'));

    const picture = await fetch(site.baseUrl + '/vendor/leaflet/images/layers.png');
    assert.equal(picture.status, 200);
    assert.equal(picture.headers.get('content-type'), 'image/png');
  });

  it('does not send files from outside the Leaflet folder', async () => {
    const reply = await fetch(site.baseUrl + '/vendor/leaflet/%2e%2e/%2e%2e/package.json');
    assert.notEqual(reply.status, 200);
    const text = await reply.text();
    assert.ok(!text.includes('"dependencies"'));
  });

  it('allows map pictures from OpenStreetMap and nothing else new', async () => {
    const reply = await fetch(site.baseUrl + '/');
    const policy = reply.headers.get('content-security-policy');
    assert.ok(policy.includes("img-src 'self' data: https://tile.openstreetmap.org"));
    // Scripts still come from our own server only.
    assert.ok(policy.includes("script-src 'self';"));
    assert.ok(policy.includes("object-src 'none'"));
    assert.ok(policy.includes("default-src 'self'"));
    assert.ok(!policy.includes('unpkg') && !policy.includes('cdn'));
  });

  it('sends the origin as referrer to other sites (OpenStreetMap needs this)', async () => {
    const reply = await fetch(site.baseUrl + '/');
    assert.equal(reply.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });
});

// Lists made inside the sandbox have another Array, so we turn them into ordinary ones before comparing.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('map.js', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'map.js'), 'utf8');

  // Runs map.js on a pretend page. "dataPoints" is the text in data-points (or null for no box at all).
  function run(dataPoints, withLeaflet) {
    const calls = { map: [], tileLayer: [], markers: [], polylines: [], fitBounds: [], setView: [] };

    function fakeElement(tag) {
      const element = { tag: tag, textContent: '', children: [] };
      element.appendChild = (child) => {
        element.children.push(child);
      };
      return element;
    }

    const box = dataPoints === null ? null : { dataset: { points: dataPoints } };
    const document = {
      getElementById: (id) => (id === 'tour-map' ? box : null),
      createElement: fakeElement,
    };

    const mapObject = {
      fitBounds: (places, options) => calls.fitBounds.push({ places: places, options: options }),
      setView: (place, zoom) => calls.setView.push({ place: place, zoom: zoom }),
    };
    const L = {
      map: (element, options) => {
        calls.map.push({ element: element, options: options });
        return mapObject;
      },
      tileLayer: (url, options) => {
        calls.tileLayer.push({ url: url, options: options });
        return { addTo: () => {} };
      },
      circleMarker: (place, options) => {
        const marker = { place: place, options: options, popup: null };
        marker.bindPopup = (content) => {
          marker.popup = content;
        };
        marker.addTo = () => calls.markers.push(marker);
        return marker;
      },
      polyline: (places, options) => {
        calls.polylines.push({ places: places, options: options });
        return { addTo: () => {} };
      },
    };

    const context = vm.createContext(withLeaflet === false ? { document } : { document, L });
    vm.runInContext(code, context, { filename: 'map.js' });
    return { calls: calls, box: box };
  }

  const twoPoints = JSON.stringify([
    { kind: 'start', lat: 36.32, lng: 74.66, title: 'Start', text: 'Meet at the old bazaar' },
    { kind: 'stop', lat: 36.62, lng: 74.88, title: 'Day 3', text: 'Village walk' },
  ]);

  it('draws the map, the OpenStreetMap pictures with the note about the mapmakers, and the markers', () => {
    const { calls, box } = run(twoPoints);
    assert.equal(calls.map.length, 1);
    assert.equal(calls.map[0].element, box);
    assert.equal(calls.map[0].options.scrollWheelZoom, false);
    assert.equal(calls.tileLayer[0].url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.ok(calls.tileLayer[0].options.attribution.includes('OpenStreetMap'));
    assert.ok(calls.tileLayer[0].options.attribution.includes('https://www.openstreetmap.org/copyright'));
    assert.equal(calls.markers.length, 2);
    assert.deepEqual(plain(calls.markers[0].place), [36.32, 74.66]);
  });

  it('draws the start bigger and in another colour than the stops', () => {
    const { calls } = run(twoPoints);
    assert.ok(calls.markers[0].options.radius > calls.markers[1].options.radius);
    assert.notEqual(calls.markers[0].options.fillColor, calls.markers[1].options.fillColor);
  });

  it('draws a line through the places and zooms to show all of them', () => {
    const { calls } = run(twoPoints);
    assert.equal(calls.polylines.length, 1);
    assert.deepEqual(plain(calls.polylines[0].places), [
      [36.32, 74.66],
      [36.62, 74.88],
    ]);
    assert.equal(calls.fitBounds.length, 1);
    assert.deepEqual(plain(calls.fitBounds[0].places), plain(calls.polylines[0].places));
    assert.equal(calls.setView.length, 0);
  });

  it('with one place: centres on it, no line', () => {
    const one = JSON.stringify([{ kind: 'start', lat: 36.32, lng: 74.66, title: 'Start', text: '' }]);
    const { calls } = run(one);
    assert.equal(calls.polylines.length, 0);
    assert.equal(calls.fitBounds.length, 0);
    assert.deepEqual(plain(calls.setView[0].place), [36.32, 74.66]);
  });

  it('builds the popup from plain text pieces, so HTML in the text cannot run', () => {
    const evil = JSON.stringify([{ kind: 'stop', lat: 36, lng: 74, title: '<b>Day 1</b>', text: '<img src=x onerror=alert(1)>' }]);
    const { calls } = run(evil);
    const popup = calls.markers[0].popup;
    assert.equal(typeof popup, 'object');
    assert.ok(!('innerHTML' in popup));
    assert.equal(popup.children[0].tag, 'strong');
    assert.equal(popup.children[0].textContent, '<b>Day 1</b>');
    assert.equal(popup.children[1].tag, 'p');
    assert.equal(popup.children[1].textContent, '<img src=x onerror=alert(1)>');
    assert.ok(!('innerHTML' in popup.children[0]) && !('innerHTML' in popup.children[1]));
  });

  it('skips points without real numbers and draws the good ones', () => {
    const messy = JSON.stringify([
      { kind: 'stop', lat: 'x', lng: 74, title: 'bad' },
      null,
      { kind: 'stop', lat: 36, lng: null, title: 'bad' },
      { kind: 'stop', lat: 35, lng: 75, title: 'good' },
    ]);
    const { calls } = run(messy);
    assert.equal(calls.markers.length, 1);
    assert.deepEqual(plain(calls.setView[0].place), [35, 75]);
  });

  it('does nothing (and does not crash) when there is no box, no Leaflet, bad JSON or no good points', () => {
    assert.equal(run(null).calls.map.length, 0);
    assert.doesNotThrow(() => run(twoPoints, false));
    assert.equal(run('this is not JSON').calls.map.length, 0);
    assert.equal(run('{"lat":1}').calls.map.length, 0);
    assert.equal(run('[]').calls.map.length, 0);
    assert.equal(run('[{"lat":"a","lng":"b"}]').calls.map.length, 0);
  });
});
