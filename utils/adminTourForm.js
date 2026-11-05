// utils/adminTourForm.js - turns a tour from the database into the plain values of the admin form.
// Everything is text (or a list of texts), so the page can put it into the fields without any thinking.

// "2027-04-15" from a date. A value that is not a date gives an empty text.
function dateLine(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

// A number as text, or an empty text when there is none.
function numberText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

// Coordinates in the database are [longitude, latitude]. The form shows latitude first, because people say it that way.
function readPoint(point) {
  const coordinates = point && Array.isArray(point.coordinates) ? point.coordinates : [];
  if (coordinates.length !== 2) {
    return { lat: '', lng: '' };
  }
  return { lat: numberText(coordinates[1]), lng: numberText(coordinates[0]) };
}

// "tour" can be missing: that is the form for a new tour, with empty fields.
function tourToForm(tour) {
  const source = tour || {};
  const start = source.startLocation || {};
  const startPoint = readPoint(start);

  const locations = (source.locations || [])
    .map((place) => {
      const point = readPoint(place);
      return { day: numberText(place.day), description: place.description || '', lat: point.lat, lng: point.lng };
    })
    .sort((a, b) => Number(a.day) - Number(b.day));

  return {
    name: source.name || '',
    summary: source.summary || '',
    description: source.description || '',
    duration: numberText(source.duration),
    maxGroupSize: numberText(source.maxGroupSize),
    difficulty: source.difficulty || 'easy',
    price: numberText(source.price),
    secretTour: Boolean(source.secretTour),
    startDates: (source.startDates || [])
      .map(dateLine)
      .filter((line) => line !== '')
      .sort()
      .join('\n'),
    startAddress: start.address || '',
    startDescription: start.description || '',
    startLat: startPoint.lat,
    startLng: startPoint.lng,
    locations: locations,
    guideIds: (source.guides || []).map((guide) => String(guide && guide._id ? guide._id : guide)),
    imageCover: source.imageCover || '',
    images: (source.images || []).slice(),
  };
}

module.exports = {
  tourToForm,
};
