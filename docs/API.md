# Tour Nest API

The API of Tour Nest. Every address below starts with the base address:

- Live: `https://tour-nest.onrender.com`
- On your computer: `http://localhost:3000`

The live site runs on a free plan. If nobody used it for a while, the first request can take up to a minute while the server wakes up.

## The basics

**Login.** `signup`, `login` and `resetPassword` send a login token in an HttpOnly cookie called `jwt`. The browser sends it back by itself. The token is never in the body of the answer, and a script on a page cannot read it. Tools like curl need a cookie file (`-c cookies.txt` to save it, `-b cookies.txt` to send it). A token in an `Authorization` header is not used.

**Roles.** Every user has one role: `user`, `guide`, `lead-guide` or `admin`. A new user is always `user`. Only an admin changes a role.

**Requests.** Bodies are JSON (`Content-Type: application/json`), 10 kb at most. Field names that start with `$` or contain a dot are refused with 400. Text fields must be real text: a number or a list in place of text gives 400. Files (photos, tour pictures) are sent as `multipart/form-data`.

**Answers.** A good answer looks like this:

```json
{ "status": "success", "data": { "tour": { "...": "..." } } }
```

A list also tells where you are: `results` (how many came back), `page`, `limit`, `total` and `totalPages`. An answer with status 204 has no body.

A bad answer always has the same shape, and the message says what to change:

```json
{ "status": "fail", "message": "No tour found with that id" }
```

`status` is `fail` for a mistake of the caller (4xx) and `error` for a mistake of the server (5xx).

| Code | Meaning |
| --- | --- |
| 200, 201, 204 | Good. 201 means "created", 204 means "done, nothing to send back". |
| 400 | The request is wrong (a missing field, a broken rule, a bad id). |
| 401 | You are not logged in, or the login is old, or the password is wrong. |
| 403 | You are logged in, but your role may not do this. |
| 404 | There is no such tour, user, review, booking or picture (or no such address). |
| 413 | An upload is too big. |
| 429 | Too many requests (see the limits below). |
| 502 | The payment service did not answer well. |

**Limits** (for one IP address):

| What | Limit |
| --- | --- |
| The whole API (`/api`) | 300 requests in 15 minutes |
| `signup`, `login`, `forgotPassword`, `resetPassword` (they share one counter) | 10 in 15 minutes |
| Photo and tour picture uploads (they share one counter) | 20 in 1 hour |

**Ids.** An id is 24 characters, from 0-9 and a-f. A badly shaped id gives 400 or 404.

**The user object.** The API never sends passwords, hashes or tokens. A user looks like this: `_id`, `name`, `email`, `role` and `photo`. `photo` is `default.jpg` (no photo chosen) or the id of a picture (see `GET /img/:id`).

---

## Users and login

### `POST /api/v1/users/signup`

Makes a new user and logs them in. Sends a welcome email in the background (a failed email never stops the signup).

Body: `name` (up to 50 characters), `email` (a real email, one account for each), `password` (8 to 64 characters), `passwordConfirm` (the same text).
Any other field you send (like `role`) is ignored: a new user is always a `user`.
Answer: `201`, `data.user`, and the login cookie. Errors: `400` (a rule is broken, or the email is taken).

### `POST /api/v1/users/login`

Body: `email`, `password`. Answer: `200`, `data.user`, and the login cookie.
Errors: `400` (a field is missing or is not text), `401` (`Incorrect email or password`, the same message for both so nobody can find out which emails exist).

### `POST /api/v1/users/logout`

Removes the login cookie. Answer: `200`.

### `POST /api/v1/users/forgotPassword`

Body: `email`. Sends a link to choose a new password. The answer is the same `200` for every email, so nobody can find out which emails have an account. The link works for 10 minutes and once. A second request within a minute sends no second email.

### `PATCH /api/v1/users/resetPassword/:token`

The `:token` is the long text in the link of the email. Body: `password`, `passwordConfirm`. Answer: `200` and a new login cookie (the user is logged in). Every older login stops working.
Errors: `400` when the link is not valid, is over, or was already used, or when the password breaks a rule (the link then still works for another try).

### `GET /api/v1/users/me`

