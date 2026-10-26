// utils/slug.js - the "slug" of a tour: its name written for an address, like "the-hunza-valley-explorer".

// Small letters and digits, with single dashes between the parts. At most 80 characters.
function looksLikeSlug(value) {
  return typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

// Turns a name into a slug: lower case, every group of other characters becomes one dash,
// and no dash at the start or the end. A name with no letters or digits gives an empty text.
function makeSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

module.exports = {
  looksLikeSlug,
  makeSlug,
};
