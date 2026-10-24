// controllers/tourController.js - the functions that handle tour requests.
const Tour = require('../models/tourModel');

// Turns a Mongoose ValidationError into one readable sentence.
// It collects the message of every broken rule of the model.
function joinValidationMessages(error) {
  const messages = [];
  const fieldNames = Object.keys(error.errors);
  for (let i = 0; i < fieldNames.length; i++) {
    messages.push(error.errors[fieldNames[i]].message);
  }
  return messages.join('. ');
}

// The fields a visitor may filter by.
const textFields = ['difficulty'];
const numberFields = ['duration', 'maxGroupSize', 'price'];

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
const sortableFields = ['name', 'difficulty', 'duration', 'maxGroupSize', 'price'];

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
// How many tours one page holds when the visitor does not say, and the biggest allowed.
const defaultLimit = 10;
const maxLimit = 50;
// The biggest page number we accept.
const maxPage = 100000;

// Turns the page and limit from the URL (for example "2" and "3") into numbers
// for the database. If something is wrong it returns an error message.
function buildPaging(pageText, limitText) {
  let page = 1;
  let limit = defaultLimit;

  if (pageText !== undefined) {
    // The value must be one single piece of text (not a list).
    if (typeof pageText !== 'string') {
      return { error: 'Use page only once' };
    }
    page = Number(pageText);
    if (pageText.trim() === '' || !Number.isInteger(page) || page < 1 || page > maxPage) {
      return { error: `page must be a whole number from 1 to ${maxPage}` };
    }
  }

  if (limitText !== undefined) {
    if (typeof limitText !== 'string') {
      return { error: 'Use limit only once' };
    }
    limit = Number(limitText);
    if (limitText.trim() === '' || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      return { error: `limit must be a whole number from 1 to ${maxLimit}` };
    }
  }

  // How many tours to jump over before we start collecting.
  const skip = (page - 1) * limit;

  return { page: page, limit: limit, skip: skip };
}
// GET /api/v1/tours - sends back all the tours.
async function getAllTours(req, res) {
  try {
    const result = buildFilter(req.query);
    if (result.error) {
      return res.status(400).json({
        status: 'fail',
        message: result.error,
      });
    }

    const sortResult = buildSort(req.query.sort);
    if (sortResult.error) {
      return res.status(400).json({
        status: 'fail',
        message: sortResult.error,
      });
    }

    const fieldsResult = buildFields(req.query.fields);
    if (fieldsResult.error) {
      return res.status(400).json({
        status: 'fail',
        message: fieldsResult.error,
      });
    }

    const paging = buildPaging(req.query.page, req.query.limit);
    if (paging.error) {
      return res.status(400).json({
        status: 'fail',
        message: paging.error,
      });
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

// POST /api/v1/tours - creates a new tour from the JSON the visitor sends.
async function createTour(req, res) {
  try {
    // req.body is the JSON the visitor sent. The model checks it before saving.
    // Fields that are not in the model are ignored by Mongoose.
    const newTour = await Tour.create(req.body);

    // 201 means "created".
    res.status(201).json({
      status: 'success',
      data: {
        tour: newTour,
      },
    });
  } catch (error) {
    // The data broke one or more rules of the model (too short, missing, wrong word...).
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 'fail',
        message: joinValidationMessages(error),
      });
    }

    // Error code 11000 means the database refused a duplicate (the tour name is unique).
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'A tour with this name already exists',
      });
    }

    console.error('createTour failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while creating the tour',
    });
  }
}

// PATCH /api/v1/tours/:id - changes only the fields the visitor sends.
async function updateTour(req, res) {
  try {
    const tour = await Tour.findByIdAndUpdate(req.params.id, req.body, {
      // Send back the tour AFTER the change (the default is the old one).
      returnDocument: 'after',
      // Check the changed fields against the rules of the model (off by default).
      runValidators: true,
    });

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
    // A CastError means a value had the wrong shape. Either the id or one of the fields.
    if (error.name === 'CastError') {
      if (error.path === '_id') {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid tour id',
        });
      }
      return res.status(400).json({
        status: 'fail',
        message: `Invalid value for ${error.path}`,
      });
    }

    // A changed field broke a rule of the model.
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 'fail',
        message: joinValidationMessages(error),
      });
    }

    // The new name is already used by another tour.
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'A tour with this name already exists',
      });
    }

    console.error('updateTour failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while updating the tour',
    });
  }
}

// DELETE /api/v1/tours/:id - removes one tour from the database.
async function deleteTour(req, res) {
  try {
    const tour = await Tour.findByIdAndDelete(req.params.id);

    // The id looked fine, but no tour has this id.
    if (!tour) {
      return res.status(404).json({
        status: 'fail',
        message: 'No tour found with that id',
      });
    }

    // 204 means "done, and there is nothing to send back", so there is no body.
    res.status(204).send();
  } catch (error) {
    // The id is not shaped like a real id (like "abc").
    if (error.name === 'CastError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid tour id',
      });
    }

    console.error('deleteTour failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while deleting the tour',
    });
  }
}
module.exports = {
  getAllTours,
  getTour,
  createTour,
  updateTour,
  deleteTour,
};





