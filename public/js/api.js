// public/js/api.js - two small helpers that the other scripts of the site share.
// It is loaded before them, so they can call these functions.

// Sends JSON to our API and gives back { ok, body }.
// "data" is optional (the logout and delete buttons send nothing).
// "method" is POST, unless you say PATCH or DELETE.
async function sendJson(url, data, method) {
  const settings = {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) {
    settings.body = JSON.stringify(data);
  }

  const reply = await fetch(url, settings);

  // An answer that is not JSON (for example "204 No Content") gives null.
  let body = null;
  try {
    body = await reply.json();
  } catch (error) {
    body = null;
  }
  return { ok: reply.ok, body: body };
}

// Shows a text under a form (an error, or nothing).
function showMessage(form, text) {
  const place = form.querySelector('[data-message]');
  if (place) {
    place.textContent = text;
  }
}
