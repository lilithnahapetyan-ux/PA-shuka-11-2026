# Shuka — Amazon-style marketplace

## Run locally (so far: database, demo data, accounts and catalog API)

```bash
npm install
npm run seed        # deletes data/, migrates, fills demo data and images (~10 s)
npm run check:db    # verifies pragmas, 10 STRICT tables, constraints, FK enforcement
```

Start the API (restarts on file changes):

```bash
npm run dev         # http://localhost:3000/api/health
```

Tests (each seeds its own database in data/test/, your data/shuka.db is untouched):

```bash
npm test             # all suites
npm run test:auth    # accounts, sessions, error shape
npm run test:catalog # categories, search, filters, sort, pages, product page, reviews
```

`npm run migrate` alone applies new migrations without touching existing data.

## Environment variables

| Name | Local default | Production |
|---|---|---|
| `PORT` | 3000 | set by Render |
| `DB_PATH` | data/shuka.db | on the persistent disk, e.g. /var/data/shuka.db |
| `UPLOADS_DIR` | data/uploads | on the persistent disk, e.g. /var/data/uploads |
| `SESSION_SECRET` | a dev-only value | **required**, 32+ random characters |
| `NODE_ENV` | (unset) | production |

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

## Layout

```
server/
  index.js               entry point: migrate, then listen
  app.js                 Express app: JSON, cookies, /uploads, /api routes, errors
  config.js              all environment variables
  errors.js              ApiError + the one error shape { error: { code, message } }
  validate.js            field validators (email, password, name, phone)
  auth.js                signed httpOnly session cookie, requireAuth, requireSeller
  routes/auth.js         /auth/register, /auth/login, /auth/logout, /me
  routes/catalog.js      /categories, /products (search, filters, sort, pages), /products/:id, reviews
  db.js                  single SQLite connection: WAL, busy_timeout 5000, foreign_keys ON
  migrate.js             applies numbered .sql files, version kept in PRAGMA user_version
  images.js              resize to -thumb.webp / -large.webp, save in UPLOADS_DIR
  migrations/001_init.sql
scripts/
  seed.js                rebuilds the demo database from nothing
  seed-data.js           categories, users, 43 products, orders, reviews
  check-db.js            Step 1 checks (all run in a rolled-back transaction)
  test-auth.js           Step 3 checks against a real running server
  test-catalog.js        Step 4 checks
  lib/harness.js         test helpers: seed test DB, start server, cookie-keeping client
data/                    local database and uploads (git-ignored)
```
