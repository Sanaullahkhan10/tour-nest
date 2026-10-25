// controllers/viewController.js - the functions that build the web pages (HTML) of the site.
const Tour = require('../models/tourModel');

// GET / - the overview page: a card for every tour.
async function getOverview(req, res) {
  // lean() gives plain objects, which is all a page needs. We take only the fields the cards show.
  // The limit is a safety net. Paging for the website comes later.
  const tours = await Tour.find()
    .sort({ name: 1, _id: 1 })
    .select('name duration maxGroupSize difficulty price summary ratingsAverage ratingsQuantity startDates')
    .limit(100)
    .lean();

  res.status(200).render('overview', {
    title: 'All tours',
    tours: tours,
  });
}

module.exports = {
  getOverview,
};
