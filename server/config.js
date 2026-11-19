// All environment-dependent settings live here, so nothing else reads process.env.
import path from 'node:path';

export const DB_PATH = path.resolve(process.env.DB_PATH ?? 'data/shuka.db');
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? 'data/uploads');