Login needed. Answer: `200`, `data.user`.

### `PATCH /api/v1/users/updateMe`

Login needed. Body: `name` and/or `email`. Nothing else can be changed here (`role`, `photo` and passwords give `400`). Answer: `200`, `data.user`.

### `PATCH /api/v1/users/updateMyPassword`

Login needed. Body: `passwordCurrent`, `password`, `passwordConfirm`. Answer: `200` and a new login cookie. Errors: `401` (the current password is wrong), `400` (a rule is broken).

### `PATCH /api/v1/users/updateMyPhoto`

Login needed. A form with one file in the field `photo`: JPEG, PNG or WebP, up to 5 MB, no other fields. The server makes it a 400 x 400 JPEG, removes hidden data (like the place where it was taken) and saves it in the database. Answer: `200`, `data.user` (with the new `photo`). Errors: `400` (not a picture, or a wrong form), `413` (over 5 MB). SVG and GIF files are refused.

### `DELETE /api/v1/users/deleteMyPhoto`

Login needed. Goes back to the plain avatar. Answer: `200`, `data.user`.

### `DELETE /api/v1/users/deleteMe`

Login needed. Closes your own account (it disappears from every search, nothing else is deleted). Answer: `204`. The only admin cannot close their account (`400`).

### `GET /api/v1/users`

Admin only. The users, by name. Query: `role` (user, guide, lead-guide or admin), `page`, `limit`. Answer: `200`, `data.users`, and the paging numbers.

### `GET /api/v1/users/:id`

Admin only. Answer: `200`, `data.user`. Error: `404`.

### `PATCH /api/v1/users/:id`

Admin only. Body: `role`. An admin cannot change their own role. Answer: `200`, `data.user`.

### `DELETE /api/v1/users/:id`

Admin only. Closes the account of a user. Answer: `204`. For your own account use `deleteMe`.

---

## Tours

A tour has: `name` (5 to 60 characters, one tour for each name), `slug` (made from the name, like `the-hunza-valley-explorer`), `duration` (days), `maxGroupSize`, `difficulty` (`easy`, `medium` or `difficult`), `price` (rupees for one person), `summary`, `description`, `startDates`, `startLocation` and `locations` (GeoJSON points, see the example below), `guides`, `imageCover`, `images`, `ratingsAverage` and `ratingsQuantity`.

A *secret tour* (`secretTour: true`) is hidden from every route that reads tours. Only the staff can still change or delete it.

### `GET /api/v1/tours`

Everyone. Query:

- Filters: `difficulty=easy`, and for the numbers `duration`, `maxGroupSize`, `price`, `ratingsAverage`, `ratingsQuantity`: `price=95000` or with a word in brackets, `price[lte]=95000` (`gte`, `gt`, `lte`, `lt`).
- `sort`: names separated by commas, a minus sign for biggest first, like `sort=-ratingsAverage,price`. Allowed: `name`, `difficulty`, `duration`, `maxGroupSize`, `price`, `ratingsAverage`, `ratingsQuantity`.
- `fields`: only these fields come back, like `fields=name,price,slug`. Allowed: `name`, `duration`, `maxGroupSize`, `difficulty`, `price`, `summary`, `description`, `startDates`, `ratingsAverage`, `ratingsQuantity`, `startLocation`, `locations`, `slug`, `guides`, `imageCover`, `images`.
- `page` (from 1) and `limit` (1 to 50, 10 if you say nothing).

Answer: `200`, `data.tours`, and the paging numbers. A filter or word the API does not know gives `400` and a clear message (for example `You cannot filter by colour`). Use each word only once.

### `GET /api/v1/tours/:id`

Everyone. One tour. `data.tour.guides` holds the guides with only `_id`, `name`, `photo` and `role` (never the email). Error: `404`.

### `POST /api/v1/tours`

`admin` or `lead-guide`. A JSON body with the tour. Needed: `name`, `duration`, `maxGroupSize`, `difficulty`, `price`, `summary`. Also allowed: `description`, `startDates`, `startLocation`, `locations` (up to 20), `guides` (up to 5 ids of users with the role `guide` or `lead-guide`), `secretTour`. Answer: `201`, `data.tour`.
These can not be set by hand (`400`): `ratingsAverage` and `ratingsQuantity` (they come from the reviews), `slug` (it comes from the name) and `imageCover` and `images` (use the pictures route).

