// Seller orders (seller, own orders only — every query has "AND so.seller_id = ?").
//   GET  /seller/orders?status=&page=     tabs by status with counts, newest first
//   GET  /seller/orders/:id               items at purchase prices, recipient, phone, address, cash to collect
//   POST /seller/orders/:id/status        { "to": "confirmed" | "shipped" | "delivered" | "cancelled" }
import { Router } from 'express';
import db from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireSeller } from '../auth.js';
import { imageUrls } from '../images.js';
import { STATUSES, SELLER_MOVES, changeStatus, historyOf } from '../orderStatus.js';

const router = Router();
router.use('/seller/orders', requireSeller);

// GET /seller/orders?status=placed&page=1
router.get('/seller/orders', (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status)) {
    throw badRequest('Unknown status.', { status: `Use one of: ${STATUSES.join(', ')}.` });
  }
  const pageNo = /^\d+$/.test(req.query.page ?? '1') ? Math.max(1, Number(req.query.page ?? 1)) : 1;
  const pageSize = 20;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) {
    counts[r.status] = r.n;
  }

  const where = status ? 'so.seller_id = ? AND so.status = ?' : 'so.seller_id = ?';
  const params = status ? [req.user.id, status] : [req.user.id];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM seller_orders so WHERE ${where}`).get(...params).n;
  const rows = db.prepare(`
    SELECT so.id, so.order_id, so.status, so.subtotal_amd, so.updated_at,
           o.created_at, o.recipient, o.region, o.city,
           (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE seller_order_id = so.id) AS units
    FROM seller_orders so JOIN orders o ON o.id = so.order_id
    WHERE ${where}
    ORDER BY o.created_at DESC, so.id DESC
    LIMIT ? OFFSET ?`).all(...params, pageSize, (pageNo - 1) * pageSize);

  res.json({
    counts,
    items: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      status: r.status,
      subtotalAmd: r.subtotal_amd,
      units: r.units,
      recipient: r.recipient,
      region: r.region,
      city: r.city,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total, page: pageNo, pageSize, pages: Math.ceil(total / pageSize),
  });
});

function ownSellerOrder(req) {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
  const so = db.prepare(`
    SELECT so.*, o.buyer_id, o.created_at AS ordered_at, o.recipient, o.phone, o.region, o.city,
           o.street, o.apartment, o.note, u.name AS buyer_name
    FROM seller_orders so
    JOIN orders o ON o.id = so.order_id
    JOIN users u ON u.id = o.buyer_id
    WHERE so.id = ? AND so.seller_id = ?`).get(id, req.user.id); // hard part #6
  if (!so) throw notFound('Order not found.');
  return so;
}

function sellerOrderView(so) {
  const items = db.prepare(`
    SELECT oi.product_id, oi.title, oi.unit_price_amd, oi.quantity,
           (SELECT file_path FROM product_images i WHERE i.product_id = oi.product_id ORDER BY i.position LIMIT 1) AS main_image
    FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`).all(so.id);
  return {
    id: so.id,
    orderId: so.order_id,
    status: so.status,
    allowedMoves: SELLER_MOVES[so.status], // the page shows buttons only for these
    createdAt: so.ordered_at,
    updatedAt: so.updated_at,
    buyerName: so.buyer_name,
    delivery: {
      recipient: so.recipient, phone: so.phone, region: so.region, city: so.city,
      street: so.street, apartment: so.apartment, note: so.note,
    },
    items: items.map((i) => ({
      productId: i.product_id,
      title: i.title,               // as it was at purchase time
      unitPriceAmd: i.unit_price_amd, // as it was at purchase time
      quantity: i.quantity,
      lineTotalAmd: i.unit_price_amd * i.quantity,
      image: i.main_image ? imageUrls(i.main_image) : null,
    })),
    cashToCollectAmd: so.status === 'cancelled' ? 0 : so.subtotal_amd,
    subtotalAmd: so.subtotal_amd,
    history: historyOf(so.id, so.buyer_id),
  };
}

router.get('/seller/orders/:id', (req, res) => {
  res.json({ order: sellerOrderView(ownSellerOrder(req)) });
});

// The only way a seller changes a status. Allowed moves live in orderStatus.js.
router.post('/seller/orders/:id/status', (req, res) => {
  const so = ownSellerOrder(req);
  const to = req.body?.to;
  if (typeof to !== 'string') throw badRequest('Send the new status as { "to": "..." }.', { to: 'Required.' });
  changeStatus(so.id, to, req.user.id, SELLER_MOVES);
  res.json({ order: sellerOrderView(ownSellerOrder(req)) });
});

export default router;
