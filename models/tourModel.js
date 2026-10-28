// models/tourModel.js - describes what a tour looks like in the database.
const mongoose = require('mongoose');
const { makeSlug } = require('../utils/slug');

// A schema is the "shape" of one tour: which fields it has and the rules for each.
// The parts of a GeoJSON "Point" that MongoDB understands. It is a function, so each schema
// gets its own copy. coordinates are [longitude, latitude]: LONGITUDE COMES FIRST.
// (Google Maps shows the latitude first, so be careful when you copy numbers from it.)
function pointFields() {
  return {
    type: {
      type: String,
      enum: { values: ['Point'], message: 'type must be Point' },
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: function (coordinates) {
          return coordinates.length === 2 && coordinates[0] >= -180 && coordinates[0] <= 180 && coordinates[1] >= -90 && coordinates[1] <= 90;
        },
        message: 'coordinates must be [longitude, latitude], longitude from -180 to 180 and latitude from -90 to 90',
      },
    },
  };
}

// The place where a tour starts.
const startLocationSchema = new mongoose.Schema(
  {
    ...pointFields(),
    address: {
      type: String,
      required: [true, 'A start location needs an address'],
      trim: true,
      maxlength: [200, 'An address can have at most 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'A description can have at most 200 characters'],
    },
  },
  { _id: false }
);

// One place that a tour visits, on a certain day of the tour.
const stopSchema = new mongoose.Schema(
  {
    ...pointFields(),
    description: {
      type: String,
      required: [true, 'A location needs a description'],
      trim: true,
      maxlength: [200, 'A description can have at most 200 characters'],
    },
    day: {
      type: Number,
      required: [true, 'A location needs a day'],
      min: [1, 'day cannot be less than 1'],
      validate: { validator: Number.isInteger, message: 'day must be a whole number' },
    },
  },
  { _id: false }
);

const tourSchema = new mongoose.Schema({
  // The tour name: text, required, no extra spaces, 5 to 60 characters, no duplicates.
  name: {
    type: String,
    required: [true, 'A tour must have a name'],
    unique: true,
    trim: true,
    minlength: [5, 'A tour name must have at least 5 characters'],
    maxlength: [60, 'A tour name must have at most 60 characters'],
  },

  // How many days the tour lasts.
  duration: {
    type: Number,
    required: [true, 'A tour must have a duration in days'],
    min: [1, 'A tour must last at least 1 day'],
  },

  // The biggest group of people the tour can take.
  maxGroupSize: {
    type: Number,
    required: [true, 'A tour must have a group size'],
    min: [1, 'A group must have at least 1 person'],
  },

  // Only these three words are allowed.
  difficulty: {
    type: String,
    required: [true, 'A tour must have a difficulty'],
    enum: {
      values: ['easy', 'medium', 'difficult'],
      message: 'Difficulty must be easy, medium or difficult',
    },
  },

  // The price per person (we will use Pakistani rupees).
  price: {
    type: Number,
    required: [true, 'A tour must have a price'],
    min: [0, 'The price cannot be negative'],
  },

  // A short text for the tour card, and an optional longer text for the tour page.
  summary: {
    type: String,
    required: [true, 'A tour must have a summary'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },

  // The average of all the ratings of the reviews of this tour, rounded to one decimal.
  // 0 means "no reviews yet". The app updates it by itself when reviews change.
  // Staff cannot set it by hand (the tour controller refuses it).
  ratingsAverage: {
    type: Number,
    default: 0,
    min: [0, 'ratingsAverage cannot be less than 0'],
    max: [5, 'ratingsAverage cannot be more than 5'],
  },

  // How many reviews this tour has. The app updates this one too.
  ratingsQuantity: {
    type: Number,
    default: 0,
    min: [0, 'ratingsQuantity cannot be less than 0'],
  },

  // The days a tour starts. One tour can start on several days.
  // Dates are sent as text like "2027-06-25" and Mongoose turns them into real dates.
  // A tour without dates has an empty list.
  startDates: {
    type: [Date],
    validate: {
      validator: function (dates) {
        return dates.length <= 30;
      },
      message: 'A tour can have at most 30 start dates',
    },
  },

  // The place where the tour starts. A tour may have no start location.
  startLocation: startLocationSchema,

  // The places the tour visits, in the order of its days. At most 20.
  locations: {
    type: [stopSchema],
    validate: {
      validator: function (stops) {
        return stops.length <= 20;
      },
      message: 'A tour can have at most 20 locations',
    },
  },

  // The name of the tour written for an address, like "the-hunza-valley-explorer".
  // The model makes it from the name (see the "save" step below). Nobody sets it by hand.
  slug: {
    type: String,
  },

  // A secret tour is hidden from visitors (see the searches below).
  secretTour: {
    type: Boolean,
    default: false,
  },

  // The guides of the tour: ids of users with the role guide or lead-guide.
  guides: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    validate: {
      validator: function (list) {
        return list.length <= 5;
      },
      message: 'A tour can have at most 5 guides',
    },
  },

  // The pictures. Each one is the id of a picture saved in the database (see models/imageModel.js).
  imageCover: {
    type: String,
  },
  images: {
    type: [String],
    validate: {
      validator: function (list) {
        return list.length <= 3;
      },
      message: 'A tour can have at most 3 gallery pictures',
    },
  },
});

// Two tours must never have the same slug. "sparse" means: tours that have no slug (the ones made
// before slugs existed) are left out of this rule.
tourSchema.index({ slug: 1 }, { unique: true, sparse: true });

// The list of tours is often filtered and sorted by price and rating. This index makes those searches fast.
tourSchema.index({ price: 1, ratingsAverage: -1 });

// Makes the slug from the name: for a new tour, when the name changes, and for a tour that has none yet.
tourSchema.pre('save', function () {
  if (this.isNew || this.isModified('name') || !this.slug) {
    const slug = makeSlug(this.name);
    if (slug) {
      this.slug = slug;
    }
  }
});

// Visitors never see secret tours: the searches that READ tours skip them.
// The ones that change or delete a tour (findByIdAndUpdate, findByIdAndDelete) are not listed on purpose,
// so the staff can still manage a secret tour.
function hideSecretTours() {
  this.where({ secretTour: { $ne: true } });
}
tourSchema.pre('find', hideSecretTours);
tourSchema.pre('findOne', hideSecretTours);
tourSchema.pre('countDocuments', hideSecretTours);

// The 2dsphere index lets MongoDB answer "which tours start near this point" quickly.
tourSchema.index({ startLocation: '2dsphere' });

// A model is made from the schema. Mongoose stores its documents in a
// collection called "tours" (the model name, lowercased and made plural).
const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
