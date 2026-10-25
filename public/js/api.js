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

// Sends a form with a file (a FormData) to our API and gives back { ok, body }.
// We do not set the Content-Type ourselves: the browser must add it, with the "boundary" that cuts the form into parts.
async function sendForm(url, formData, method) {
  const reply = await fetch(url, { method: method || 'POST', body: formData });

  let body = null;
  try {
    body = await reply.json();
  } catch (error) {
    body = null;
  }
  return { ok: reply.ok, body: body };
}

// Shows a text under a form (an error, or nothing). Give true as the third value for good news (it turns green).
function showMessage(form, text, isGood) {
  const place = form.querySelector('[data-message]');
  if (place) {
    place.textContent = text;
    place.classList.toggle('form__message--good', Boolean(isGood));
  }
}
