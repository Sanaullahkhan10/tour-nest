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

module.exports = {
  getAllTours,
};
