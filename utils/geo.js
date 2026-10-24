// utils/geo.js - reads places and distances from the URL for the map searches.

// The size of the earth in kilometres, the same number MongoDB uses when it works out
// distances. Because we use the same number, a search "within 100 km" and a list of
// distances in km always agree with each other.
const earthRadiusKm = 6378.1;

// One mile is this many kilometres.
const kmPerMile = 1.609344;

// The biggest distance we accept, in km or in miles (half way around the earth is about 20000 km).
const maxDistance = 20000;

// A plain number like 12 or -3.25. No spaces, no "1e5", no "Infinity", no letters.
const plainNumber = /^-?\d+(\.\d+)?$/;

// Checks the unit from the URL. Only "km" and "mi" are allowed.
// If something is wrong it returns an error message.
function readUnit(unitText) {
  if (unitText !== 'km' && unitText !== 'mi') {
    return { error: 'unit must be km or mi' };
  }
  return { unit: unitText };
}

// Turns the distance from the URL (for example "100") into a number.
function readDistance(distanceText) {
  // Digits only, with an optional decimal part. A minus sign is refused here.
  if (!/^\d+(\.\d+)?$/.test(distanceText)) {
    return { error: 'distance must be a positive number, like 100' };
  }

  const distance = Number(distanceText);
  if (distance <= 0 || distance > maxDistance) {
    return { error: `distance must be more than 0 and at most ${maxDistance}` };
  }

  return { distance: distance };
}

// Turns a place from the URL ("latitude,longitude", for example "36.3269,74.6614") into numbers.
function readLatLng(latlngText) {
  const parts = latlngText.split(',');
  if (parts.length !== 2 || !plainNumber.test(parts[0]) || !plainNumber.test(parts[1])) {
    return { error: 'Give the place as latitude,longitude, like 36.3269,74.6614' };
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (latitude < -90 || latitude > 90) {
    return { error: 'latitude must be from -90 to 90' };
  }
  if (longitude < -180 || longitude > 180) {
    return { error: 'longitude must be from -180 to 180' };
  }

  return { latitude: latitude, longitude: longitude };
}

// MongoDB wants the size of a circle as an angle in radians, not as kilometres.
// The angle is the distance divided by the size of the earth.
function distanceToRadians(distance, unit) {
  let distanceKm = distance;
  if (unit === 'mi') {
    distanceKm = distance * kmPerMile;
  }
  return distanceKm / earthRadiusKm;
}

// MongoDB gives distances in metres. Multiply by this number to get km or miles.
function metersToUnit(unit) {
  if (unit === 'mi') {
    return 1 / (kmPerMile * 1000);
  }
  return 0.001;
}

module.exports = {
  readUnit,
  readDistance,
  readLatLng,
  distanceToRadians,
  metersToUnit,
};