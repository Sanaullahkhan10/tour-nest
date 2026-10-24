// controllers/tourController.js - the functions that handle tour requests.
const Tour = require('../models/tourModel');
const Review = require('../models/reviewModel');
const AppError = require('../utils/appError');
const { buildPaging } = require('../utils/paging');
const { readUnit, readDistance, readLatLng, distanceToRadians } = require('../utils/geo');
// The fields a visitor may filter by.
const textFields = ['difficulty'];
const numberFields = ['duration', 'maxGroupSize', 'price', 'ratingsAverage', 'ratingsQuantity'];

// The only comparison words allowed inside brackets, like price[lte]=80000.
const comparisonWords = ['gte', 'gt', 'lte', 'lt'];

// Words in the URL that are not filters (we use them in later steps).
const reservedWords = ['sort', 'fields', 'page', 'limit'];

// Turns the URL query (for example ?difficulty=easy&price[lte]=80000)
// into a filter for the database. If something is wrong it returns an error message.
function buildFilter(query) {
  const filter = {};
  const keys = Object.keys(query);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = query[key];

    // Sorting and paging words are not filters, so we skip them.
    if (reservedWords.includes(key)) {
      continue;
    }

    // Split "price[lte]" into the field name "price" and the comparison word "lte".
    let fieldName = key;
    let comparison = null;
    const bracketStart = key.indexOf('[');
    if (bracketStart !== -1) {
      if (!key.endsWith(']')) {
        return { error: `${key} is not a valid filter` };
      }
      fieldName = key.slice(0, bracketStart);
      comparison = key.slice(bracketStart + 1, key.length - 1);
    }

    // Only the allowed fields can be filtered.
    const isTextField = textFields.includes(fieldName);
    const isNumberField = numberFields.includes(fieldName);
    if (!isTextField && !isNumberField) {
      return { error: `You cannot filter by ${fieldName}` };
    }

    // The value must be one single piece of text (not a list).
    if (typeof value !== 'string') {
      return { error: `Use ${key} only once, with one value` };
    }

    // Number fields need a real number.
    let finalValue = value;
    if (isNumberField) {
      finalValue = Number(value);
      if (value.trim() === '' || Number.isNaN(finalValue)) {
        return { error: `${key} must be a number` };
      }
    }

    if (comparison === null) {
      // Exact match, like difficulty=easy.
      filter[fieldName] = finalValue;
    } else {
      // Comparison, like price[lte]=80000. Only numbers, only the allowed words.
      if (!isNumberField || !comparisonWords.includes(comparison)) {
        return { error: `You cannot use [${comparison}] with ${fieldName}` };
      }
      // MongoDB writes comparisons with a dollar sign: $lte, $gte, $lt, $gt.
      if (typeof filter[fieldName] !== 'object') {
        filter[fieldName] = {};
      }
      filter[fieldName]['$' + comparison] = finalValue;
    }
  }

  return { filter: filter };
}
// The fields a visitor may sort by.
const sortableFields = ['name', 'difficulty', 'duration', 'maxGroupSize', 'price', 'ratingsAverage', 'ratingsQuantity'];

// Turns the sort text from the URL (for example "-price,duration") into a sort order
// for the database. A minus sign in front of a name means biggest first.
// If something is wrong it returns an error message.
function buildSort(sortText) {
  const sort = {};

  // No sort in the URL means we only use the tie-breaker below.
  if (sortText !== undefined) {
    // The value must be one single piece of text (not a list).
    if (typeof sortText !== 'string') {
      return { error: 'Use sort only once' };
    }

    const parts = sortText.split(',');
    for (let i = 0; i < parts.length; i++) {
      let fieldName = parts[i];
      let direction = 1; // 1 means smallest first

      if (fieldName.startsWith('-')) {
        direction = -1; // -1 means biggest first
        fieldName = fieldName.slice(1);
      }

      if (fieldName === '') {
        return { error: 'sort has an empty name' };
      }
      if (!sortableFields.includes(fieldName)) {
        return { error: `You cannot sort by ${fieldName}` };
      }
      if (sort[fieldName] !== undefined) {
        return { error: `${fieldName} is listed twice in sort` };
      }

      sort[fieldName] = direction;
    }
  }

  // Last tie-breaker: tours with the same values always come in the same order.
  sort._id = 1;

  return { sort: sort };
}
// The fields a visitor may ask for with ?fields=name,price.
const selectableFields = [
  'name',
  'duration',
  'maxGroupSize',
  'difficulty',
  'price',
  'summary',
  'description',
  'startDates',
  'ratingsAverage',
  'ratingsQuantity',
  'startLocation',
  'locations',
];

