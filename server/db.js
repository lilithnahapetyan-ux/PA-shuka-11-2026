// The one SQLite connection for the whole server process.
// better-sqlite3 is synchronous, so a single shared connection is the normal setup.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH, UPLOADS_DIR } from './config.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Hard part #2: WAL lets readers work while one writer writes;
// busy_timeout makes a second writer wait up to 5 s instead of failing with SQLITE_BUSY.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Hard part #8: foreign keys are OFF by default in SQLite, per connection.
db.pragma('foreign_keys = ON');

export default db;
