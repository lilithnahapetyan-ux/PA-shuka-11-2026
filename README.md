# Shuka — Amazon-style marketplace

Local marketplace for Armenia: anyone can register, sell products and buy from several sellers in one cart.
Cash on delivery, prices in AMD. One Node.js process, one SQLite file.

## Run locally

```bash
npm install
npm run seed        # deletes data/, migrates, fills demo data and images (~10 s)
npm run dev         # API on http://localhost:3000 (restarts on file changes)
```

Check it: http://localhost:3000/api/health → `{"ok":true}`

## Tests

Each suite seeds its own database in `data/test/`; your `data/shuka.db` is never touched.

```bash
npm test             # all functional suites (auth, catalog, seller, orders)
npm run breakit      # the nine break-it tests from the brief, with a readable report
npm run check:db     # pragmas, 10 STRICT tables, constraints (on data/shuka.db)
```

## Demo accounts

Password for every account: `shuka-demo-2026`

| Role | Email | Store |
|---|---|---|
| Seller | ararat@shuka.test | Ararat Tech |
| Seller | vernissage@shuka.test | Vernissage Crafts |
| Seller | kond@shuka.test | Kond Home & Style |
| Buyer | anna@shuka.test | |
| Buyer | davit@shuka.test | |

The seed refuses to run with `NODE_ENV=production` unless `--force` is passed.

## Environment variables

| Name | Local default | Production |
|---|---|---|
| `PORT` | 3000 | set by Render |
| `DB_PATH` | data/shuka.db | on the persistent disk, e.g. /var/data/shuka.db |
| `UPLOADS_DIR` | data/uploads | on the persistent disk, e.g. /var/data/uploads |
| `SESSION_SECRET` | a dev-only value | **required**, 32+ random characters |
| `NODE_ENV` | (unset) | production |

## API

All paths start with `/api`. Errors always look like `{ "error": { "code", "message" } }`;
validation errors add `fields` with one message per input. Status codes: 400 invalid input,
401 signed out, 403 not allowed, 404 not found (also for other people's data), 409 conflict.

| Area | Endpoint | Who |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`, `PATCH /me` | anyone / signed in |
| Catalog | `GET /categories` | anyone |
| | `GET /products?q=&category=&minPrice=&maxPrice=&sort=newest\|price_asc\|price_desc\|rating&page=&pageSize=` | anyone |
| | `GET /products/:id`, `GET /products/:id/reviews?page=` | anyone (unpublished: owner only) |
| Cart | `GET /cart`, `PUT /cart/items/:productId {quantity}`, `DELETE /cart/items/:productId` | signed in |
| | `POST /cart/accept-prices` (after a price change) | signed in |
| Checkout | `POST /orders {requestKey, recipient, phone, region, city, street, apartment?, note?}` | signed in |
| Buyer orders | `GET /orders`, `GET /orders/:id`, `GET /orders/last-address` | owner |
| | `POST /orders/:id/sellers/:sellerOrderId/cancel` | owner, before shipping |
| Reviews | `POST /products/:id/reviews {rating, body}` | buyer with a delivered item |
| Seller | `POST /seller/activate {storeName, phone}` | signed in |
| | `GET /seller/overview` | seller |
| Seller products | `GET, POST /seller/products`, `GET, PATCH /seller/products/:id` | seller, own only |
| | `POST /seller/products/:id/images` (multipart, field `images`) | seller, own only |
| | `DELETE /seller/products/:id/images/:imageId`, `PUT .../images/:imageId/main` | seller, own only |
| Seller orders | `GET /seller/orders?status=`, `GET /seller/orders/:id` | seller, own only |
| | `POST /seller/orders/:id/status {to}` | seller, own only |

Seller order lifecycle (enforced in `server/orderStatus.js`, every move adds a `status_history` row):

```
placed ──▶ confirmed ──▶ shipped ──▶ delivered
  └──────────┴──▶ cancelled   (buyer or seller, before shipping; stock is returned)
```

## How the hard parts are handled

| # | Problem | Where |
|---|---|---|
| 1 | Overselling | `routes/orders.js` `placeOrder`: BEGIN IMMEDIATE, `UPDATE … SET stock = stock - ? WHERE id = ? AND stock >= ?`, changed rows checked, whole order rolled back |
| 2 | "Database is locked" | `db.js`: WAL + `busy_timeout = 5000`; no file or network work inside transactions |
| 3 | Prices change after purchase | title and price copied into `order_items`, address into `orders`; checkout compares `price_when_added` |
| 4 | One cart, many sellers | one `orders` row, one `seller_orders` row per seller |
| 5 | Status changes not allowed | `orderStatus.js`: allowed moves on the server, 409 otherwise, history row per move |
| 6 | Other people's data | every query scoped: `AND seller_id = ?` / `AND buyer_id = ?` → 404 |
| 7 | Double checkout | random request key, `UNIQUE (request_key)`, a repeat returns the existing order |
| 8 | Broken references | `PRAGMA foreign_keys = ON`; products are unpublished, never deleted (`ON DELETE RESTRICT`) |
| 9 | Images | type checked by decoding, 8 MB limit, resized to thumb + large WebP, files on disk, path in SQLite |

## Layout

```
server/
  index.js               entry point: migrate, then listen
  app.js                 Express app: JSON, cookies, /uploads, /api routes, errors
  config.js              all environment variables
  db.js                  single SQLite connection: WAL, busy_timeout 5000, foreign_keys ON
  migrate.js             applies numbered .sql files, version kept in PRAGMA user_version
  migrations/001_init.sql
  errors.js              ApiError + the one error shape
  validate.js            field validators
  format.js              "9,500 ֏" for messages
  auth.js                signed httpOnly session cookie, requireAuth, requireSeller
  images.js              check, resize to -thumb.webp / -large.webp, save in UPLOADS_DIR
  orderStatus.js         seller order state machine, status history, stock return on cancel
  routes/
    auth.js  catalog.js  cart.js  orders.js  reviews.js
    seller.js  sellerImages.js  sellerOrders.js
scripts/
  seed.js, seed-data.js  rebuild the demo database
  check-db.js            schema checks
  test-*.js              functional test suites
  breakit.js             the nine break-it tests
  lib/harness.js         test helpers: seed test DB, start server, cookie-keeping client
data/                    local database and uploads (git-ignored)
```
