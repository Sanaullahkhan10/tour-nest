# Tour Nest

[![Tests](https://github.com/Sanaullahkhan10/tour-nest/actions/workflows/tests.yml/badge.svg)](https://github.com/Sanaullahkhan10/tour-nest/actions/workflows/tests.yml)

A tour booking website for trips in Pakistan, built with Node.js, Express and MongoDB. Visitors look at the tours (with a map of the route, guides, photos and reviews), sign up, book a date and pay. It is a learning and portfolio project.

**Live site:** https://tour-nest.onrender.com

The live site runs on a free hosting plan. If nobody used it for a while, the first page can take up to a minute to open while the server wakes up.

## What it can do

**For visitors and customers**

- Browse the tours, see the details of each one: story, route day by day, start dates, price, guides, photo gallery and reviews.
- A map of every tour (Leaflet and OpenStreetMap).
- Search the tours by name or words in the summary, filter them by difficulty and top price, and sort the list, all on the home page.
- Sign up, log in and log out. Forgot your password? A link in an email (it works for 10 minutes, once) lets you choose a new one.
- My account: change your name, email, password and photo, or close your account.
- Write, change and delete your review of a tour (a rating from 1 to 5 and a text). Only guests with a paid booking of the tour can write one.
- Book a tour for a start date, with the number of guests. The server works out the price and checks that places are left.
- Pay with **PayFast** (the payment service of Pakistan), or with a **demo checkout** that takes no money (see "Payments" below).
- My tours: all your bookings, with the status of each. A confirmation email is sent when a booking is paid.

**For the staff** (roles: `guide`, `lead-guide`, `admin`)

- A full API to create, change and delete tours, and to upload their cover and gallery pictures.
- Statistics, a plan of the tour starts for each month, and searches by place (tours within a distance, distance to every tour).
- Admins manage users and roles, and see all the bookings.

The API is described in [docs/API.md](docs/API.md).

## Built with

| Part | What |
| --- | --- |
| Server | Node.js 22, Express 5 |
| Database | MongoDB Atlas, Mongoose 9 |
| Pages | Pug templates, plain JavaScript in the browser (no framework) |
| Login | JSON Web Token in an HttpOnly cookie, passwords hashed with bcrypt |
| Pictures | multer reads the upload, sharp makes it small and safe; pictures are saved in the database |
| Email | nodemailer (Brevo on the live site) |
| Map | Leaflet and OpenStreetMap |
| Payments | PayFast (Pakistan) and a demo checkout |
| Safety | helmet (Content Security Policy), rate limits, input checks |
| Speed | gzip compression of pages and API answers, database indexes, long caching of pictures |
| Tests | the test runner of Node (`node --test`), more than 330 tests |
| Hosting | Render (free plan), tests on every push with GitHub Actions |

## Run it on your computer

You need Node.js 22 or newer, and a free MongoDB Atlas cluster.

```bash
git clone https://github.com/Sanaullahkhan10/tour-nest.git
cd tour-nest
npm install
```

Copy `.env.example` to `.env` (`copy .env.example .env` on Windows) and fill in the values. The most important ones:

| Setting | What it is |
| --- | --- |
| `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_HOST`, `DATABASE_NAME` | Your MongoDB Atlas database |
| `JWT_SECRET` | A long random text that signs the login tokens |
| `JWT_EXPIRES_DAYS` | How many days a login lasts |
| `NODE_ENV`, `PORT` | `development` and `3000` on your computer |
| `TRUST_PROXY_HOPS` | How many proxies sit in front of the app (0 on your computer) |
| `SITE_URL` | The address of the site, for the links in emails (empty on your computer) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` | Email. Leave `EMAIL_HOST` empty on your computer and emails are written in the terminal instead of being sent |
| `PAYMENT_GATEWAY` | `demo` or `payfast` (empty: PayFast if its secrets are set, demo if not) |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_SECURED_KEY`, `PAYFAST_MERCHANT_NAME`, `PAYFAST_BASE_URL` | Your PayFast account (see "Payments") |

Then:

```bash
# Load the sample tours into the database
node --env-file-if-exists=.env dev-data/seed.js --import

# Add the sample guides and the slugs, and the tour pictures if you have them (safe to run again)
node --env-file-if-exists=.env dev-data/enrich-tours.js

# Start the site at http://localhost:3000 (it restarts when you change a file)
npm run dev
```

To make yourself an admin, sign up on the site first, then:

```bash
node --env-file-if-exists=.env dev-data/make-admin.js you@example.com
```

**Tour pictures.** Put the photos of a tour in `dev-data/images/<slug>/` with the names `cover.jpg`, `1.jpg`, `2.jpg`, `3.jpg` (`.jpeg`, `.png` and `.webp` also work), for example `dev-data/images/the-hunza-valley-explorer/cover.jpg`. Then run `enrich-tours.js` again. The pictures are saved in the database. The folder is not part of git, and this project does not include any photos.

`dev-data/recalculate-ratings.js` works out the rating numbers of every tour again from its reviews, if they ever look wrong.

## Tests

```bash
npm test
```

The tests need no database and no internet: the database, the email service and the payment service are replaced by fakes, and the pictures are made by the real `sharp`. On every push, GitHub Actions runs them (see `.github/workflows/tests.yml`).

## Payments

- **PayFast.** The customer is sent to the page of PayFast and pays there. This site never sees the card. When the customer comes back, the answer is checked with a hash (`validation_hash`) that only PayFast and the server can make, so a changed address or a made-up answer is not a payment. The code is in `utils/payfast.js`.
- **Demo checkout.** If PayFast is not set up, a pretend payment page is used. It says clearly that no money is taken. This is what the live site uses now, so the whole booking flow can be shown.

**Honest note:** the PayFast part has been tested with fakes, but not yet against a real PayFast account. The names of the fields and the hash come from the public PayFast documents, so the first real test may need a small change in `utils/payfast.js`.

Stripe is not used because it does not accept businesses registered in Pakistan.

## Safety

- Passwords are hashed (bcrypt). The login token is in an HttpOnly cookie (`SameSite=Lax`, `Secure` on the live site), so a script on a page cannot read it.
- helmet sets a strict Content Security Policy. Only the sources the site really needs are allowed (its own files, the OpenStreetMap tiles, and the PayFast address for the payment form).
- Rate limits on the API, on login and password routes, and on uploads.
- Field names like `$gt` or with dots are refused (no MongoDB operator injection). Every text field must be real text.
- Uploaded pictures are checked by their content (not their name), cut and made small, and the hidden data in them is removed. SVG files are refused.
- The "forgot password" answer is the same for every email, and the reset token is saved only as a hash.
- A booking's price is worked out by the server. The browser cannot change it.

## Folders

```
app.js, server.js     the app, and the start of the server
controllers/          what each route does
models/               the shape and the rules of the data (tour, user, review, booking, image)
routes/               which address goes to which controller
views/                the Pug pages
public/               CSS, browser scripts and the plain avatar
utils/                small helpers (errors, tokens, email, PayFast, pictures, paging ...)
dev-data/             sample tours and guides, and the scripts to load and repair data
tests/                all the tests
docs/                 the API documentation
render.yaml           how the site is set up on Render
```

## Deploying

The site is set up for Render with `render.yaml` (a free web service, the health check is `/health`). The secrets (`DATABASE_*`, `JWT_SECRET`, the email settings and the PayFast settings) are added by hand in the Render dashboard, never in git.

## About this project

I built Tour Nest to learn Node.js, Express and MongoDB. The idea and the list of features follow the *Natours* project of Jonas Schmedtmann's Node.js course. I built this version with the help of an AI assistant (Claude, by Anthropic): I ran, tested and deployed every step myself. The project goes its own way in several places:

- Sample tours, guides, prices and the PayFast payment are for Pakistan. The course uses Stripe; Stripe cannot be used here.
- Leaflet and OpenStreetMap instead of Mapbox.
- Pictures are saved in the database (the free host erases its disk at every deploy).
- Own input checks instead of the packages that are no longer kept up to date.
- Slugs, secret tours, guides, a demo checkout, the My tours page, health check, rate limits, graceful shutdown, tests and CI.

The guides in the sample data are made-up people, and their accounts cannot be logged in to. The course's own pictures and texts are not included.

## Known limits

- The free host is slow to wake up after a quiet time.
- Paying with a real PayFast account is not tested yet (see "Payments").
- A paid booking cannot be cancelled or refunded in the app.
- Emails on the live site need a mail service (Brevo) to be set up.

## License

ISC (see `package.json`).
