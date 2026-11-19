// POST /products/:id/reviews — buyer with a delivered item, one review per product.
import { Router } from 'express';
import db from '../db.js';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import { requireAuth } from '../auth.js';
import { clean } from '../validate.js';

const router = Router();

const deliveredTo = db.prepare(`
  SELECT 1 FROM order_items oi
  JOIN seller_orders so ON so.id = oi.seller_order_id
  JOIN orders o ON o.id = so.order_id
  WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered'
  LIMIT 1`);

// Insert + rating update in one transaction, so the average never drifts from the reviews.
const addReview = db.transaction((productId, buyerId, rating, body) => {
  const id = db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, body) VALUES (?, ?, ?, ?)')
    .run(productId, buyerId, rating, body).lastInsertRowid;
  db.prepare(`
    UPDATE products SET
      rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?),
      rating_avg   = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = ?)
    WHERE id = ?`).run(productId, productId, productId);
  return id;
}).immediate;

router.post('/products/:id/reviews', requireAuth, (req, res) => {
  const pid = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid)) throw notFound('Product not found.');

  const { rating, body } = req.body ?? {};
  const text = clean(body);
  const fields = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = 'Choose 1 to 5 stars.';
  if (text.length < 3 || text.length > 2000) fields.body = 'Write 3 to 2,000 characters.';
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);

  if (!deliveredTo.get(pid, req.user.id)) {
    throw new ApiError(403, 'NOT_DELIVERED', 'You can review a product after it has been delivered to you.');
  }

  let id;
  try {
    id = addReview(pid, req.user.id, rating, text);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('ALREADY_REVIEWED', 'You have already reviewed this product.');
    throw e;
  }
  const p = db.prepare('SELECT rating_avg, rating_count FROM products WHERE id = ?').get(pid);
  res.status(201).json({
    review: { id, productId: pid, rating, body: text },
    product: { ratingAvg: p.rating_avg, ratingCount: p.rating_count },
  });
});

export default router;
