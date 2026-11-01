// utils/business.js - the contact details of the business, for the Contact page.
// They come from settings (not from the code), so you can change them on Render without a new deploy:
// BUSINESS_NAME, BUSINESS_ADDRESS, BUSINESS_PHONE and BUSINESS_EMAIL. Anything that is empty or looks wrong is left out.

// Removes line breaks and other control characters, and cuts the text to "max" characters.
function clean(value, max) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function readBusiness() {
  const name = clean(process.env.BUSINESS_NAME, 80) || 'Tour Nest';
  const address = clean(process.env.BUSINESS_ADDRESS, 200);

  // A phone number: digits, spaces, +, - and brackets only.
  let phone = clean(process.env.BUSINESS_PHONE, 30);
  if (!/^[\d\s+()-]{7,30}$/.test(phone)) {
    phone = '';
  }

  let email = clean(process.env.BUSINESS_EMAIL, 100);
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) {
    email = '';
  }

  return {
    name: name,
    address: address,
    phone: phone,
    // For a tel: link: digits and a leading plus only.
    phoneLink: phone.replace(/[^\d+]/g, ''),
    email: email,
    hasDetails: Boolean(address || phone || email),
  };
}

module.exports = {
  readBusiness,
};
