// public/js/reviews.js - the review form on the page of a tour: write, change or delete your review.
// It uses sendJson and showMessage from api.js.

// Switches all the buttons of the form on or off, so nobody can click twice.
function setDisabled(buttons, disabled) {
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = disabled;
  }
}

function connectReviewForm() {
  const form = document.getElementById('review-form');
  if (!form) {
    return;
  }
  const buttons = form.querySelectorAll('button');

  // Save: a new review (data-mode="create") or a change of your own review (data-mode="update").
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setDisabled(buttons, true);
    showMessage(form, '');

    // The API wants the rating as a number, not as text.
    const data = {
      rating: Number(form.elements.rating.value),
      review: form.elements.review.value,
    };

    let url = '/api/v1/tours/' + form.dataset.tour + '/reviews';
    let method = 'POST';
    if (form.dataset.mode === 'update') {
      url = '/api/v1/reviews/' + form.dataset.review;
      method = 'PATCH';
    }

    try {
      const result = await sendJson(url, data, method);
      if (result.ok) {
        // Load the page again, so the new review and the new average rating show up.
        window.location.reload();
        return;
      }
      const message = result.body && result.body.message;
      showMessage(form, message || 'Something went wrong. Please try again.');
    } catch (error) {
      showMessage(form, 'Could not reach the server. Please try again.');
    }

    setDisabled(buttons, false);
  });

  // Delete: only on the form of a review that already exists.
  const deleteButton = document.getElementById('review-delete');
  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Delete your review? This cannot be undone.')) {
        return;
      }
      setDisabled(buttons, true);
      showMessage(form, '');

      try {
        const result = await sendJson('/api/v1/reviews/' + form.dataset.review, null, 'DELETE');
        if (result.ok) {
          window.location.reload();
          return;
        }
        const message = result.body && result.body.message;
        showMessage(form, message || 'Something went wrong. Please try again.');
      } catch (error) {
        showMessage(form, 'Could not reach the server. Please try again.');
      }

      setDisabled(buttons, false);
    });
  }
}

connectReviewForm();
