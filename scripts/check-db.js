// Step 1 check: proves the database is set up the way the brief requires.
// Everything runs inside a transaction that is rolled back, so the DB stays clean.
// Usage: npm run migrate && npm run check:db
import db from '../server/db.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
function rejects(fn) {
  try { fn(); return { rejected: false }; }
  catch (e) { return { rejected: true, message: e.message }; }
}

// Connection settings
check('WAL mode', db.pragma('journal_mode', { simple: true }) === 'wal');
check('foreign keys ON', db.pragma('foreign_keys', { simple: true }) === 1);
check('busy timeout 5000 ms', db.pragma('busy_timeout', { simple: true }) === 5000);

// Tables
const expected = ['users', 'categories', 'products', 'product_images', 'cart_items',
  'orders', 'seller_orders', 'order_items', 'status_history', 'reviews'];
const tables = db.prepare(
  "SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'"
).all();
const names = tables.map((t) => t.name);
check('exactly 10 tables', tables.length === 10, names.join(', '));
check('all expected tables exist', expected.every((t) => names.includes(t)));
check('all tables STRICT', tables.every((t) => t.strict === 1));

// Behaviour tests, rolled back at the end
const sandbox = db.transaction(() => {
  const user = db.prepare(
    "INSERT INTO users (email, password_hash, name, phone) VALUES ('t@t.am', 'x', 'Test', '+37400000000')"
  ).run().lastInsertRowid;
  const cat = db.prepare("INSERT INTO categories (name, slug) VALUES ('Test', 'test')").run().lastInsertRowid;

  // STRICT: text in a money column
  let r = rejects(() => db.prepare(
    "INSERT INTO products (seller_id, category_id, title, description, price_amd, stock) VALUES (?, ?, 'x', 'x', 'abc', 1)"
  ).run(user, cat));
  check('text in price_amd is rejected (STRICT)', r.rejected, r.message);

  // STRICT: fractional dram
  r = rejects(() => db.prepare(
    "INSERT INTO products (seller_id, category_id, title, description, price_amd, stock) VALUES (?, ?, 'x', 'x', 99.5, 1)"
  ).run(user, cat));
  check('fractional price_amd is rejected (STRICT)', r.rejected, r.message);

  // CHECK: negative stock
  r = rejects(() => db.prepare(
    "INSERT INTO products (seller_id, category_id, title, description, price_amd, stock) VALUES (?, ?, 'x', 'x', 100, -1)"
  ).run(user, cat));
  check('negative stock is rejected', r.rejected, r.message);

  // CHECK: unknown status
  const product = db.prepare(
    "INSERT INTO products (seller_id, category_id, title, description, price_amd, stock) VALUES (?, ?, 'x', 'x', 100, 1)"
  ).run(user, cat).lastInsertRowid;
  const order = db.prepare(
    "INSERT INTO orders (buyer_id, recipient, phone, region, city, street, total_amd, request_key) VALUES (?, 'R', '+374', 'Yerevan', 'Yerevan', 'Abovyan 1', 100, 'k1')"
  ).run(user).lastInsertRowid;
  r = rejects(() => db.prepare(
    "INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd) VALUES (?, ?, 'lost', 100)"
  ).run(order, user));
  check("unknown status 'lost' is rejected", r.rejected, r.message);

  // UNIQUE: same request key twice (double checkout)
  r = rejects(() => db.prepare(
    "INSERT INTO orders (buyer_id, recipient, phone, region, city, street, total_amd, request_key) VALUES (?, 'R', '+374', 'Yerevan', 'Yerevan', 'Abovyan 1', 100, 'k1')"
  ).run(user));
  check('repeated request_key is rejected', r.rejected, r.message);

  // UNIQUE NOCASE: email
  r = rejects(() => db.prepare(
    "INSERT INTO users (email, password_hash, name, phone) VALUES ('T@T.AM', 'x', 'Test', '+374')"
  ).run());
  check('same email in other case is rejected', r.rejected, r.message);

  // RESTRICT: cannot delete an ordered product
  const so = db.prepare(
    "INSERT INTO seller_orders (order_id, seller_id, subtotal_amd) VALUES (?, ?, 100)"
  ).run(order, user).lastInsertRowid;

  // Break-it test: foreign keys (valid seller order, product ID that does not exist)
  r = rejects(() => db.prepare(
    "INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, 999999, 'x', 100, 1)"
  ).run(so));
  check('order item for a missing product is rejected', r.rejected, r.message);

  db.prepare(
    "INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, 'x', 100, 1)"
  ).run(so, product);
  r = rejects(() => db.prepare('DELETE FROM products WHERE id = ?').run(product));
  check('deleting an ordered product is rejected', r.rejected, r.message);

  // Insert-only status_history
  const h = db.prepare(
    "INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by) VALUES (?, NULL, 'placed', ?)"
  ).run(so, user).lastInsertRowid;
  r = rejects(() => db.prepare("UPDATE status_history SET to_status = 'delivered' WHERE id = ?").run(h));
  check('status_history UPDATE is rejected', r.rejected, r.message);
  r = rejects(() => db.prepare('DELETE FROM status_history WHERE id = ?').run(h));
  check('status_history DELETE is rejected', r.rejected, r.message);

  // CHECK: 6th image
  r = rejects(() => db.prepare(
    "INSERT INTO product_images (product_id, file_path, position) VALUES (?, 'p', 5)"
  ).run(product));
  check('image position 5 (6th image) is rejected', r.rejected, r.message);

  throw new Error('ROLLBACK');
});

try { sandbox(); } catch (e) { if (e.message !== 'ROLLBACK') throw e; }

const leftovers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 't@t.am'").get().n;
check('sandbox rolled back (no test rows left)', leftovers === 0, `${leftovers} test users`);

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
