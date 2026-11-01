// controllers/pageController.js - the pages with fixed text: Contact, Terms, Refund policy and Privacy.
const { readBusiness } = require('../utils/business');
const { paymentMode } = require('../utils/payments');
const { cookieName } = require('../utils/token');

// Makes the function of one page. Every page gets the contact details, and the payment mode
// ("demo", "test" or "live"), so its text never says that real money is taken when it is not.
function makePage(view, title) {
  return (req, res) => {
    res.status(200).render(view, {
      title: title,
      business: readBusiness(),
      mode: paymentMode(),
      cookieName: cookieName,
    });
  };
}

module.exports = {
  getContactPage: makePage('contact', 'Contact us'),
  getTermsPage: makePage('terms', 'Terms of use'),
  getRefundPage: makePage('refund-policy', 'Refund and cancellation policy'),
  getPrivacyPage: makePage('privacy', 'Privacy policy'),
};
