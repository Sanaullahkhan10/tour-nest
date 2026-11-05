// public/js/admin-tours.js - the admin pages of the tours: the Hide, Show and Delete buttons of the list,
// and the tour form (it reads the fields, sends the tour to the API, then sends the pictures).
// It uses sendJson, sendForm and showMessage from api.js, which is loaded before this file.
(function () {
  const maxPictureBytes = 5 * 1024 * 1024;

  // ---------- the list: Hide, Show and Delete ----------
  function connectListButtons() {
    const toggles = document.querySelectorAll('[data-toggle-hidden]');
    for (let i = 0; i < toggles.length; i++) {
      const button = toggles[i];
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          // "data-hidden" says what the tour is now. We send the opposite.
          const hide = button.dataset.hidden !== 'true';
          const result = await sendJson('/api/v1/tours/' + encodeURIComponent(button.dataset.toggleHidden), { secretTour: hide }, 'PATCH');
          if (result.ok) {
            window.location.reload();
            return;
          }
          window.alert((result.body && result.body.message) || 'Something went wrong. Please try again.');
        } catch (error) {
          window.alert('Could not reach the server. Please try again.');
        }
        button.disabled = false;
      });
    }

    const deletes = document.querySelectorAll('[data-delete-tour]');
    for (let i = 0; i < deletes.length; i++) {
      const button = deletes[i];
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete "' + (button.dataset.name || 'this tour') + '"? This cannot be undone.')) {
          return;
        }
        button.disabled = true;
        try {
          const result = await sendJson('/api/v1/tours/' + encodeURIComponent(button.dataset.deleteTour), null, 'DELETE');
          if (result.ok) {
            window.location.assign('/admin/tours');
            return;
          }
          window.alert((result.body && result.body.message) || 'Something went wrong. Please try again.');
        } catch (error) {
          window.alert('Could not reach the server. Please try again.');
        }
        button.disabled = false;
      });
    }
  }

  // ---------- the form: reading the fields ----------
  // A number from a text field. An empty field gives undefined (the API then says what is missing).
  function readNumber(text) {
    const value = String(text).trim();
    return value === '' ? undefined : Number(value);
  }

  // Makes a [longitude, latitude] pair from two texts, or says what is wrong.
  function readPoint(latText, lngText) {
    const lat = Number(String(latText).trim());
    const lng = Number(String(lngText).trim());
    if (String(latText).trim() === '' || String(lngText).trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return null;
    }
    // The database wants longitude first.
    return [lng, lat];
  }

  // Reads the whole form. Gives { body } with the tour for the API, or { error } with a message for the admin.
  function readTourForm(form) {
    const el = form.elements;
    const body = {
      name: el.name.value.trim(),
      summary: el.summary.value.trim(),
      description: el.description.value.trim(),
      difficulty: el.difficulty.value,
      secretTour: Boolean(el.secretTour.checked),
    };
    const duration = readNumber(el.duration.value);
    const maxGroupSize = readNumber(el.maxGroupSize.value);
    const price = readNumber(el.price.value);
    if (duration !== undefined) body.duration = duration;
    if (maxGroupSize !== undefined) body.maxGroupSize = maxGroupSize;
    if (price !== undefined) body.price = price;

    // The start dates: one on each line, like 2027-04-15.
    const lines = el.startDates.value.split(/\r?\n/);
    body.startDates = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line) || Number.isNaN(new Date(line).getTime())) {
        return { error: 'Start dates must look like 2027-04-15, one on each line. This one does not: ' + line };
      }
      body.startDates.push(line);
    }

    // The start location. If the admin filled any part of it, the address and both numbers are needed.
    const startAddress = el.startAddress.value.trim();
    const startDescription = el.startDescription.value.trim();
    if (startAddress !== '' || el.startLat.value.trim() !== '' || el.startLng.value.trim() !== '') {
      const point = readPoint(el.startLat.value, el.startLng.value);
      if (!point) {
        return { error: 'The start location needs a latitude (-90 to 90) and a longitude (-180 to 180), both as numbers.' };
      }
      body.startLocation = { type: 'Point', coordinates: point, address: startAddress };
      if (startDescription !== '') {
        body.startLocation.description = startDescription;
      }
    }

    // The stops. A row that is completely empty is skipped.
    body.locations = [];
    const rows = form.querySelectorAll('[data-stop]');
    for (let i = 0; i < rows.length; i++) {
      const field = (name) => rows[i].querySelector('[data-field="' + name + '"]').value;
      const day = field('day').trim();
      const description = field('description').trim();
      if (day === '' && description === '' && field('lat').trim() === '' && field('lng').trim() === '') {
        continue;
      }
      const number = body.locations.length + 1;
      const dayNumber = Number(day);
      if (day === '' || !Number.isInteger(dayNumber) || dayNumber < 1) {
        return { error: 'Stop ' + number + ': the day must be a whole number, 1 or more.' };
      }
      if (description === '') {
        return { error: 'Stop ' + number + ': please write the place and what happens there.' };
      }
      const point = readPoint(field('lat'), field('lng'));
      if (!point) {
        return { error: 'Stop ' + number + ': it needs a latitude (-90 to 90) and a longitude (-180 to 180), both as numbers.' };
      }
      body.locations.push({ type: 'Point', coordinates: point, description: description, day: dayNumber });
    }

    // The guides that are ticked.
    body.guides = [];
    const boxes = form.querySelectorAll('input[name="guides"]');
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) {
        body.guides.push(boxes[i].value);
      }
    }
    return { body: body };
  }

  // The chosen picture files, checked before they are sent. Gives { cover, gallery } or { error }.
  function readPictures(form) {
    const cover = form.elements.imageCover.files && form.elements.imageCover.files[0] ? form.elements.imageCover.files[0] : null;
    const gallery = Array.prototype.slice.call(form.elements.images.files || []);
    if (gallery.length > 3) {
      return { error: 'Please choose at most 3 gallery pictures.' };
    }
    const all = (cover ? [cover] : []).concat(gallery);
    for (let i = 0; i < all.length; i++) {
      if (all[i].size > maxPictureBytes) {
        return { error: 'The picture "' + all[i].name + '" is too big. The limit is 5 MB for each picture.' };
      }
    }
    return { cover: cover, gallery: gallery };
  }

  // ---------- the form: the stops ----------
  function connectStops(form) {
    const container = document.getElementById('stops');
    const template = document.getElementById('stop-template');
    const addButton = form.querySelector('[data-add-stop]');
    if (!container || !template || !addButton) {
      return;
    }

    addButton.addEventListener('click', () => {
      if (container.querySelectorAll('[data-stop]').length >= 20) {
        showMessage(form, 'A tour can have at most 20 stops.');
        return;
      }
      container.appendChild(template.content.firstElementChild.cloneNode(true));
    });

    // One listener for all the Remove buttons, also for the stops that are added later.
    container.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('[data-remove-stop]') : null;
      if (button) {
        button.closest('[data-stop]').remove();
      }
    });
  }

  // ---------- the form: saving ----------
  function connectTourForm() {
    const form = document.getElementById('tour-form');
    if (!form) {
      return;
    }
    connectStops(form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const read = readTourForm(form);
      if (read.error) {
        showMessage(form, read.error);
        return;
      }
      const pictures = readPictures(form);
      if (pictures.error) {
        showMessage(form, pictures.error);
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      showMessage(form, '');

      try {
        // Step 1: the tour itself. A tour that exists has its id in the form, and is changed. Otherwise it is made.
        const isNew = !form.dataset.tourId;
        const saved = isNew
          ? await sendJson('/api/v1/tours', read.body, 'POST')
          : await sendJson('/api/v1/tours/' + encodeURIComponent(form.dataset.tourId), read.body, 'PATCH');
        if (!saved.ok) {
          showMessage(form, (saved.body && saved.body.message) || 'Something went wrong. Please try again.');
          button.disabled = false;
          return;
        }
        // From now on this form changes the tour (it does not make a second one).
        form.dataset.tourId = saved.body.data.tour._id;

        // Step 2: the pictures, if any were chosen.
        if (pictures.cover || pictures.gallery.length > 0) {
          const data = new FormData();
          if (pictures.cover) {
            data.append('imageCover', pictures.cover);
          }
          for (let i = 0; i < pictures.gallery.length; i++) {
            data.append('images', pictures.gallery[i]);
          }
          const uploaded = await sendForm('/api/v1/tours/' + encodeURIComponent(form.dataset.tourId) + '/images', data, 'PATCH');
          if (!uploaded.ok) {
            showMessage(form, 'The tour was saved, but the pictures were not: ' + ((uploaded.body && uploaded.body.message) || 'please try again.'));
            button.disabled = false;
            return;
          }
        }

        window.location.assign('/admin/tours');
      } catch (error) {
        showMessage(form, 'Could not reach the server. Please try again.');
        button.disabled = false;
      }
    });
  }

  // For the tests: the pure parts can be reached from outside the page.
  window.tourFormTools = { readTourForm: readTourForm, readPictures: readPictures };

  connectListButtons();
  connectTourForm();
})();
