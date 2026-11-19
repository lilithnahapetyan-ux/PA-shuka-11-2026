// Checkout and buyer orders (signed in; every order query is scoped to buyer_id).
//   POST /orders                                         checkout, with a request key
//   GET  /orders                                         my orders
//   GET  /orders/last-address                            to pre-fill the checkout form
//   GET  /orders/:id                                     one of my orders
//   POST /orders/:id/sellers/:sellerOrderId/cancel       cancel my part before it ships
import { Router } from 'express';
import db from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { rules, assertValid, clean } from '../validate.js';
import { requireAuth } from '../auth.js';
import { imageUrls } from '../images.js';
import { amd } from '../format.js';
import { BUYER_MOVES, changeStatus, historyOf } from '../orderStatus.js';

const router = Router();
router.use('/orders', requireAuth);

export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik',
  'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];

function readAddress(body) {
  const len = (v, min, max, label) => {
    const s = clean(v);
    if (s.length < min) return `Enter ${label}.`;
    if (s.length > max) return `Use at most ${max} characters.`;
    return null;
  };
  assertValid({
    recipient: len(body.recipient, 1, 100, 'the recipient’s name'),
    phone: rules.phone(body.phone),
    region: REGIONS.includes(body.region) ? null : 'Choose Yerevan or a marz.',
    city: len(body.city, 1, 100, 'a city or village'),
    street: len(body.street, 1, 200, 'the street and building'),
    apartment: body.apartment == null || body.apartment === '' ? null : len(body.apartment, 1, 50, 'the apartment'),
    note: body.note == null || body.note === '' ? null : len(body.note, 1, 500, 'a note'),
    requestKey: typeof body.requestKey === 'string' && /^[\w-]{8,100}$/.test(body.requestKey)
      ? null : 'Missing request key. Reload the page and try again.',
  });
  return {
    recipient: clean(body.recipient),
    phone: clean(body.phone),
    region: body.region,
    city: clean(body.city),
    street: clean(body.street),
    apartment: clean(body.apartment) || null,
    note: clean(body.note) || null,
  };
}

const orderByKey = db.prepare('SELECT id, buyer_id FROM orders WHERE request_key = ?');

/**
 * Hard parts #1, #3, #4, #7 in one place. Runs as BEGIN IMMEDIATE, so the whole checkout
 * holds the write lock from its first read to its last write. Any throw rolls everything back.
 * Plain SQL throughout, as the brief requires for checkout.
 */
const placeOrder = db.transaction((buyerId, address, requestKey) => {
  // #7 Double checkout: the same key means the same order.
  const existing = orderByKey.get(requestKey);
  if (existing) {
    if (existing.buyer_id !== buyerId) throw conflict('REQUEST_KEY_USED', 'Reload the page and try again.');
    return { orderId: existing.id, repeated: true };
  }

  const lines = db.prepare(`
    SELECT ci.product_id, ci.quantity, ci.price_when_added,
           p.title, p.price_amd, p.stock, p.is_published, p.seller_id
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = ?
    ORDER BY p.seller_id, p.id`).all(buyerId);
  if (lines.length === 0) throw new ApiError(400, 'CART_EMPTY', 'Your cart is empty.');

  const gone = lines.find((l) => l.is_published === 0);
  if (gone) throw conflict('UNAVAILABLE', `"${gone.title}" is no longer available. Remove it from your cart.`);

  // #3 Price changed since it went into the cart: stop and show the new prices.
  const changed = lines.filter((l) => l.price_amd !== l.price_when_added);
  if (changed.length) {
    const err = conflict('PRICE_CHANGED', changed.length === 1
      ? `The price of "${changed[0].title}" changed to ${amd(changed[0].price_amd)}.`
      : 'Some prices changed since you added the items.');
    err.details = changed.map((l) => ({
      productId: l.product_id, title: l.title, oldPriceAmd: l.price_when_added, newPriceAmd: l.price_amd,
    }));
    throw err;
  }

  // #4 One order, one seller order per seller.
  const bySeller = new Map();
  for (const l of lines) {
    if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, []);
    bySeller.get(l.seller_id).push(l);
  }
  const total = lines.reduce((s, l) => s + l.price_amd * l.quantity, 0);

  let orderId;
  try {
    orderId = db.prepare(`
      INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key)
      VALUES (@buyerId, @recipient, @phone, @region, @city, @street, @apartment, @note, @total, @requestKey)`
    ).run({ buyerId, ...address, total, requestKey }).lastInsertRowid;
  } catch (e) {
    // Belt and braces: the UNIQUE constraint is the final word on duplicates.
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return { orderId: orderByKey.get(requestKey).id, repeated: true };
    throw e;
  }

  const insertSellerOrder = db.prepare(
    "INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd) VALUES (?, ?, 'placed', ?)"
  );
  const insertHistory = db.prepare(
    "INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by) VALUES (?, NULL, 'placed', ?)"
  );
  // #1 Overselling: the stock check and the decrement are ONE statement.
  // If another checkout took the last units first, this changes 0 rows.
  const takeStock = db.prepare(
    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? AND is_published = 1'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, ?, ?, ?)'
  );
  const stockNow = db.prepare('SELECT stock FROM products WHERE id = ?');

  for (const [sellerId, items] of bySeller) {
    const subtotal = items.reduce((s, l) => s + l.price_amd * l.quantity, 0);
    const soId = insertSellerOrder.run(orderId, sellerId, subtotal).lastInsertRowid;
    insertHistory.run(soId, buyerId);
    for (const l of items) {
      if (takeStock.run(l.quantity, l.product_id, l.quantity).changes !== 1) {
        const left = stockNow.get(l.product_id).stock;
        throw conflict('OUT_OF_STOCK', left === 0
          ? `"${l.title}" just sold out.`
          : `Not enough "${l.title}" left: only ${left}.`);
      }
      // #3 Copy title and price: editing the product later never changes this order.
      insertItem.run(soId, l.product_id, l.title, l.price_amd, l.quantity);
    }
  }

  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(buyerId);
  return { orderId, repeated: false };
}).immediate;

