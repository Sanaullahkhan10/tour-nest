// public/js/recover.js - the "forgot password" form and the "choose a new password" form.
// It uses sendJson and showMessage from api.js, which is loaded before this file.
// Everything is inside one function, so the names here never clash with the other scripts.
(function () {
  // Connects one form to the API. "makeRequest" gives { url, data, method } for the form.
  // "onGood" runs with the answer of the API when all went well.
  function connectRecoverForm(formId, makeRequest, onGood) {
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
        const request = makeRequest(form);
        const result = await sendJson(request.url, request.data, request.method);
        if (result.ok) {
          // The button stays off: the job is done (we send the email only once per click).
          onGood(result.body);
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

  // The page where the visitor gives the email.
  const forgotForm = document.getElementById('forgot-form');
  connectRecoverForm(
    'forgot-form',
    (form) => {
      return {
        url: '/api/v1/users/forgotPassword',
        data: { email: form.elements.email.value },
        method: 'POST',
      };
    },
    (body) => {
      showMessage(forgotForm, (body && body.message) || 'Check your email for the link.', true);
    }
  );

  // The page of the link in the email. The token is in the form, and goes into the address of the API.
  connectRecoverForm(
    'reset-form',
    (form) => {
      return {
        url: '/api/v1/users/resetPassword/' + encodeURIComponent(form.dataset.token),
        data: { password: form.elements.password.value, passwordConfirm: form.elements.passwordConfirm.value },
        method: 'PATCH',
      };
    },
    () => {
      // The API logged the visitor in with the new password.
      window.location.assign('/');
    }
  );
})();
