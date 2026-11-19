// Applies numbered .sql files from server/migrations in order.
// The applied version is stored in PRAGMA user_version, so no extra table is needed
// (the brief asks for exactly ten tables).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate() {
  const current = db.pragma('user_version', { simple: true });
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();

  let applied = 0;
  for (const file of files) {
    const version = parseInt(file, 10);
    if (version <= current) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Each file runs in its own transaction: it applies fully or not at all.
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
    console.log(`applied ${file}`);
    applied++;
  }
  if (applied === 0) console.log(`database is up to date (version ${current})`);
}

// Run directly: `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate();
}
