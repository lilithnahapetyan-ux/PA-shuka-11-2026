// All environment-dependent settings live here, so nothing else reads process.env.
import path from 'node:path';

export const IS_PROD = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT ?? 3000);

export const DB_PATH = path.resolve(process.env.DB_PATH ?? 'data/shuka.db');
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? 'data/uploads');

// Signs the session cookie. Secrets live only in environment variables.
// In production a missing secret is a startup error, not a silent default.
export const SESSION_SECRET = process.env.SESSION_SECRET
  ?? (IS_PROD ? null : 'dev-only-secret-do-not-use-in-production');
if (!SESSION_SECRET || (IS_PROD && SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set (at least 32 characters) in production.');
}

export const SESSION_DAYS = 30;
