// tests/tour-helpers.test.js - the slug of a tour, finding picture files in a folder, and the new rules of the tour model.
// No database is needed.
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Tour = require('../models/tourModel');
const { makeSlug, looksLikeSlug } = require('../utils/slug');
const { findTourPictures } = require('../utils/pictureFiles');

describe('makeSlug', () => {
  it('writes a name for an address: small letters, single dashes', () => {
    assert.equal(makeSlug('The Hunza Valley Explorer'), 'the-hunza-valley-explorer');
    assert.equal(makeSlug('Fairy Meadows & Nanga Parbat View'), 'fairy-meadows-nanga-parbat-view');
    assert.equal(makeSlug('  --Hello__World!! '), 'hello-world');
    assert.equal(makeSlug('Tour 2027'), 'tour-2027');
  });

  it('gives an empty text when the name has no letters or digits', () => {
    assert.equal(makeSlug('!!!'), '');
    assert.equal(makeSlug(''), '');
    assert.equal(makeSlug(undefined), '');
    assert.equal(makeSlug(null), '');
  });

  it('cuts a very long name at 80 characters, without a dash at the end', () => {
    const slug = makeSlug('word '.repeat(40));
    assert.ok(slug.length <= 80);
    assert.ok(!slug.endsWith('-'));
    assert.ok(looksLikeSlug(slug));
  });

  it('always gives something that looksLikeSlug (or an empty text)', () => {
    const names = ['Skardu and the Shangrila Lakes', 'A/B\\C', '<script>alert(1)</script>', 'Z\u00fcrich', '../../etc/passwd'];
    for (let i = 0; i < names.length; i++) {
      const slug = makeSlug(names[i]);
      assert.ok(slug === '' || looksLikeSlug(slug), names[i] + ' -> ' + slug);
    }
  });
});

describe('looksLikeSlug', () => {
  it('accepts small letters and digits with single dashes between them', () => {
    assert.equal(looksLikeSlug('the-hunza-valley-explorer'), true);
    assert.equal(looksLikeSlug('abc'), true);
    assert.equal(looksLikeSlug('tour-2027'), true);
  });

  it('refuses everything else', () => {
    const bad = ['', 'Upper', 'a_b', '-a', 'a-', 'a--b', 'a b', 'a/b', '../x', 'a'.repeat(81), undefined, null, 5, { a: 1 }];
    for (let i = 0; i < bad.length; i++) {
      assert.equal(looksLikeSlug(bad[i]), false, String(bad[i]));
    }
  });
});

describe('findTourPictures', () => {
  const folders = [];
  function makeFolder(fileNames) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-pictures-'));
    folders.push(folder);
    for (let i = 0; i < fileNames.length; i++) {
      fs.writeFileSync(path.join(folder, fileNames[i]), 'x');
    }
    return folder;
  }
  afterEach(() => {
    while (folders.length > 0) {
      fs.rmSync(folders.pop(), { recursive: true, force: true });
    }
  });

  it('finds the cover and the numbered gallery files, in the order 1, 2, 3', () => {
    const folder = makeFolder(['3.webp', 'cover.JPG', '1.png', 'notes.md']);
    assert.deepEqual(findTourPictures(folder), { cover: 'cover.JPG', gallery: ['1.png', '3.webp'] });
  });

  it('accepts .jpeg, and ignores other names and endings', () => {
    const folder = makeFolder(['cover.jpeg', '2.jpg', '4.jpg', '2.txt', 'cover.gif', 'photo.jpg']);
    assert.deepEqual(findTourPictures(folder), { cover: 'cover.jpeg', gallery: ['2.jpg'] });
  });

  it('gives no pictures for an empty folder, a missing folder, or a path that is a file', () => {
    const empty = makeFolder([]);
    assert.deepEqual(findTourPictures(empty), { cover: null, gallery: [] });
    assert.deepEqual(findTourPictures(path.join(empty, 'missing')), { cover: null, gallery: [] });
    const folder = makeFolder(['cover.jpg']);
    assert.deepEqual(findTourPictures(path.join(folder, 'cover.jpg')), { cover: null, gallery: [] });
  });
});

describe('the new rules of the tour model', () => {
  function sampleTour() {
    const sample = JSON.parse(JSON.stringify(require('../dev-data/tours.json')[0]));
    return new Tour(sample);
  }
  const ids = ['64b7f0c2a1b2c3d4e5f6a001', '64b7f0c2a1b2c3d4e5f6a002', '64b7f0c2a1b2c3d4e5f6a003', '64b7f0c2a1b2c3d4e5f6a004', '64b7f0c2a1b2c3d4e5f6a005', '64b7f0c2a1b2c3d4e5f6a006'];

  it('a sample tour is valid, is not secret, and needs no slug, guides or pictures', () => {
    const tour = sampleTour();
    assert.equal(tour.validateSync(), undefined);
    assert.equal(tour.secretTour, false);
    assert.deepEqual(tour.guides.toObject(), []);
    assert.deepEqual(tour.images.toObject(), []);
    assert.equal(tour.slug, undefined);
    assert.equal(tour.imageCover, undefined);
  });

  it('accepts up to 5 guides and refuses 6', () => {
    const tour = sampleTour();
    tour.guides = ids.slice(0, 5);
    assert.equal(tour.validateSync(), undefined);
    tour.guides = ids;
    assert.ok(tour.validateSync().errors.guides.message.includes('at most 5 guides'));
  });

  it('accepts up to 3 gallery pictures and refuses 4', () => {
    const tour = sampleTour();
    tour.images = ['a', 'b', 'c'];
    assert.equal(tour.validateSync(), undefined);
    tour.images = ['a', 'b', 'c', 'd'];
    assert.ok(tour.validateSync().errors.images.message.includes('at most 3 gallery pictures'));
  });

  it('has a unique index on the slug that skips tours without a slug (sparse)', () => {
    const found = Tour.schema.indexes().find((entry) => entry[0].slug === 1);
    assert.ok(found, 'there should be an index on the slug');
    assert.equal(found[1].unique, true);
    assert.equal(found[1].sparse, true);
  });
});
