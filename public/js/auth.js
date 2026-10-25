// public/js/auth.js - makes the login form, the signup form and the logout button work.
// It talks to our own API with fetch. The browser keeps the login cookie by itself.

// sendJson and showMessage (the helpers every script shares) are in api.js, which is loaded before this file.

// Reads the fields with these names from the form into one object.
function readFields(form, names) {
  const data = {};
  for (let i = 0; i < names.length; i++) {
    data[names[i]] = form.elements[names[i]].value;
  }
  return data;
}

// Connects one form to one API address. On success we go to the home page.
function connectForm(formId, url, fieldNames) {
  const form = document.getElementById(formId);
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    // Stop the browser from sending the form by itself.
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage(form, '');

    try {
      const result = await sendJson(url, readFields(form, fieldNames));
      if (result.ok) {
        window.location.assign('/');
        return;
      }
      // Our API always sends a clear "message" with an error.
      const message = result.body && result.body.message;
      showMessage(form, message || 'Something went wrong. Please try again.');
    } catch (error) {
      showMessage(form, 'Could not reach the server. Please try again.');
    }

    button.disabled = false;
  });
}

// The logout button in the header: ask the API to remove the cookie, then reload the home page.
function connectLogout() {
  const buttons = document.querySelectorAll('[data-logout]');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', async () => {
      buttons[i].disabled = true;
      try {
        await sendJson('/api/v1/users/logout');
      } catch (error) {
        // If we cannot reach the server, the reload below shows the real state.
      }
      window.location.assign('/');
    });
  }
}

connectForm('login-form', '/api/v1/users/login', ['email', 'password']);
connectForm('signup-form', '/api/v1/users/signup', ['name', 'email', 'password', 'passwordConfirm']);
connectLogout();