// Turns the fields text from the URL (for example "name,price") into a list of
// fields for the database. If something is wrong it returns an error message.
function buildFields(fieldsText) {
  // No fields in the URL: send everything, but hide "__v".
  // "__v" is a counter that Mongoose adds by itself. Visitors do not need it.
  if (fieldsText === undefined) {
    return { select: { __v: 0 } };
  }

  // The value must be one single piece of text (not a list).
  if (typeof fieldsText !== 'string') {
    return { error: 'Use fields only once' };
  }

  const select = {};
  const parts = fieldsText.split(',');
  for (let i = 0; i < parts.length; i++) {
    const fieldName = parts[i];

    if (fieldName === '') {
      return { error: 'fields has an empty name' };
    }
    if (!selectableFields.includes(fieldName)) {
      return { error: `You cannot select ${fieldName}` };
    }
    if (select[fieldName] !== undefined) {
      return { error: `${fieldName} is listed twice in fields` };
    }

    // 1 means "include this field". The "_id" always comes along by itself.
    select[fieldName] = 1;
  }

  return { select: select };
}
// GET /api/v1/tours - sends back all the tours.
async function getAllTours(req, res) {
  // Each helper checks one part of the URL. If it finds a mistake, we throw an
  // AppError and the global error handler sends the answer.
  const result = buildFilter(req.query);
  if (result.error) {
    throw new AppError(result.error, 400);
  }

  const sortResult = buildSort(req.query.sort);
  if (sortResult.error) {
    throw new AppError(sortResult.error, 400);
  }

  const fieldsResult = buildFields(req.query.fields);
  if (fieldsResult.error) {
    throw new AppError(fieldsResult.error, 400);
  }

  const paging = buildPaging(req.query.page, req.query.limit);
  if (paging.error) {
    throw new AppError(paging.error, 400);
  }

  const tours = await Tour.find(result.filter)
    .sort(sortResult.sort)
    .select(fieldsResult.select)
    .skip(paging.skip)
    .limit(paging.limit);

  // How many tours match the filter in total (not only on this page).
  const total = await Tour.countDocuments(result.filter);
  const totalPages = Math.ceil(total / paging.limit);

  res.status(200).json({
    status: 'success',
    results: tours.length,
    page: paging.page,
    limit: paging.limit,
    total: total,
    totalPages: totalPages,
    data: {
      tours: tours,
    },
  });
}

// GET /api/v1/tours/:id - sends back one tour.
async function getTour(req, res) {
  // req.params.id is whatever the visitor typed in place of ":id" in the URL.
  // A badly shaped id makes Mongoose throw an error that the global handler turns into a 400.
  const tour = await Tour.findById(req.params.id);

  // The id looked fine, but no tour has this id.
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour: tour,
    },
  });
}

// These fields are worked out by the app from the reviews. Staff cannot set them by hand.
const systemFields = ['ratingsAverage', 'ratingsQuantity'];

// Refuses a body that tries to set a system field, or that uses MongoDB update words
// like "$set". Without the second rule, {"$set": {"ratingsAverage": 5}} would get around the first.
function refuseSystemFields(body) {
  // No body, or a body that is not an object, is for the model to judge.
  if (!body || typeof body !== 'object') {
    return;
  }

  const keys = Object.keys(body);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].startsWith('$')) {
      throw new AppError(`You cannot use ${keys[i]} here`, 400);
    }
    if (systemFields.includes(keys[i])) {
      throw new AppError(`You cannot set ${keys[i]} by hand. It comes from the reviews`, 400);
    }
  }
}

// POST /api/v1/tours - creates a new tour from the JSON the visitor sends.
async function createTour(req, res) {
  // req.body is the JSON the visitor sent. The model checks it before saving.
  // If a rule is broken, Mongoose throws an error and the global handler answers 400.
  refuseSystemFields(req.body);
  const newTour = await Tour.create(req.body);

  // 201 means "created".
  res.status(201).json({
    status: 'success',
    data: {
      tour: newTour,
    },
  });
}

// PATCH /api/v1/tours/:id - changes only the fields the visitor sends.
async function updateTour(req, res) {
  refuseSystemFields(req.body);
  const tour = await Tour.findByIdAndUpdate(req.params.id, req.body, {
    // Send back the tour AFTER the change (the default is the old one).
    returnDocument: 'after',
    // Check the changed fields against the rules of the model (off by default).
    runValidators: true,
  });

  // The id looked fine, but no tour has this id.
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour: tour,
    },
  });
}

// DELETE /api/v1/tours/:id - removes one tour from the database.
async function deleteTour(req, res) {
  const tour = await Tour.findByIdAndDelete(req.params.id);

  // The id looked fine, but no tour has this id.
  if (!tour) {
    throw new AppError('No tour found with that id', 404);
  }

  // The reviews of a tour that is gone have no use, so we remove them too.
  // The tour is already deleted. If this fails, we only log it instead of turning
  // a finished delete into an error.
  try {
    await Review.deleteMany({ tour: tour._id });
  } catch (error) {
    console.error('Could not delete the reviews of the deleted tour:', error.message);
  }
  // 204 means "done, and there is nothing to send back", so there is no body.
  res.status(204).send();
}

