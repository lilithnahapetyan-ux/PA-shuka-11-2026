// Rebuilds the demo database from nothing: deletes the DB and uploads, migrates, seeds.
// Usage: npm run seed
// Refuses to run when NODE_ENV=production unless --force is passed,
// so it can never wipe the live database by accident.
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { DB_PATH, UPLOADS_DIR } from '../server/config.js';
import * as data from './seed-data.js';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to seed: NODE_ENV=production. Pass --force to wipe and reseed anyway.');
  process.exit(1);
}

// 1. Start from nothing. Must happen before db.js opens the file.
for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });

const { default: db } = await import('../server/db.js');
const { migrate } = await import('../server/migrate.js');
const { saveProductImage } = await import('../server/images.js');
migrate();

// ISO-8601 UTC timestamp `hours` hours ago, same format as the column defaults.
const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * 3600_000).toISOString();

// 2. All rows in one short transaction (no file work inside — hard part #2).
const ids = { category: {}, user: {}, product: {} };
const productMeta = []; // for the image step

db.transaction(() => {
  const insertCategory = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  for (const c of data.categories) ids.category[c.slug] = insertCategory.run(c.name, c.slug).lastInsertRowid;

  const hash = bcrypt.hashSync(data.DEMO_PASSWORD, 10);
  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, phone, store_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const u of data.users) {
    ids.user[u.ref] = insertUser.run(u.email, hash, u.name, u.phone, u.store ?? null, hoursAgo(60 * 24)).lastInsertRowid;
  }

  // Spread creation times over ~3 weeks in a shuffled order, so "newest" mixes sellers.
  // i*7 mod n is a permutation because 7 and the product count (43) share no factor.
  const n = data.products.length;
  const insertProduct = db.prepare(`
    INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  data.products.forEach(([ref, seller, cat, title, price, stock, description, published = true], i) => {
    const createdAt = hoursAgo(((i * 7) % n) * 12 + 24 * 25);
    const id = insertProduct.run(
      ids.user[seller], ids.category[cat], title, description, price, stock, published ? 1 : 0, createdAt, createdAt
    ).lastInsertRowid;
    ids.product[ref] = id;
    productMeta.push({ id, cat, index: i });
  });

  // Orders: one buyer order, one seller order per seller, items with copied title and price.
  const productRow = db.prepare('SELECT id, seller_id, title, price_amd FROM products WHERE id = ?');
  const insertOrder = db.prepare(`
    INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key, created_at)
    VALUES (@buyer_id, @recipient, @phone, @region, @city, @street, @apartment, @note, @total_amd, @request_key, @created_at)`);
  const insertSellerOrder = db.prepare(
    'INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, ?, ?, ?)'
  );
  const insertHistory = db.prepare(
    'INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const sellerRefById = Object.fromEntries(Object.entries(ids.user).map(([ref, id]) => [id, ref]));

  for (const o of data.orders) {
    const buyerId = ids.user[o.buyer];
    const placedHours = o.daysAgo * 24;

    // Group lines by seller.
    const parts = new Map();
    for (const [ref, qty] of o.lines) {
      const p = productRow.get(ids.product[ref]);
      if (!parts.has(p.seller_id)) parts.set(p.seller_id, []);
      parts.get(p.seller_id).push({ ...p, qty });
    }
    const total = [...parts.values()].flat().reduce((s, l) => s + l.price_amd * l.qty, 0);

    const orderId = insertOrder.run({
      buyer_id: buyerId, ...o.address, total_amd: total, request_key: o.requestKey, created_at: hoursAgo(placedHours),
    }).lastInsertRowid;

    for (const [sellerId, lines] of parts) {
      const moves = o.path[sellerRefById[sellerId]] ?? [];
      const finalStatus = moves.at(-1) ?? 'placed';
      const lastHours = placedHours - moves.length * 24;
      const subtotal = lines.reduce((s, l) => s + l.price_amd * l.qty, 0);

      const soId = insertSellerOrder.run(orderId, sellerId, finalStatus, subtotal, hoursAgo(lastHours)).lastInsertRowid;
      for (const l of lines) insertItem.run(soId, l.id, l.title, l.price_amd, l.qty);

      insertHistory.run(soId, null, 'placed', buyerId, hoursAgo(placedHours));
      let from = 'placed';
      moves.forEach((to, step) => {
        const by = to === 'cancelled' && o.cancelledBy === 'buyer' ? buyerId : sellerId;
        insertHistory.run(soId, from, to, by, hoursAgo(placedHours - (step + 1) * 24));
        from = to;
      });
    }
  }

  // Reviews, then recompute each product's rating from its reviews.
  const insertReview = db.prepare(
    'INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [ref, buyer, rating, body, daysAgo] of data.reviews) {
    insertReview.run(ids.product[ref], ids.user[buyer], rating, body, hoursAgo(daysAgo * 24));
  }
  db.prepare(`
    UPDATE products SET
      rating_count = (SELECT COUNT(*) FROM reviews r WHERE r.product_id = products.id),
      rating_avg   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews r WHERE r.product_id = products.id), 0)`
  ).run();
})();

// 3. Placeholder images: simple shapes, no text (so no fonts are needed on the server).
const palettes = {
  'electronics':         ['#E8EEF7', '#3D5A80', '#98C1D9'],
  'home-kitchen':        ['#F6EEE3', '#B5651D', '#E9C46A'],
  'clothing':            ['#EEF2EA', '#52796F', '#CAD2C5'],
  'beauty':              ['#FBEFF1', '#C0627A', '#F2B5C2'],
  'books':               ['#F3EFE7', '#6B4E3D', '#D4A373'],
  'sports-outdoors':     ['#E9F5F2', '#2A9D8F', '#8AD1C2'],
  'toys-kids':           ['#FFF4E0', '#E76F51', '#F4A261'],
  'jewelry-accessories': ['#F1EDF7', '#6D597A', '#C9ADA7'],
};

function placeholderSvg(cat, variant) {
  const [bg, main, accent] = palettes[cat];
  const shapes = [
    `<circle cx="600" cy="560" r="300" fill="${main}"/><circle cx="820" cy="330" r="90" fill="${accent}"/>`,
    `<rect x="330" y="300" width="540" height="540" rx="80" fill="${main}" transform="rotate(-8 600 570)"/><circle cx="600" cy="570" r="120" fill="${accent}"/>`,
    `<circle cx="600" cy="560" r="290" fill="none" stroke="${main}" stroke-width="90"/><circle cx="600" cy="560" r="80" fill="${accent}"/>`,
    `<rect x="300" y="420" width="600" height="380" rx="60" fill="${main}"/><rect x="400" y="270" width="400" height="200" rx="50" fill="${accent}"/>`,
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <rect width="1200" height="1200" fill="${bg}"/>
    <ellipse cx="600" cy="960" rx="360" ry="40" fill="#000" opacity="0.06"/>
    ${shapes[variant % shapes.length]}
  </svg>`);
}

const imageRows = [];
for (const p of productMeta) {
  const count = (p.index % 3) + 1; // 1–3 images per product
  for (let pos = 0; pos < count; pos++) {
    const png = await sharp(placeholderSvg(p.cat, p.index + pos)).png().toBuffer();
    imageRows.push([p.id, await saveProductImage(png, p.id), pos]);
  }
}
const insertImage = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)');
db.transaction(() => { for (const r of imageRows) insertImage.run(...r); })();

// 4. Summary
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(`Seeded: ${count('categories')} categories, ${count('users')} users, ${count('products')} products, ` +
  `${count('product_images')} images, ${count('orders')} orders, ${count('seller_orders')} seller orders, ${count('reviews')} reviews.`);
console.log(`Demo password for every account: ${data.DEMO_PASSWORD}`);
console.log('Sellers: ararat@, vernissage@, kond@shuka.test   Buyers: anna@, davit@shuka.test');