```json
{
  "name": "The Hunza Valley Explorer",
  "duration": 7,
  "maxGroupSize": 12,
  "difficulty": "easy",
  "price": 95000,
  "summary": "Seven relaxed days among apricot orchards.",
  "startDates": ["2027-04-15", "2027-05-20"],
  "startLocation": { "type": "Point", "coordinates": [74.66, 36.32], "address": "Karimabad, Hunza" },
  "locations": [{ "type": "Point", "coordinates": [74.67, 36.32], "description": "Baltit Fort", "day": 1 }]
}
```

Coordinates are `[longitude, latitude]` in the body.

### `PATCH /api/v1/tours/:id`

`admin` or `lead-guide`. Only the fields you send change. A new `name` gives a new `slug`. The same rules as `POST`. Answer: `200`, `data.tour`. Error: `404`.

### `PATCH /api/v1/tours/:id/images`

`admin` or `lead-guide`. A form with `imageCover` (one file) and/or `images` (up to 3 files), each a JPEG, PNG or WebP of up to 5 MB, and no other fields. The cover is saved as 1400 x 900 and each gallery picture as 1200 x 800. New pictures **replace** the old ones of the same kind (the old pictures are deleted). If one file is bad, nothing is saved. Answer: `200`, `data.tour`. Errors: `400`, `404`, `413`.

### `DELETE /api/v1/tours/:id`

`admin` or `lead-guide`. Answer: `204`. Error: `404`.

### `GET /api/v1/tours/top-5-cheap`

Everyone. The 5 cheapest tours, cheapest first (when two cost the same, the better rated one comes first). Each tour has only `name`, `slug`, `price`, `duration`, `difficulty`, `summary`, `ratingsAverage`, `ratingsQuantity` and `imageCover`. Answer: `200`, `results`, `data.tours`. The same list, with every field, is `GET /api/v1/tours?sort=price,-ratingsAverage&limit=5`.

### `GET /api/v1/tours/tour-stats`

Everyone. Numbers for each difficulty: `difficulty`, `numTours`, `numRatings`, `avgRating`, `avgPrice`, `minPrice`, `maxPrice`. Answer: `200`, `data.stats`.

### `GET /api/v1/tours/monthly-plan/:year`

`admin`, `lead-guide` or `guide`. For a year (4 digits, like `2027`): for each month, `month` (1 to 12), `numTourStarts` and the names in `tours`. Answer: `200`, `data.plan`. Error: `400` for a bad year.

### `GET /api/v1/tours/tours-within/:distance/center/:latlng/unit/:unit`

Everyone. The tours that start within a distance of a place. `:distance` is a number above 0 and at most 20000, `:latlng` is `latitude,longitude` (like `36.3269,74.6614`), `:unit` is `km` or `mi`. Query: `page`, `limit`. Answer: `200`, `data.tours`, and the paging numbers.

### `GET /api/v1/tours/distances/:latlng/unit/:unit`

Everyone. The distance from a place to the start of every tour, nearest first: `data.distances` holds `_id`, `name` and `distance` (one decimal), and `data.unit` says `km` or `mi`. Query: `page`, `limit`.

---

## Reviews

### `GET /api/v1/tours/:tourId/reviews`

Everyone. The reviews of one tour, newest first. Query: `page`, `limit` (nothing else is allowed). A review holds `_id`, `rating` (1 to 5), `review` (the text), `tour` (the tour id), `createdAt` and `user` (an object with the `_id` and the `name` of the writer, never the email). Answer: `200`, `data.reviews`, and the paging numbers. Error: `404` (no such tour). A tour with no reviews gives an empty list, not an error.

### `POST /api/v1/tours/:tourId/reviews`

Login needed, and the role `user`. Body: `review` (text, up to 1000 characters) and `rating` (a number from 1 to 5). One review for each user and tour (`400` for a second one). Answer: `201`, `data.review`. The rating numbers of the tour are worked out again.

### `PATCH /api/v1/reviews/:id`

