// Cart (signed in): GET /cart, PUT /cart/items/:productId, DELETE /cart/items/:productId,
// POST /cart/accept-prices
import { Router } from 'express';
import db from '../db.js';
import { ApiError, badRequest, forbidden, notFound } from '../errors.js';
import { requireAuth } from '../auth.js';
import { imageUrls } from '../images.js';
import { amd } from '../format.js';

const router = Router();
router.use('/cart', requireAuth);

const stockText = (n) => (n === 0 ? 'This item is sold out.' : `Only ${n} left.`);

/** Cart rows joined with the product as it is right now. */
export function cartRows(userId) {
  return db.prepare(`
    SELECT ci.product_id, ci.quantity, ci.price_when_added,
           p.title, p.price_amd, p.stock, p.is_published, p.seller_id, u.store_name,
           (SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS main_image
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE ci.user_id = ?
    ORDER BY u.store_name, p.title`).all(userId);
}

/**
 * Cart grouped by seller, with a warning on every item that changed since it was added:
 *   PRICE_CHANGED  the price is different now (checkout will stop until accepted)
 *   SOLD_OUT       stock is 0
 *   NOT_ENOUGH     fewer left than the quantity in the cart
 *   UNAVAILABLE    the seller unpublished it
 * Totals use current prices and count only items that can be bought.
 */
export function cartView(userId) {
  const groups = new Map();
  let total = 0;
  let count = 0;
  let problems = 0;

  for (const r of cartRows(userId)) {
    const warnings = [];
    if (r.is_published === 0) warnings.push({ code: 'UNAVAILABLE', message: 'No longer available.' });
    else if (r.stock === 0) warnings.push({ code: 'SOLD_OUT', message: 'Sold out since you added it.' });
    else if (r.quantity > r.stock) warnings.push({ code: 'NOT_ENOUGH', message: `Only ${r.stock} left. Lower the quantity.` });
    if (r.price_amd !== r.price_when_added) {
      warnings.push({
        code: 'PRICE_CHANGED',
        message: `Price changed from ${amd(r.price_when_added)} to ${amd(r.price_amd)}.`,
        oldPriceAmd: r.price_when_added,
        newPriceAmd: r.price_amd,
      });
    }
    const buyable = r.is_published === 1 && r.stock > 0;
    const line = buyable ? r.price_amd * r.quantity : 0;
    if (warnings.length) problems++;

    if (!groups.has(r.seller_id)) {
      groups.set(r.seller_id, { seller: { id: r.seller_id, storeName: r.store_name }, items: [], subtotalAmd: 0 });
    }
    const g = groups.get(r.seller_id);
    g.items.push({
      productId: r.product_id,
      title: r.title,
      image: r.main_image ? imageUrls(r.main_image) : null,
      priceAmd: r.price_amd,
      priceWhenAddedAmd: r.price_when_added,
      quantity: r.quantity,
      stock: r.stock,
      lineTotalAmd: line,
      warnings,
    });
    g.subtotalAmd += line;
    total += line;
    count += r.quantity;
  }

  return { groups: [...groups.values()], itemCount: count, totalAmd: total, canCheckout: count > 0 && problems === 0 };
}

router.get('/cart', (req, res) => {
  res.json({ cart: cartView(req.user.id) });
});

// PUT /cart/items/:productId { quantity } — add, or set the quantity. Never above stock.
router.put('/cart/items/:productId', (req, res) => {
  const id = /^\d+$/.test(req.params.productId) ? Number(req.params.productId) : null;
  const p = id && db.prepare('SELECT id, seller_id, price_amd, stock, is_published FROM products WHERE id = ?').get(id);
  if (!p || p.is_published === 0) throw notFound('Product not found.');
  if (p.seller_id === req.user.id) throw forbidden("You can't buy your own product.");

  const { quantity } = req.body ?? {};
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw badRequest('Choose a quantity of 1 or more.', { quantity: 'Choose a quantity of 1 or more.' });
  }
  if (quantity > p.stock) {
    throw new ApiError(409, p.stock === 0 ? 'OUT_OF_STOCK' : 'NOT_ENOUGH_STOCK', stockText(p.stock), {
      quantity: stockText(p.stock),
    });
  }

  // Adding remembers today's price; changing the quantity later keeps the original,
  // so a price change is still noticed at checkout.
  db.prepare(`
    INSERT INTO cart_items (user_id, product_id, quantity, price_when_added) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = excluded.quantity`
  ).run(req.user.id, p.id, quantity, p.price_amd);

  res.json({ cart: cartView(req.user.id) });
});

// DELETE /cart/items/:productId — removing something that isn't there is not an error.
router.delete('/cart/items/:productId', (req, res) => {
  const id = /^\d+$/.test(req.params.productId) ? Number(req.params.productId) : 0;
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, id);
  res.json({ cart: cartView(req.user.id) });
});

// POST /cart/accept-prices — the buyer saw the new prices and agrees to them.
router.post('/cart/accept-prices', (req, res) => {
  db.prepare(`
    UPDATE cart_items SET price_when_added = (SELECT price_amd FROM products p WHERE p.id = cart_items.product_id)
    WHERE user_id = ?`).run(req.user.id);
  res.json({ cart: cartView(req.user.id) });
});

export default router;
