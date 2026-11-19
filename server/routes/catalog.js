// Catalog (anyone): GET /categories, GET /products, GET /products/:id, GET /products/:id/reviews
import { Router } from 'express';
import db from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { imageUrls } from '../images.js';

const router = Router();

export const PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

// Sort keys the API accepts. Values are fixed SQL, so user input never reaches ORDER BY.
// Every order ends with p.id so pages never repeat or skip a product on ties.
const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price_amd ASC, p.id DESC',
  price_desc: 'p.price_amd DESC, p.id DESC',
  rating: 'p.rating_avg DESC, p.rating_count DESC, p.created_at DESC, p.id DESC',
};

// Main image = lowest position. A subquery (not position = 0) stays correct
// even if image positions ever have a gap.
const MAIN_IMAGE = `(SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1)`;

/** Reads a whole number >= min from the query string. Returns undefined if absent, or an error. */
function intParam(raw, min) {
  if (raw === undefined || raw === '') return { value: undefined };
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return { error: 'Must be a whole number.' };
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) return { error: `Must be ${min} or more.` };
  return { value: n };
}

/** Escapes % and _ so a search for "50%" means the text "50%", not "50 then anything". */
const likePattern = (word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** First name + last initial: "Anna Grigoryan" → "Anna G." Reviews never show full names. */
function shortName(name) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)[0]}.` : first;
}

function productCard(row) {
  return {
    id: row.id,
    title: row.title,
    priceAmd: row.price_amd,
    stock: row.stock,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    image: row.main_image ? imageUrls(row.main_image) : null,
    seller: { id: row.seller_id, storeName: row.store_name },
    category: { slug: row.category_slug, name: row.category_name },
    createdAt: row.created_at,
  };
}

// GET /categories — flat list with the number of published products in each
router.get('/categories', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug,
           (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_published = 1) AS product_count
    FROM categories c
    ORDER BY c.name`).all();
  res.json({ categories: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, productCount: c.product_count })) });
});

// GET /products?q=&category=&minPrice=&maxPrice=&sort=&page=&pageSize=
router.get('/products', (req, res) => {
  const { q, category, sort = 'newest' } = req.query;
  const min = intParam(req.query.minPrice, 0);
  const max = intParam(req.query.maxPrice, 0);
  const page = intParam(req.query.page, 1);
  const size = intParam(req.query.pageSize, 1);

  const fields = {};
  if (min.error) fields.minPrice = min.error;
  if (max.error) fields.maxPrice = max.error;
  if (page.error) fields.page = page.error;
  if (size.error || size.value > MAX_PAGE_SIZE) fields.pageSize = size.error ?? `Must be ${MAX_PAGE_SIZE} or less.`;
  if (!Object.hasOwn(SORTS, sort)) fields.sort = `Use one of: ${Object.keys(SORTS).join(', ')}.`;
  if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
    fields.maxPrice = 'Must be at least the minimum price.';
  }
  if (Object.keys(fields).length) throw badRequest('Invalid search filters.', fields);

  // Build WHERE from fixed fragments; every user value goes in as a ? parameter.
  const where = ['p.is_published = 1'];
  const params = [];
  if (typeof category === 'string' && category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (min.value !== undefined) { where.push('p.price_amd >= ?'); params.push(min.value); }
  if (max.value !== undefined) { where.push('p.price_amd <= ?'); params.push(max.value); }

  // Keyword search: every word must appear in the title or the description.
  // Note: SQLite's LIKE ignores case only for A–Z, not for Armenian or Cyrillic letters.
  const words = typeof q === 'string' ? q.trim().split(/\s+/).filter(Boolean).slice(0, 10) : [];
  for (const w of words) {
    where.push(`(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`);
    params.push(likePattern(w), likePattern(w));
  }

  const from = `
    FROM products p
    JOIN categories c ON c.id = p.category_id
    JOIN users u ON u.id = p.seller_id
    WHERE ${where.join(' AND ')}`;

  const pageSize = size.value ?? PAGE_SIZE;
  const pageNo = page.value ?? 1;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
  const rows = db.prepare(`
    SELECT p.id, p.title, p.price_amd, p.stock, p.rating_avg, p.rating_count, p.created_at, p.seller_id,
           u.store_name, c.slug AS category_slug, c.name AS category_name, ${MAIN_IMAGE} AS main_image
    ${from}
    ORDER BY ${SORTS[sort]}
    LIMIT ? OFFSET ?`).all(...params, pageSize, (pageNo - 1) * pageSize);

  res.json({
    items: rows.map(productCard),
    total,
    page: pageNo,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
});

/** Loads a product that the current user may see: published, or their own. Otherwise 404. */
function visibleProduct(req) {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
  if (!id) throw notFound('Product not found.');
  const p = db.prepare(`
    SELECT p.*, u.store_name, c.name AS category_name, c.slug AS category_slug
    FROM products p
    JOIN users u ON u.id = p.seller_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?`).get(id);
  // An unpublished product looks exactly like a missing one, except to its seller.
  if (!p || (p.is_published === 0 && p.seller_id !== req.user?.id)) throw notFound('Product not found.');
  return p;
}

// GET /products/:id — the product page
router.get('/products/:id', (req, res) => {
  const p = visibleProduct(req);
  const images = db.prepare(
    'SELECT file_path, position FROM product_images WHERE product_id = ? ORDER BY position'
  ).all(p.id);
  res.json({
    product: {
      id: p.id,
      title: p.title,
      description: p.description,
      priceAmd: p.price_amd,
      stock: p.stock,
      isPublished: p.is_published === 1,
      ratingAvg: p.rating_avg,
      ratingCount: p.rating_count,
      images: images.map((i) => ({ position: i.position, ...imageUrls(i.file_path) })),
      seller: { id: p.seller_id, storeName: p.store_name },
      category: { id: p.category_id, name: p.category_name, slug: p.category_slug },
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    },
  });
});

// GET /products/:id/reviews?page= — newest first
router.get('/products/:id/reviews', (req, res) => {
  const p = visibleProduct(req);
  const page = intParam(req.query.page, 1);
  if (page.error) throw badRequest('Invalid page.', { page: page.error });
  const pageNo = page.value ?? 1;
  const pageSize = 10;

  const total = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE product_id = ?').get(p.id).n;
  const rows = db.prepare(`
    SELECT r.id, r.rating, r.body, r.created_at, u.name
    FROM reviews r JOIN users u ON u.id = r.buyer_id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?`).all(p.id, pageSize, (pageNo - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({
      id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at, buyerName: shortName(r.name),
    })),
    total,
    page: pageNo,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
});

export default router;