Login needed. Only the writer. Body: `review` and/or `rating`. Answer: `200`, `data.review`. Errors: `403` (not yours), `404`.

### `DELETE /api/v1/reviews/:id`

Login needed. The writer, or an admin. Answer: `204`. Errors: `403`, `404`.

---

## Bookings and payment

A booking has a `status`: `pending` (waits for the payment, for 30 minutes), `paid` or `cancelled`. Its `amount` is `price x guests`, worked out by the server. A pending booking holds its places for 30 minutes. A tour date can take at most `maxGroupSize` guests in all.

Two payment ways exist. Which one a booking uses is set when it is made (`gateway`):

- `payfast`: the customer pays on the page of **PayFast** (Pakistan). It is used when `PAYFAST_MERCHANT_ID` and `PAYFAST_SECURED_KEY` are set.
- `demo`: a pretend checkout. **No money is taken.** It is used when PayFast is not set up, so the whole flow can be shown.

### `POST /api/v1/bookings`

Login needed. Body:

```json
{ "tour": "<tour id>", "startDate": "2027-04-15T00:00:00.000Z", "guests": 2, "mobile": "03451234567" }
```

`startDate` must be one of the upcoming start dates of the tour, written the way `startDates` writes it. `guests` is a whole number from 1 to `maxGroupSize`. `mobile` is a Pakistani mobile number (`03451234567`, `+923451234567` and `+92-3451234567` are all fine). A waiting booking of yours for the same date is replaced by the new one.
Answer: `201`, `data.booking` and `data.payUrl` (the page to pay, like `/pay/<id>`).
Errors: `400` (a rule is broken, you already paid this date, or not enough places are left: `Only 2 places are left on that date`, `That date is full`), `404` (no such tour).

### `GET /api/v1/bookings/my`

Login needed. Your bookings, the newest start date first. Answer: `200`, `data.bookings`.

### `GET /api/v1/bookings`

`admin` or `lead-guide`. All the bookings, newest first, with the name and email of the user. Query: `page` (from 1), `limit` (1 to 100, 20 if you say nothing).

### `GET /api/v1/bookings/:id`

Login needed. Your own booking, or any booking for the staff. Everybody else gets `404`.

### `DELETE /api/v1/bookings/:id`

Login needed. Cancels a booking that still waits for its payment (status `cancelled`). A paid booking cannot be cancelled here (`400`), because the money has to go back through the payment service.

### `POST /api/v1/bookings/:id/demo-pay`

Login needed. The pretend payment of the demo checkout. Only for your own booking of the kind `demo` that is `pending` and not over. Answer: `200`, the booking, now `paid`. If two requests come at the same moment, only one wins.

### `GET /api/v1/bookings/payfast-ipn` and `POST /api/v1/bookings/payfast-ipn`

The message of the PayFast server about a payment (no login: the proof is a hash that only PayFast and this server can make). It reads `basket_id`, `err_code`, `validation_hash` and, when sent, `transaction_id` and `transaction_amount`. The booking becomes `paid` only if the hash fits, `err_code` is `000` and the amount (when sent) is the amount of the booking. Telling the same payment twice changes nothing the second time. Answer: always `200`, `{ "status": "ok", "result": "paid" }` (or `failed`, `invalid`, `unknown`).

PayFast also sends the customer's browser back to `/payment/payfast/success` or `/payment/payfast/failure` with the same values. The page checks them in the same way and does not trust the word `success` in the address.

---

## Other addresses

### `GET /img/:id`

A saved picture (a user photo or a tour picture) by its id. Answer: the image (`image/jpeg`), kept by the browser for a year (a new upload always has a new id). Error: `404`.

### `GET /health`

For the hosting service: `200` with `{ "status": "ok", "database": "connected" }`, or `503` when the database is not connected. It does not count against the limits.

## The pages of the website

These are for browsers, not for programs: `/` (all tours), `/tours/:idOrSlug`, `/login`, `/signup`, `/forgot-password`, `/reset-password/:token`, `/me` (account), `/my-tours` (bookings), `/pay/:id` (payment) and `/payment/payfast/success` and `/payment/payfast/failure` (where PayFast sends the customer back).
