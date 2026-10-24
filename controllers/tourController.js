// controllers/tourController.js - the functions that handle tour requests.
const Tour = require('../models/tourModel');

// GET /api/v1/tours - sends back all the tours.
async function getAllTours(req, res) {
  try {
    const tours = await Tour.find();

    res.status(200).json({
      status: 'success',
      results: tours.length,
      data: {
        tours: tours,
      },
    });
  } catch (error) {
    // The real error goes to our terminal. The visitor only gets a short message.
    console.error('getAllTours failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while loading the tours',
    });
  }
}

// GET /api/v1/tours/:id - sends back one tour.
async function getTour(req, res) {
  try {
    // req.params.id is whatever the visitor typed in place of ":id" in the URL.
    const tour = await Tour.findById(req.params.id);

    // The id looked fine, but no tour has this id.
    if (!tour) {
      return res.status(404).json({
        status: 'fail',
        message: 'No tour found with that id',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        tour: tour,
      },
    });
  } catch (error) {
    // Mongoose throws a CastError when the id is not shaped like a real id (like "abc").
    // That is the visitor's mistake, so we answer 400 and not 500.
    if (error.name === 'CastError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid tour id',
      });
    }

    console.error('getTour failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while loading the tour',
    });
  }
}

module.exports = {
  getAllTours,
  getTour,
};
