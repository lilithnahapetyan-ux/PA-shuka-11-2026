// The seller-order state machine (hard part #5). This is the ONLY place a status changes.
//
//   placed ──confirm──▶ confirmed ──ship──▶ shipped ──deliver──▶ delivered
//     │                    │
//     └──── cancel ────────┴──▶ cancelled   (stock is returned)
//
// Sellers move orders forward and may cancel before shipping.
// Buyers may only cancel, and only before shipping.
import db from './db.js';
import { conflict } from './errors.js';

export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export const SELLER_MOVES = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const BUYER_MOVES = {
  placed: ['cancelled'],
  confirmed: ['cancelled'],
  shipped: [],
  delivered: [],
  cancelled: [],
};

const getSellerOrder = db.prepare('SELECT id, status FROM seller_orders WHERE id = ?');
const setStatus = db.prepare(`
  UPDATE seller_orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ? AND status = ?`);
const addHistory = db.prepare(
  'INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)'
);
const itemsOf = db.prepare('SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?');
const returnStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');

/**
 * Moves one seller order to `to`, if `moves` allows it from the current status.
 * Status change, history row and (for cancel) stock return happen in ONE transaction.
 * The caller must already have checked that `userId` owns this seller order.
 * Throws 409 STATUS_NOT_ALLOWED and changes nothing otherwise.
 */
export const changeStatus = db.transaction((sellerOrderId, to, userId, moves) => {
  const so = getSellerOrder.get(sellerOrderId);
  if (!STATUSES.includes(to) || !moves[so.status].includes(to)) {
    throw conflict('STATUS_NOT_ALLOWED', `An order that is ${so.status} cannot be moved to ${to}.`);
  }
  // "AND status = ?" guards against two clicks racing: only the first one changes a row.
  if (setStatus.run(to, sellerOrderId, so.status).changes !== 1) {
    throw conflict('STATUS_NOT_ALLOWED', 'This order was just changed. Reload and try again.');
  }
  addHistory.run(sellerOrderId, so.status, to, userId);
  if (to === 'cancelled') {
    for (const item of itemsOf.all(sellerOrderId)) returnStock.run(item.quantity, item.product_id);
  }
  return to;
}).immediate;

/** Status history of a seller order, oldest first, with who made each move. */
export function historyOf(sellerOrderId, buyerId) {
  return db.prepare(`
    SELECT from_status, to_status, changed_by, created_at
    FROM status_history WHERE seller_order_id = ? ORDER BY created_at, id`
  ).all(sellerOrderId).map((h) => ({
    from: h.from_status,
    to: h.to_status,
    by: h.changed_by === buyerId ? 'buyer' : 'seller',
    at: h.created_at,
  }));
}
