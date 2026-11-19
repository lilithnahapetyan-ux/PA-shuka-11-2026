// Builds the Express app. index.js starts it; tests can import it too.
import express from 'express';
import cookieParser from 'cookie-parser';
import { UPLOADS_DIR } from './config.js';
import { errorHandler, notFound } from './errors.js';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // On Render the app sits behind a proxy (and Netlify's in front of that).
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(loadUser);

  // Product images. File names are random and never reused, so they can be cached for long.
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, index: false }));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use(authRoutes);
  // Any /api path nobody handled: JSON 404, not an HTML page.
  api.use((_req, _res, next) => next(notFound('No such endpoint.')));

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
