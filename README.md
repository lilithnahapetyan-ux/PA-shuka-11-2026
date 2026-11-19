# Shuka — Amazon-style marketplace

## Run locally (so far: database only)

```bash
npm install
npm run migrate     # creates data/shuka.db and applies server/migrations/*.sql
npm run check:db    # verifies pragmas, 10 STRICT tables, constraints, FK enforcement
```

## Layout

```
server/
  config.js              DB_PATH and UPLOADS_DIR from environment variables
  db.js                  single SQLite connection: WAL, busy_timeout 5000, foreign_keys ON
  migrate.js             applies numbered .sql files, version kept in PRAGMA user_version
  migrations/001_init.sql
scripts/
  check-db.js            Step 1 checks (all run in a rolled-back transaction)
data/                    local database and uploads (git-ignored)
```
