// public/js/account.js - the My account page: change the details, change the password, close the account.
// It uses sendJson and showMessage from api.js, which is loaded before this file.

// Switches all the buttons inside an element on or off, so nobody can click twice.
function switchAccountButtons(element, disabled) {
  const buttons = element.querySelectorAll('button');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = disabled;
  }
}

// Sends the fields of a form to the API with PATCH. "onSuccess" runs with the answer when all went well.
async function sendAccountForm(form, url, fieldNames, onSuccess) {
  switchAccountButtons(form, true);
  showMessage(form, '');

  const data = {};
  for (let i = 0; i < fieldNames.length; i++) {
    data[fieldNames[i]] = form.elements[fieldNames[i]].value;
  }

  try {
    const result = await sendJson(url, data, 'PATCH');
    if (result.ok) {
      onSuccess(result.body);
    } else {
      // Our API always sends a clear "message" with an error.
      const message = result.body && result.body.message;
      showMessage(form, message || 'Something went wrong. Please try again.');
    }
  } catch (error) {
    showMessage(form, 'Could not reach the server. Please try again.');
  }

  switchAccountButtons(form, false);
}

// The "Your details" form: name and email.
function connectDetailsForm() {
  const form = document.getElementById('details-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    return sendAccountForm(form, '/api/v1/users/updateMe', ['name', 'email'], (body) => {
      // Show what the server really saved (it may write the email in small letters).
      const saved = body.data.user;
      form.elements.name.value = saved.name;
      form.elements.email.value = saved.email;

      // The name in the header changes too.
      const headerName = document.querySelector('[data-user-name]');
      if (headerName) {
        headerName.textContent = saved.name;
      }
      showMessage(form, 'Your details were saved.', true);
    });
  });
}

// The "Change your password" form.
function connectPasswordForm() {
  const form = document.getElementById('password-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    return sendAccountForm(form, '/api/v1/users/updateMyPassword', ['passwordCurrent', 'password', 'passwordConfirm'], () => {
      // Empty the three fields, so the passwords do not stay on the screen.
      form.reset();
      showMessage(form, 'Your password was changed.', true);
    });
  });
}

// The address of the picture of a user, like photoUrl() on the server.
function photoAddress(user) {
  if (user && /^[0-9a-f]{24}$/.test(user.photo)) {
    return '/img/' + user.photo;
  }
  return '/img/default-user.svg';
}

// The "Your photo" card: upload a new picture, or go back to the plain avatar.
function connectPhotoForm() {
  const form = document.getElementById('photo-form');
  if (!form) {
    return;
  }

  // Shows the saved photo in the card and in the header.
  function showPhoto(user) {
    const places = [document.querySelector('[data-photo-preview]'), document.querySelector('[data-user-photo]')];
    for (let i = 0; i < places.length; i++) {
      if (places[i]) {
        places[i].src = photoAddress(user);
      }
    }
  }

  // Runs one request. "send" gives the answer of the API. "goodText" is shown when all went well.
  async function runPhotoRequest(send, goodText) {
    switchAccountButtons(form, true);
    showMessage(form, '');

    try {
      const result = await send();
      if (result.ok) {
        showPhoto(result.body.data.user);
        form.reset();
        showMessage(form, goodText, true);
      } else {
        const message = result.body && result.body.message;
        showMessage(form, message || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      showMessage(form, 'Could not reach the server. Please try again.');
    }

    switchAccountButtons(form, false);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const file = form.elements.photo.files && form.elements.photo.files[0];
    if (!file) {
      showMessage(form, 'Please choose a picture first.');
      return;
    }
    // The server refuses more than 5 MB too. Here the visitor learns it without waiting for the upload.
    if (file.size > 5 * 1024 * 1024) {
      showMessage(form, 'That file is too big. The limit is 5 MB.');
      return;
    }

    const data = new FormData();
    data.append('photo', file);
    return runPhotoRequest(() => sendForm('/api/v1/users/updateMyPhoto', data, 'PATCH'), 'Your photo was saved.');
  });

  const removeButton = form.querySelector('[data-remove-photo]');
  if (removeButton) {
    removeButton.addEventListener('click', () => {
      return runPhotoRequest(() => sendJson('/api/v1/users/deleteMyPhoto', null, 'DELETE'), 'Your photo was removed.');
    });
  }
}

// The "Close your account" button. It asks first.
function connectCloseAccount() {
  const box = document.getElementById('close-account');
  if (!box) {
    return;
  }

  const button = box.querySelector('button');
  button.addEventListener('click', async () => {
    if (!window.confirm('Close your account? You will be logged out and you cannot log in again.')) {
      return;
    }

    switchAccountButtons(box, true);
    showMessage(box, '');

    try {
      const result = await sendJson('/api/v1/users/deleteMe', null, 'DELETE');
      if (result.ok) {
        window.location.assign('/');
        return;
      }
      const message = result.body && result.body.message;
      showMessage(box, message || 'Something went wrong. Please try again.');
    } catch (error) {
      showMessage(box, 'Could not reach the server. Please try again.');
    }

    switchAccountButtons(box, false);
  });
}

connectDetailsForm();
connectPasswordForm();
connectPhotoForm();
connectCloseAccount();