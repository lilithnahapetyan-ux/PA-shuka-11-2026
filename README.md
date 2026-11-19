# Shuka — Amazon-style marketplace

## Run locally (so far: database + demo data)

```bash
npm install
npm run seed        # deletes data/, migrates, fills demo data and images (~10 s)
npm run check:db    # verifies pragmas, 10 STRICT tables, constraints, FK enforcement
```

`npm run migrate` alone applies new migrations without touching existing data.

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
  config.js              DB_PATH and UPLOADS_DIR from environment variables
  db.js                  single SQLite connection: WAL, busy_timeout 5000, foreign_keys ON
  migrate.js             applies numbered .sql files, version kept in PRAGMA user_version
  images.js              resize to -thumb.webp / -large.webp, save in UPLOADS_DIR
  migrations/001_init.sql
scripts/
  seed.js                rebuilds the demo database from nothing
  seed-data.js           categories, users, 43 products, orders, reviews
  check-db.js            Step 1 checks (all run in a rolled-back transaction)
data/                    local database and uploads (git-ignored)
```
