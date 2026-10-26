// dev-data/enrich-tours.js - adds the missing parts to the tours that are already in the database:
//   1. the sample guides (made-up people, with accounts that nobody can log in to),
//   2. the slug of every tour that has none,
//   3. the guides of each tour (only for tours that have no guides yet),
//   4. the cover and gallery pictures, from the folder dev-data/images/<slug>/ (see below).
// It only adds. It never deletes a tour or a user. You can run it again and again.
//
// How to run (from the project folder):
//   node --env-file-if-exists=.env dev-data/enrich-tours.js
//   node --env-file=.env.live dev-data/enrich-tours.js            (the live database)
// To replace pictures that are already saved, add --replace-images at the end.
//
// The pictures: put them in dev-data/images/<slug>/ with the names cover.jpg, 1.jpg, 2.jpg and 3.jpg
// (.jpeg, .png and .webp are fine too). For example: dev-data/images/the-hunza-valley-explorer/cover.jpg
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const connectToDatabase = require('../utils/database');
const Tour = require('../models/tourModel');
const User = require('../models/userModel');
const Image = require('../models/imageModel');
const { makePicture, coverSize, gallerySize } = require('../utils/imageProcessing');
const { findTourPictures } = require('../utils/pictureFiles');
const { makeSlug } = require('../utils/slug');
const { looksLikeImageId } = require('../utils/photoUrl');

// Makes the guides that do not exist yet. Gives back an object: email -> id of the user.
async function addGuides(guides, log) {
  const idByEmail = {};
  for (let i = 0; i < guides.length; i++) {
    const guide = guides[i];
    let user = await User.findOne({ email: guide.email });
    if (!user) {
      // A long random password that nobody knows. These accounts are for the tour pages only.
      const password = crypto.randomBytes(24).toString('hex');
      user = await User.create({ name: guide.name, email: guide.email, role: guide.role, password: password, passwordConfirm: password });
      log('guide added: ' + guide.name);
    }
    idByEmail[guide.email] = user._id;
  }
  return idByEmail;
}

// Saves one picture file as an image in the database and gives back its id.
async function saveFile(filePath, size) {
  const picture = await makePicture(fs.readFileSync(filePath), size.width, size.height);
  const image = await Image.create({ data: picture.data, contentType: picture.contentType });
  return String(image._id);
}

async function removeImages(ids) {
  for (let i = 0; i < ids.length; i++) {
    if (looksLikeImageId(ids[i])) {
      await Image.deleteOne({ _id: ids[i] });
    }
  }
}

// Does all the work. "options": { plan, imageFolder, replaceImages, log }.
async function enrichTours(options) {
  const log = options.log || console.log;
  const idByEmail = await addGuides(options.plan.guides, log);

  const tours = await Tour.find();
  for (let i = 0; i < tours.length; i++) {
    const tour = tours[i];
    const notes = [];

    // The guides: only when the tour has none, so the choices of the staff stay.
    const emails = options.plan.assignments[tour.name] || [];
    if (tour.guides.length === 0 && emails.length > 0) {
      tour.guides = emails.map((email) => idByEmail[email]).filter((id) => id !== undefined);
      notes.push('guides');
    }

    // The pictures.
    const slug = tour.slug || makeSlug(tour.name);
    const found = findTourPictures(path.join(options.imageFolder, slug));
    const replaced = [];
    if (found.cover && (options.replaceImages || !tour.imageCover)) {
      replaced.push(tour.imageCover);
      tour.imageCover = await saveFile(path.join(options.imageFolder, slug, found.cover), coverSize);
      notes.push('cover picture');
    }
    if (found.gallery.length > 0 && (options.replaceImages || tour.images.length === 0)) {
      replaced.push(...tour.images);
      const ids = [];
      for (let j = 0; j < found.gallery.length; j++) {
        ids.push(await saveFile(path.join(options.imageFolder, slug, found.gallery[j]), gallerySize));
      }
      tour.images = ids;
      notes.push(ids.length + ' gallery pictures');
    }

    // save() also makes the slug of a tour that has none (the model does that by itself).
    if (!tour.slug) {
      notes.push('slug');
    }
    if (notes.length > 0) {
      await tour.save();
      await removeImages(replaced);
      log(tour.name + ': added ' + notes.join(', '));
    } else {
      log(tour.name + ': nothing to add');
    }
  }
}

async function runFromCommandLine() {
  try {
    await connectToDatabase();
    console.log('Database: ' + mongoose.connection.name);
    const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'guides.json'), 'utf8'));
    await enrichTours({
      plan: plan,
      imageFolder: path.join(__dirname, 'images'),
      replaceImages: process.argv.includes('--replace-images'),
    });
  } catch (error) {
    console.error('Enrich failed:', error.message);
    process.exitCode = 1;
  }
  await mongoose.disconnect();
}

// Run from the command line: do the work. Required from a test: only give the function.
if (require.main === module) {
  runFromCommandLine();
}

module.exports = {
  enrichTours,
};
