// utils/photoUrl.js - from the "photo" of a user to the address of the picture.

// A saved picture has the id that MongoDB gave it: exactly 24 characters, 0-9 and a-f.
function looksLikeImageId(value) {
  return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
}

// A user who has not chosen a photo ("default.jpg" in the database) gets the plain avatar.
function photoUrl(user) {
  if (user && looksLikeImageId(user.photo)) {
    return '/img/' + user.photo;
  }
  return '/img/default-user.svg';
}

module.exports = {
  looksLikeImageId,
  photoUrl,
};
