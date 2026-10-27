// public/js/bookings.js - the booking form of the tour page, the Cancel buttons of My tours,
// the demo payment button, and the form that sends the customer to PayFast.
// It uses sendJson and showMessage from api.js, which is loaded before this file.
// Everything is inside one function, so the names here never clash with the other scripts.
(function () {
  // The booking form of the tour page: sends the choice, then goes to the payment page.
  function connectBookingForm() {
    const form = document.getElementById('booking-form');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      showMessage(form, '');

      try {
        const result = await sendJson('/api/v1/bookings', {
          tour: form.dataset.tour,
          startDate: form.elements.startDate.value,
          guests: Number(form.elements.guests.value),
          mobile: form.elements.mobile.value,
        });
        if (result.ok) {
          // Our API gives the address of the payment page.
          window.location.assign(result.body.data.payUrl);
          return;
        }
        showMessage(form, (result.body && result.body.message) || 'Something went wrong. Please try again.');
      } catch (error) {
        showMessage(form, 'Could not reach the server. Please try again.');
      }

      button.disabled = false;
    });
  }

  // The Cancel button of a waiting booking in My tours.
  function connectCancelButtons() {
    const buttons = document.querySelectorAll('[data-cancel-booking]');
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      button.addEventListener('click', async () => {
        if (!window.confirm('Cancel this booking?')) {
          return;
        }
        button.disabled = true;
        try {
          const result = await sendJson('/api/v1/bookings/' + encodeURIComponent(button.dataset.cancelBooking), null, 'DELETE');
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
  }

  // The "Pay (demo)" button: a pretend payment.
  function connectDemoPay() {
    const button = document.getElementById('demo-pay');
    if (!button) {
      return;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      showMessage(button.parentElement, '');
      try {
        const result = await sendJson('/api/v1/bookings/' + encodeURIComponent(button.dataset.booking) + '/demo-pay', null, 'POST');
        if (result.ok) {
          window.location.assign('/my-tours?payment=success');
          return;
        }
        showMessage(button.parentElement, (result.body && result.body.message) || 'Something went wrong. Please try again.');
      } catch (error) {
        showMessage(button.parentElement, 'Could not reach the server. Please try again.');
      }
      button.disabled = false;
    });
  }

  // The page that sends the customer to PayFast: the form is sent as soon as the page is ready.
  function connectPayfastForm() {
    const form = document.getElementById('payfast-form');
    if (form) {
      form.submit();
    }
  }

  connectBookingForm();
  connectCancelButtons();
  connectDemoPay();
  connectPayfastForm();
})();
