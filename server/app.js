// Builds the Express app. index.js starts it; tests can import it too.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { UPLOADS_DIR } from './config.js';
import { errorHandler, notFound } from './errors.js';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import sellerRoutes from './routes/seller.js';
import sellerImageRoutes from './routes/sellerImages.js';
import sellerOrderRoutes from './routes/sellerOrders.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import reviewRoutes from './routes/reviews.js';

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
  api.use(catalogRoutes);
  api.use(sellerRoutes);
  api.use(sellerImageRoutes);
  api.use(sellerOrderRoutes);
  api.use(cartRoutes);
  api.use(orderRoutes);
  api.use(reviewRoutes);
  // Any /api path nobody handled: JSON 404, not an HTML page.
  api.use((_req, _res, next) => next(notFound('No such endpoint.')));

  app.use('/api', api);

  // The built frontend (web/dist), when present: one process serves the whole product
  // locally (npm run build && npm start). In production Netlify serves it instead.
  const dist = path.resolve('web/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    // Any other GET is a page of the app (e.g. /products/12): send index.html.
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