/** Full order as the buyer sees it. Assumes ownership was already checked. */
export function buyerOrder(orderId, buyerId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(orderId, buyerId);
  if (!o) return null;
  const parts = db.prepare(`
    SELECT so.id, so.seller_id, so.status, so.subtotal_amd, so.updated_at, u.store_name
    FROM seller_orders so JOIN users u ON u.id = so.seller_id
    WHERE so.order_id = ? ORDER BY u.store_name`).all(o.id);
  const items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.title, oi.unit_price_amd, oi.quantity,
           (SELECT file_path FROM product_images i WHERE i.product_id = oi.product_id ORDER BY i.position LIMIT 1) AS main_image,
           EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = oi.product_id AND r.buyer_id = ?) AS reviewed
    FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`);

  return {
    id: o.id,
    createdAt: o.created_at,
    totalAmd: o.total_amd,
    payment: 'cash_on_delivery',
    address: {
      recipient: o.recipient, phone: o.phone, region: o.region, city: o.city,
      street: o.street, apartment: o.apartment, note: o.note,
    },
    parts: parts.map((p) => ({
      id: p.id,
      seller: { id: p.seller_id, storeName: p.store_name },
      status: p.status,
      subtotalAmd: p.subtotal_amd,
      updatedAt: p.updated_at,
      canCancel: BUYER_MOVES[p.status].includes('cancelled'),
      items: items.all(buyerId, p.id).map((i) => ({
        productId: i.product_id,
        title: i.title,
        unitPriceAmd: i.unit_price_amd,
        quantity: i.quantity,
        lineTotalAmd: i.unit_price_amd * i.quantity,
        image: i.main_image ? imageUrls(i.main_image) : null,
        reviewed: i.reviewed === 1,
        canReview: p.status === 'delivered' && i.reviewed === 0,
      })),
      history: historyOf(p.id, buyerId),
    })),
  };
}

// POST /orders — checkout
router.post('/orders', (req, res) => {
  const body = req.body ?? {};
  const address = readAddress(body);
  let result;
  try {
    result = placeOrder(req.user.id, address, body.requestKey);
  } catch (e) {
    if (e.details) { // PRICE_CHANGED: send the list so the page can show old → new
      return res.status(409).json({ error: { code: e.code, message: e.message, items: e.details } });
    }
    throw e;
  }
  res.status(result.repeated ? 200 : 201).json({
    order: buyerOrder(result.orderId, req.user.id),
    repeated: result.repeated,
  });
});

// GET /orders?page= — newest first, with one status per seller
router.get('/orders', (req, res) => {
  const pageNo = /^\d+$/.test(req.query.page ?? '1') ? Math.max(1, Number(req.query.page ?? 1)) : 1;
  const pageSize = 20;
  const total = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ?').get(req.user.id).n;
  const orders = db.prepare(`
    SELECT id, created_at, total_amd FROM orders WHERE buyer_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(req.user.id, pageSize, (pageNo - 1) * pageSize);
  const partsOf = db.prepare(`
    SELECT so.id, so.status, so.subtotal_amd, u.store_name,
           (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE seller_order_id = so.id) AS units
    FROM seller_orders so JOIN users u ON u.id = so.seller_id
    WHERE so.order_id = ? ORDER BY u.store_name`);

  res.json({
    items: orders.map((o) => ({
      id: o.id,
      createdAt: o.created_at,
      totalAmd: o.total_amd,
      parts: partsOf.all(o.id).map((p) => ({
        id: p.id, storeName: p.store_name, status: p.status, subtotalAmd: p.subtotal_amd, units: p.units,
      })),
    })),
    total, page: pageNo, pageSize, pages: Math.ceil(total / pageSize),
  });
});

// GET /orders/last-address — the address of my most recent order, or null
router.get('/orders/last-address', (req, res) => {
  const a = db.prepare(`
    SELECT recipient, phone, region, city, street, apartment, note
    FROM orders WHERE buyer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).get(req.user.id);
  res.json({ address: a ?? null });
});

// GET /orders/:id
router.get('/orders/:id', (req, res) => {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
  const order = buyerOrder(id, req.user.id); // hard part #6: scoped to buyer_id
  if (!order) throw notFound('Order not found.');
  res.json({ order });
});

// POST /orders/:id/sellers/:sellerOrderId/cancel
router.post('/orders/:id/sellers/:sellerOrderId/cancel', (req, res) => {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
  const soId = /^\d+$/.test(req.params.sellerOrderId) ? Number(req.params.sellerOrderId) : 0;
  const owns = db.prepare(`
    SELECT so.id FROM seller_orders so JOIN orders o ON o.id = so.order_id
    WHERE so.id = ? AND so.order_id = ? AND o.buyer_id = ?`).get(soId, id, req.user.id);
  if (!owns) throw notFound('Order not found.');

  changeStatus(soId, 'cancelled', req.user.id, BUYER_MOVES);
  res.json({ order: buyerOrder(id, req.user.id) });
});

export default router;
