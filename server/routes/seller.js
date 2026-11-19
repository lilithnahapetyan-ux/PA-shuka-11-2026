// Seller area.
//   POST  /seller/activate                       signed in
//   GET   /seller/overview                       seller
//   GET   /seller/products                       seller, own products only
//   POST  /seller/products                       seller
//   GET   /seller/products/:id                   seller, own product only (for the editor)
//   PATCH /seller/products/:id                   seller, own product only
// Every product query includes "AND seller_id = ?" (hard part #6): another seller's
// product id answers 404, exactly like a product that does not exist.
import { Router } from 'express';
import db from '../db.js';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import { rules, assertValid, clean } from '../validate.js';
import { publicUser, requireAuth, requireSeller } from '../auth.js';
import { imageUrls } from '../images.js';

const router = Router();

const MAX_PRICE = 100_000_000; // 100 million dram
const MAX_STOCK = 100_000;

// ---------------------------------------------------------------- activate

router.post('/seller/activate', requireAuth, (req, res) => {
  if (req.user.store_name !== null) throw conflict('ALREADY_SELLER', 'You are already a seller.');
  const { storeName, phone } = req.body ?? {};
  const name = clean(storeName);
  assertValid({
    storeName: !name ? 'Enter a store name.' : name.length < 2 || name.length > 60 ? 'Use 2 to 60 characters.' : null,
    phone: rules.phone(phone),
  });

  try {
    // "AND store_name IS NULL" makes a double activation a no-op instead of a rename.
    const r = db.prepare('UPDATE users SET store_name = ?, phone = ? WHERE id = ? AND store_name IS NULL')
      .run(name, clean(phone), req.user.id);
    if (r.changes === 0) throw conflict('ALREADY_SELLER', 'You are already a seller.');
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError(409, 'STORE_NAME_TAKEN', 'This store name is taken.', { storeName: 'This store name is taken.' });
    }
    throw e;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------- overview
// Plain SQL, as the brief requires for the overview queries.

router.get('/seller/overview', requireSeller, (req, res) => {
  const counts = Object.fromEntries(
    ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => [s, 0])
  );
  for (const row of db.prepare(
    'SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status'
  ).all(req.user.id)) counts[row.status] = row.n;

  // "delivered" is a final state, so updated_at is the moment it was delivered.
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(subtotal_amd), 0) AS amd
    FROM seller_orders
    WHERE seller_id = ? AND status = 'delivered' AND updated_at >= ?`).get(req.user.id, since).amd;

  res.json({
    toConfirm: counts.placed,
    toShip: counts.confirmed,
    ordersByStatus: counts,
    revenueLast30DaysAmd: revenue,
  });
});

// ---------------------------------------------------------------- products

/** Validates product fields. With `partial`, only fields present in the body are checked. */
function readProductBody(body, partial) {
  const has = (k) => body[k] !== undefined;
  const want = (k) => !partial || has(k);
  const fields = {};
  const out = {};

  if (want('title')) {
    const t = clean(body.title);
    if (t.length < 3 || t.length > 120) fields.title = 'Use 3 to 120 characters.';
    else out.title = t;
  }
  if (want('description')) {
    const d = clean(body.description);
    if (d.length < 10 || d.length > 5000) fields.description = 'Use 10 to 5,000 characters.';
    else out.description = d;
  }
  if (want('priceAmd')) {
    const p = body.priceAmd;
    if (!Number.isInteger(p) || p < 1 || p > MAX_PRICE) fields.priceAmd = 'Enter a whole number of dram, 1 or more.';
    else out.price_amd = p;
  }
  if (want('stock')) {
    const s = body.stock;
    if (!Number.isInteger(s) || s < 0 || s > MAX_STOCK) fields.stock = 'Enter a whole number, 0 or more.';
    else out.stock = s;
  }
  if (want('categoryId')) {
    const c = body.categoryId;
    if (!Number.isInteger(c) || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(c)) fields.categoryId = 'Choose a category.';
    else out.category_id = c;
  }
  if (has('isPublished')) {
    if (typeof body.isPublished !== 'boolean') fields.isPublished = 'Must be true or false.';
    else out.is_published = body.isPublished ? 1 : 0;
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
  return out;
}

/** The seller's own product, or 404. */
export function ownProduct(req) {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
  const p = id && db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, req.user.id);
  if (!p) throw notFound('Product not found.');
  return p;
}

export function productImages(productId) {
  return db.prepare('SELECT id, file_path, position FROM product_images WHERE product_id = ? ORDER BY position')
    .all(productId)
    .map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) }));
}

function editorProduct(p) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    priceAmd: p.price_amd,
    stock: p.stock,
    categoryId: p.category_id,
    isPublished: p.is_published === 1,
    ratingAvg: p.rating_avg,
    ratingCount: p.rating_count,
    images: productImages(p.id),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// GET /seller/products — the dashboard table
router.get('/seller/products', requireSeller, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.title, p.price_amd, p.stock, p.is_published, p.created_at, p.updated_at,
           c.name AS category_name,
           (SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS main_image,
           (SELECT COALESCE(SUM(oi.quantity), 0)
              FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
             WHERE oi.product_id = p.id AND so.status <> 'cancelled') AS units_sold
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.seller_id = ?
    ORDER BY p.created_at DESC, p.id DESC`).all(req.user.id);

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      priceAmd: r.price_amd,
      stock: r.stock,
      isPublished: r.is_published === 1,
      unitsSold: r.units_sold,
      category: r.category_name,
      image: r.main_image ? imageUrls(r.main_image) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// POST /seller/products — always created unpublished: images come next,
// and a product can only be published once it has at least one image.
router.post('/seller/products', requireSeller, (req, res) => {
  const v = readProductBody(req.body ?? {}, false);
  if (v.is_published === 1) {
    throw conflict('NEEDS_IMAGE', 'Add at least one photo before publishing.');
  }
  const id = db.prepare(`
    INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published)
    VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(req.user.id, v.category_id, v.title, v.description, v.price_amd, v.stock).lastInsertRowid;
  res.status(201).json({ product: editorProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
});

// GET /seller/products/:id — load the editor
router.get('/seller/products/:id', requireSeller, (req, res) => {
  res.json({ product: editorProduct(ownProduct(req)) });
});

// PATCH /seller/products/:id — edit any subset of fields; isPublished:false unpublishes.
// Past orders are unaffected: order_items keep their own copy of title and price.
router.patch('/seller/products/:id', requireSeller, (req, res) => {
  const p = ownProduct(req);
  const v = readProductBody(req.body ?? {}, true);
  if (Object.keys(v).length === 0) throw badRequest('Nothing to update.');

  if (v.is_published === 1 && productImages(p.id).length === 0) {
    throw conflict('NEEDS_IMAGE', 'Add at least one photo before publishing.');
  }

  const cols = Object.keys(v); // only names produced by readProductBody, never user input
  db.prepare(`
    UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND seller_id = ?`
  ).run(...cols.map((c) => v[c]), p.id, req.user.id);

  res.json({ product: editorProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(p.id)) });
});

export default router;
