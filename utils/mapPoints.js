// utils/mapPoints.js - the places of a tour as a list of points for the map on the tour page.

// A place is good when it is a real longitude and latitude, in that order (the order MongoDB uses).
function isGoodPlace(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

// Gives back the points of a tour: the start first, then the stops in the order of their days.
// A place with bad coordinates is left out, so one bad place never breaks the page.
// The map script wants latitude first, so we turn the two numbers around here.
function buildMapPoints(tour) {
  const points = [];
  if (!tour) {
    return points;
  }

  const start = tour.startLocation;
  if (start && isGoodPlace(start.coordinates)) {
    points.push({
      kind: 'start',
      lat: start.coordinates[1],
      lng: start.coordinates[0],
      title: 'Start',
      text: start.description || start.address || '',
    });
  }

  // We copy the list before sorting it, so the tour itself is not changed.
  const stops = (tour.locations || []).slice();
  stops.sort((a, b) => a.day - b.day);
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (isGoodPlace(stop.coordinates)) {
      points.push({
        kind: 'stop',
        lat: stop.coordinates[1],
        lng: stop.coordinates[0],
        title: 'Day ' + stop.day,
        text: stop.description || '',
      });
    }
  }

  return points;
}

module.exports = {
  buildMapPoints,
};
