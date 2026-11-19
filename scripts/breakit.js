// The nine break-it tests from the brief, against a real server and a fresh test database.
// Usage: npm run breakit
// Run this in front of the teacher: each test prints what it does, what is expected, and what happened.
import crypto from 'node:crypto';
import { startServer, client, loginAs, newBuyer, makeProduct, key, ADDRESS } from './lib/harness.js';

const server = await startServer();
const B = server.base;
const results = [];

function report(n, name, how, expected, ok, got) {
  results.push({ n, name, ok });
  console.log(`\n${n}. ${name}`);
  console.log(`   How:      ${how}`);
  console.log(`   Expected: ${expected}`);
  console.log(`   Got:      ${got}`);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}`);
}

const stockOf = async (id) => (await client(B).get(`/api/products/${id}`)).json.product.stock;

try {
  const ararat = await loginAs(B, 'ararat@shuka.test');
  const kond = await loginAs(B, 'kond@shuka.test');

  // 1 ─────────────────────────────────────────────── Last units
  {
    const pid = await makeProduct(ararat, { title: 'Last units test', priceAmd: 5000, stock: 3 });
    const buyers = [];
    for (let i = 0; i < 30; i++) {
      const b = await newBuyer(B, 'race');
      await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
      buyers.push(b);
    }
    // All 30 checkouts leave at the same moment.
    const res = await Promise.all(buyers.map((b) => b.post('/api/orders', { ...ADDRESS, requestKey: key() })));
    const created = res.filter((r) => r.status === 201).length;
    const rejected = res.filter((r) => r.status === 409).length;
    const errors = res.filter((r) => r.status >= 500).length;
    const locked = /database is locked|SQLITE_BUSY/i.test(server.log());
    const stock = await stockOf(pid);
    const named = res.find((r) => r.status === 409)?.json?.error?.message ?? '';
    report(1, 'Last units', 'Product with stock 3; 30 buyers check out 1 unit each at the same time',
      'Exactly 3 orders, 27 answers of 409, stock 0, no "database is locked" errors',
      created === 3 && rejected === 27 && stock === 0 && errors === 0 && !locked,
      `${created} orders, ${rejected} × 409 ("${named}"), ${errors} server errors, stock ${stock}, locked errors: ${locked ? 'yes' : 'none'}`);
  }

  // 2 ─────────────────────────────────────────────── Double click
  {
    const pid = await makeProduct(ararat, { title: 'Double click test', stock: 10 });
    const b = await newBuyer(B);
    await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
    const k = key();
    const [a, c] = await Promise.all([
      b.post('/api/orders', { ...ADDRESS, requestKey: k }),
      b.post('/api/orders', { ...ADDRESS, requestKey: k }),
    ]);
    const list = (await b.get('/api/orders')).json;
    const stock = await stockOf(pid);
    report(2, 'Double click', 'Send the same checkout twice with the same request key', 'One order',
      list.total === 1 && a.json?.order?.id === c.json?.order?.id && stock === 9,
      `${list.total} order(s); both answers point to order #${a.json?.order?.id} and #${c.json?.order?.id} (statuses ${a.status}, ${c.status}); stock 10 → ${stock}`);
  }

  // 3 ─────────────────────────────────────────────── Price changed
  {
    const pid = await makeProduct(kond, { title: 'Price change test', priceAmd: 8000, stock: 5 });
    const b = await newBuyer(B);
    await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
    await kond.patch(`/api/seller/products/${pid}`, { priceAmd: 9500 });
    const r = await b.post('/api/orders', { ...ADDRESS, requestKey: key() });
    const orders = (await b.get('/api/orders')).json.total;
    const item = r.json?.error?.items?.[0];
    report(3, 'Price changed', 'Buyer adds an item, seller raises the price 8,000 → 9,500, buyer checks out',
      'Checkout stops and shows the new price',
      r.status === 409 && r.json.error.code === 'PRICE_CHANGED' && item?.newPriceAmd === 9500 && orders === 0 && (await stockOf(pid)) === 5,
      `${r.status} ${r.json?.error?.code}: "${r.json?.error?.message}" (old ${item?.oldPriceAmd}, new ${item?.newPriceAmd}); orders created: ${orders}`);
  }

  // 4 ─────────────────────────────────────────────── Old order after edit
  {
    const pid = await makeProduct(ararat, { title: 'Original title', priceAmd: 10000, stock: 5 });
    const b = await newBuyer(B);
    await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
    const order = (await b.post('/api/orders', { ...ADDRESS, requestKey: key() })).json.order;
    await ararat.patch(`/api/seller/products/${pid}`, { title: 'Renamed product', priceAmd: 99000 });
    const buyerItem = (await b.get(`/api/orders/${order.id}`)).json.order.parts[0].items[0];
    const sellerItem = (await ararat.get(`/api/seller/orders/${order.parts[0].id}`)).json.order.items[0];
    report(4, 'Old order after edit', 'Seller renames the product and changes 10,000 → 99,000 after it was ordered',
      'The old order still shows the old title and price',
      buyerItem.title === 'Original title' && buyerItem.unitPriceAmd === 10000 && sellerItem.title === 'Original title' && sellerItem.unitPriceAmd === 10000,
      `buyer sees "${buyerItem.title}" at ${buyerItem.unitPriceAmd}; seller sees "${sellerItem.title}" at ${sellerItem.unitPriceAmd}`);
  }

  // 5 ─────────────────────────────────────────────── Someone else's order
  {
    const pid = await makeProduct(ararat, { title: 'Privacy test', stock: 5 });
    const buyerA = await newBuyer(B);
    const buyerB = await newBuyer(B);
    await buyerB.put(`/api/cart/items/${pid}`, { quantity: 1 });
    const orderB = (await buyerB.post('/api/orders', { ...ADDRESS, requestKey: key() })).json.order;
    const soB = orderB.parts[0].id; // belongs to seller Ararat Tech
    const s = await kond.get(`/api/seller/orders/${soB}`);
    const sMove = await kond.post(`/api/seller/orders/${soB}/status`, { to: 'confirmed' });
    const b = await buyerA.get(`/api/orders/${orderB.id}`);
    const bCancel = await buyerA.post(`/api/orders/${orderB.id}/sellers/${soB}/cancel`);
    const leaked = [s, sMove, b, bCancel].some((r) => JSON.stringify(r.json).includes(ADDRESS.street));
    const stillPlaced = (await buyerB.get(`/api/orders/${orderB.id}`)).json.order.parts[0].status === 'placed';
    report(5, "Someone else's order", "Seller A opens seller B's order by ID; buyer A opens buyer B's order",
      '403 or 404, no data shown',
      [s, sMove, b, bCancel].every((r) => r.status === 404) && !leaked && stillPlaced,
      `seller open ${s.status}, seller move ${sMove.status}, buyer open ${b.status}, buyer cancel ${bCancel.status}; data leaked: ${leaked ? 'YES' : 'no'}; order unchanged: ${stillPlaced}`);
  }

  // 6 ─────────────────────────────────────────────── Move not allowed
  {
    const pid = await makeProduct(ararat, { title: 'Move test', stock: 5 });
    const b = await newBuyer(B);
    await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
    const o1 = (await b.post('/api/orders', { ...ADDRESS, requestKey: key() })).json.order;
    const so1 = o1.parts[0].id;
    const jump = await ararat.post(`/api/seller/orders/${so1}/status`, { to: 'delivered' });
    const after1 = (await ararat.get(`/api/seller/orders/${so1}`)).json.order;

    await b.put(`/api/cart/items/${pid}`, { quantity: 1 });
    const o2 = (await b.post('/api/orders', { ...ADDRESS, requestKey: key() })).json.order;
    const so2 = o2.parts[0].id;
    await ararat.post(`/api/seller/orders/${so2}/status`, { to: 'confirmed' });
    await ararat.post(`/api/seller/orders/${so2}/status`, { to: 'shipped' });
    const stockBefore = await stockOf(pid);
    const cancel = await b.post(`/api/orders/${o2.id}/sellers/${so2}/cancel`);
    const after2 = (await b.get(`/api/orders/${o2.id}`)).json.order.parts[0];
    report(6, 'Move not allowed', 'Seller moves Placed straight to Delivered; buyer cancels a Shipped order',
      '409, nothing changed',
      jump.status === 409 && after1.status === 'placed' && after1.history.length === 1
        && cancel.status === 409 && after2.status === 'shipped' && after2.history.length === 3 && (await stockOf(pid)) === stockBefore,
      `jump: ${jump.status} (still ${after1.status}, ${after1.history.length} history row); cancel: ${cancel.status} (still ${after2.status}, stock unchanged)`);
  }

  // 7 ─────────────────────────────────────────────── Cancel returns stock
  {
    const pid = await makeProduct(kond, { title: 'Cancel test', stock: 6 });
    const b = await newBuyer(B);
    await b.put(`/api/cart/items/${pid}`, { quantity: 2 });
    const before = await stockOf(pid);
    const o = (await b.post('/api/orders', { ...ADDRESS, requestKey: key() })).json.order;
    const during = await stockOf(pid);
    const r = await b.post(`/api/orders/${o.id}/sellers/${o.parts[0].id}/cancel`);
    const after = await stockOf(pid);
    report(7, 'Cancel returns stock', 'Buyer orders 2 units, then cancels the placed order',
      'Stock goes back up by the ordered quantity',
      r.status === 200 && before === 6 && during === 4 && after === 6,
      `stock ${before} → ${during} after ordering → ${after} after cancelling (status ${r.json?.order?.parts?.[0]?.status})`);
  }

  // 8 ─────────────────────────────────────────────── Foreign keys
  {
    process.env.DB_PATH = 'data/test/shuka.db'; // the same test database the server uses
    const { default: db } = await import('../server/db.js');
    const soId = db.prepare('SELECT id FROM seller_orders LIMIT 1').get().id;
    let err = null;
    try {
      db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, 999999, ?, 100, 1)')
        .run(soId, 'ghost');
    } catch (e) { err = e.message; }
    report(8, 'Foreign keys', 'Insert an order item for product ID 999999, which does not exist, straight into SQLite',
      'Rejected by SQLite', err !== null && /FOREIGN KEY/.test(err),
      err ? `rejected: ${err} (foreign_keys = ${db.pragma('foreign_keys', { simple: true })})` : 'ROW WAS INSERTED');
  }

  // 9 ─────────────────────────────────────────────── Bad upload
  {
    const cats = (await ararat.get('/api/categories')).json.categories;
    const p = (await ararat.post('/api/seller/products', {
      title: 'Upload test', description: 'Product for the upload test.', priceAmd: 1000, stock: 1, categoryId: cats[0].id,
    })).json.product;
    const big = await ararat.upload(`/api/seller/products/${p.id}/images`,
      [{ name: 'huge.jpg', type: 'image/jpeg', data: crypto.randomBytes(30 * 1024 * 1024) }]);
    const exe = await ararat.upload(`/api/seller/products/${p.id}/images`,
      [{ name: 'photo.jpg', type: 'image/jpeg', data: Buffer.concat([Buffer.from('MZ\x90\x00'), crypto.randomBytes(40_000)]) }]);
    const images = (await ararat.get(`/api/seller/products/${p.id}`)).json.product.images.length;
    report(9, 'Bad upload', 'Upload a 30 MB file, then a .exe renamed to photo.jpg',
      'Both rejected with a clear message',
      big.status === 400 && exe.status === 400 && images === 0,
      `30 MB: ${big.status} "${big.json?.error?.message}"; .exe: ${exe.status} "${exe.json?.error?.message}"; images saved: ${images}`);
  }
} finally {
  server.stop();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${'─'.repeat(60)}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}. ${r.name}`);
console.log(`\n${passed} of ${results.length} break-it tests passed.`);
process.exit(passed === results.length && results.length === 9 ? 0 : 1);