// GET /api/v1/tours/tour-stats - numbers about the tours, one line for each difficulty.
async function getTourStats(req, res) {
  const stats = await Tour.aggregate([
    // 1. Put the tours in groups by difficulty and work out the numbers of each group.
    {
      $group: {
        _id: '$difficulty',
        numTours: { $sum: 1 },
        numRatings: { $sum: '$ratingsQuantity' },
        // Only tours with at least one review count in the average rating. A tour without
        // reviews has 0, and that would pull the average down unfairly. $avg skips null.
        avgRating: { $avg: { $cond: [{ $gt: ['$ratingsQuantity', 0] }, '$ratingsAverage', null] } },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
      },
    },
    // 2. Give _id its real name, and round the averages (rating to 1 decimal, price to a whole number).
    {
      $project: {
        _id: 0,
        difficulty: '$_id',
        numTours: 1,
        numRatings: 1,
        avgRating: { $round: ['$avgRating', 1] },
        avgPrice: { $round: ['$avgPrice', 0] },
        minPrice: 1,
        maxPrice: 1,
      },
    },
    // 3. The group with the cheapest tours comes first.
    { $sort: { avgPrice: 1, difficulty: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    results: stats.length,
    data: {
      stats: stats,
    },
  });
}

// GET /api/v1/tours/monthly-plan/:year - for one year: in which months tours start, and which tours.
async function getMonthlyPlan(req, res) {
  // The year comes from the URL as text. We accept only 4 digits that do not start with 0 (1000 to 9999).
  if (!/^[1-9]\d{3}$/.test(req.params.year)) {
    throw new AppError('year must be 4 digits, like 2027', 400);
  }
  const year = Number(req.params.year);

  // The first moment of this year and of the next year (in UTC, like the saved dates).
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

  const plan = await Tour.aggregate([
    // 1. A tour with 3 start dates becomes 3 lines, one date on each line.
    { $unwind: '$startDates' },

    // 2. Keep only the dates of this year.
    { $match: { startDates: { $gte: yearStart, $lt: nextYearStart } } },

    // 3. Group the lines by month: count the starts, and collect the tour names (each name once).
    {
      $group: {
        _id: { $month: '$startDates' },
        numTourStarts: { $sum: 1 },
        tours: { $addToSet: '$name' },
      },
    },

    // 4. Give _id its real name, and put the tour names in A to Z order.
    {
      $project: {
        _id: 0,
        month: '$_id',
        numTourStarts: 1,
        tours: { $sortArray: { input: '$tours', sortBy: 1 } },
      },
    },

    // 5. January first.
    { $sort: { month: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    results: plan.length,
    data: {
      year: year,
      plan: plan,
    },
  });
}

// GET /api/v1/tours/tours-within/:distance/center/:latlng/unit/:unit
// Finds the tours that START within a distance of a place, for example
// /api/v1/tours/tours-within/200/center/36.3269,74.6614/unit/km
async function getToursWithin(req, res) {
  // 1. Check the three parts of the URL.
  const distanceResult = readDistance(req.params.distance);
  if (distanceResult.error) {
    throw new AppError(distanceResult.error, 400);
  }

  const placeResult = readLatLng(req.params.latlng);
  if (placeResult.error) {
    throw new AppError(placeResult.error, 400);
  }

  const unitResult = readUnit(req.params.unit);
  if (unitResult.error) {
    throw new AppError(unitResult.error, 400);
  }

  // 2. Only page and limit are understood after the question mark.
  const keys = Object.keys(req.query);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== 'page' && keys[i] !== 'limit') {
      throw new AppError(`You cannot use ${keys[i]} here`, 400);
    }
  }

  const paging = buildPaging(req.query.page, req.query.limit);
  if (paging.error) {
    throw new AppError(paging.error, 400);
  }

  // 3. "Inside a circle on the earth". The URL has latitude first, but MongoDB wants
  // longitude first, so we swap them here.
  const radius = distanceToRadians(distanceResult.distance, unitResult.unit);
  const filter = {
    startLocation: {
      $geoWithin: {
        $centerSphere: [[placeResult.longitude, placeResult.latitude], radius],
      },
    },
  };

  const tours = await Tour.find(filter)
    .sort({ _id: 1 })
    .select({ __v: 0 })
    .skip(paging.skip)
    .limit(paging.limit);

  // How many tours are inside the circle in total (not only on this page).
  const total = await Tour.countDocuments(filter);
  const totalPages = Math.ceil(total / paging.limit);

  res.status(200).json({
    status: 'success',
    results: tours.length,
    page: paging.page,
    limit: paging.limit,
    total: total,
    totalPages: totalPages,
    data: {
      tours: tours,
    },
  });
}

module.exports = {
  getAllTours,
  getTourStats,
  getMonthlyPlan,
  getToursWithin,
  getTour,
  createTour,
  updateTour,
  deleteTour,
};
