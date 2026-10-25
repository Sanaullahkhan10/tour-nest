// public/js/map.js - draws the map of a tour with Leaflet and OpenStreetMap.
// The page has a box with the id "tour-map". Its data-points holds the places as JSON.
(function () {
  const box = document.getElementById('tour-map');
  // No box, or Leaflet did not load: there is nothing to draw, and the page works without a map.
  if (!box || typeof L === 'undefined') {
    return;
  }

  let points = [];
  try {
    points = JSON.parse(box.dataset.points);
  } catch (error) {
    points = [];
  }
  if (!Array.isArray(points)) {
    return;
  }

  // Keep only the points that have real numbers.
  const good = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      good.push(point);
    }
  }
  if (good.length === 0) {
    return;
  }

  // The mouse wheel keeps scrolling the page. The visitor zooms with the buttons or by double click.
  const map = L.map(box, { scrollWheelZoom: false });

  // The pictures of the map come from OpenStreetMap. The note about the mapmakers must stay visible.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const places = [];
  for (let i = 0; i < good.length; i++) {
    const point = good[i];
    const place = [point.lat, point.lng];
    places.push(place);

    const isStart = point.kind === 'start';
    const marker = L.circleMarker(place, {
      radius: isStart ? 10 : 8,
      color: '#ffffff',
      weight: 2,
      fillColor: isStart ? '#1f6f54' : '#1565c0',
      fillOpacity: 1,
    });

    // The text of the popup is built piece by piece with textContent, never as HTML,
    // so text that comes from the database can never run as a script.
    const popup = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = String(point.title || '');
    popup.appendChild(title);
    if (point.text) {
      const text = document.createElement('p');
      text.textContent = String(point.text);
      popup.appendChild(text);
    }
    marker.bindPopup(popup);
    marker.addTo(map);
  }

  if (places.length > 1) {
    // A dashed line from the start through the days, and the map zooms to show all of it.
    L.polyline(places, { color: '#1565c0', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(map);
    map.fitBounds(places, { padding: [40, 40], maxZoom: 12 });
  } else {
    map.setView(places[0], 10);
  }
})();
