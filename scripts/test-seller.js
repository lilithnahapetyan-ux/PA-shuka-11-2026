// Step 5 checks: become a seller, product CRUD, ownership, image uploads (incl. the "Bad upload" break-it test).
// Usage: npm run test:seller
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { startServer, client, reporter } from './lib/harness.js';

const UPLOADS = 'data/test/uploads';
const server = await startServer();
const { check, finish } = reporter();

const photo = (format, color) => sharp({ create: { width: 800, height: 600, channels: 3, background: color } })[format]().toBuffer();
const jpg = (name, data) => ({ name, type: 'image/jpeg', data });
const filesOnDisk = (productId) => {
  const dir = path.join(UPLOADS, 'products', String(productId));
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

try {
  const guest = client(server.base);
  const kiki = client(server.base);
  await kiki.post('/api/auth/register', { email: 'kiki@shuka.test', password: 'kiki-pass-1', name: 'Kiki', phone: '+374 91 111111' });

  // ---- Become a seller
  let r = await guest.post('/api/seller/activate', { storeName: 'X', phone: '+37491111111' });
  check('activate signed out: 401', r.status === 401);
  r = await kiki.get('/api/seller/products');
  check('seller endpoint before activating: 403', r.status === 403 && r.json?.error?.code === 'FORBIDDEN');
  r = await kiki.post('/api/seller/activate', { storeName: '', phone: 'abc' });
  check('activate with bad input: 400 on storeName and phone', r.status === 400 && r.json.error.fields?.storeName && r.json.error.fields?.phone);
  r = await kiki.post('/api/seller/activate', { storeName: 'ARARAT tech', phone: '+374 91 111111' });
  check('store name taken (other case): 409 STORE_NAME_TAKEN', r.status === 409 && r.json.error.code === 'STORE_NAME_TAKEN');
  r = await kiki.post('/api/seller/activate', { storeName: 'Kiki Studio', phone: '+374 91 222222' });
  check('activate: now a seller, active at once', r.status === 200 && r.json.user.isSeller && r.json.user.storeName === 'Kiki Studio' && r.json.user.phone === '+374 91 222222');
  r = await kiki.post('/api/seller/activate', { storeName: 'Another', phone: '+374 91 222222' });
  check('activate twice: 409 ALREADY_SELLER', r.status === 409 && r.json.error.code === 'ALREADY_SELLER');

  // ---- Create product
  const cats = (await guest.get('/api/categories')).json.categories;
  const jewelry = cats.find((c) => c.slug === 'jewelry-accessories').id;
  r = await kiki.post('/api/seller/products', { title: 'ab', description: 'short', priceAmd: 10.5, stock: -1, categoryId: 999 });
  const f = r.json?.error?.fields ?? {};
  check('create with bad input: 400 with every field', r.status === 400 && ['title', 'description', 'priceAmd', 'stock', 'categoryId'].every((k) => f[k]), Object.keys(f).join(', '));
  r = await kiki.post('/api/seller/products', { title: 'Ring', description: 'A ring for you', priceAmd: '15000', stock: 1, categoryId: jewelry });
  check('price as a string "15000": rejected (must be a number)', r.status === 400 && r.json.error.fields?.priceAmd);

  r = await kiki.post('/api/seller/products', {
    title: 'Hammered silver ring', description: 'Hand-hammered sterling silver band, 4 mm wide.', priceAmd: 15000, stock: 4, categoryId: jewelry,
  });
  const product = r.json?.product;
  check('create: 201, starts unpublished with no images', r.status === 201 && product.isPublished === false && product.images.length === 0);
  const pid = product.id;

  r = await kiki.patch(`/api/seller/products/${pid}`, { isPublished: true });
  check('publish with no photos: 409 NEEDS_IMAGE', r.status === 409 && r.json.error.code === 'NEEDS_IMAGE');

  // ---- Uploads
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [
    jpg('one.jpg', await photo('jpeg', '#c0627a')),
    { name: 'two.png', type: 'image/png', data: await photo('png', '#3d5a80') },
    { name: 'three.webp', type: 'image/webp', data: await photo('webp', '#2a9d8f') },
  ]);
  const imgs = r.json?.images ?? [];
  check('upload 3 photos (JPEG, PNG, WebP): 201, positions 0–2', r.status === 201 && imgs.length === 3 && imgs.every((im, i) => im.position === i));
  check('each photo saved as thumb + large on disk (6 files)', filesOnDisk(pid) === 6);
  const thumb = await fetch(server.base + imgs[0].thumb);
  const thumbMeta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
  check('thumbnail is a 400 × 400 webp', thumbMeta.format === 'webp' && thumbMeta.width === 400 && thumbMeta.height === 400);
  const large = await sharp(Buffer.from(await (await fetch(server.base + imgs[0].large)).arrayBuffer())).metadata();
  check('large version keeps its size when smaller than 1200 px (no upscaling)', large.width === 800 && large.height === 600);

  // Break-it test: Bad upload
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [jpg('huge.jpg', crypto.randomBytes(30 * 1024 * 1024))]);
  check('BREAK-IT: 30 MB file rejected with a clear message', r.status === 400 && r.json?.error?.code === 'FILE_TOO_LARGE', r.json?.error?.message);
  const exe = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), crypto.randomBytes(50_000)]);
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [jpg('photo.jpg', exe)]);
  check('BREAK-IT: renamed .exe rejected with a clear message', r.status === 400 && r.json?.error?.code === 'INVALID_IMAGE', r.json?.error?.message);
  check('rejected uploads left no files on disk', filesOnDisk(pid) === 6);

  const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).jpeg().toBuffer();
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [jpg('tiny.jpg', tiny)]);
  check('50 × 50 photo rejected as too small', r.status === 400 && r.json?.error?.code === 'INVALID_IMAGE');
  const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#000' } }).gif().toBuffer();
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [{ name: 'anim.gif', type: 'image/gif', data: gif }]);
  check('GIF rejected (only JPEG, PNG, WebP)', r.status === 400 && r.json?.error?.code === 'INVALID_IMAGE');

  const three = await Promise.all(['#111', '#222', '#333'].map(async (c, i) => jpg(`more${i}.jpg`, await photo('jpeg', c))));
  r = await kiki.upload(`/api/seller/products/${pid}/images`, three);
  check('3 more photos (would be 6): 409 TOO_MANY_IMAGES', r.status === 409 && r.json.error.code === 'TOO_MANY_IMAGES');
  r = await kiki.upload(`/api/seller/products/${pid}/images`, [...three, ...three]);
  check('6 files in one request: 400 TOO_MANY_FILES', r.status === 400 && r.json.error.code === 'TOO_MANY_FILES');
  check('image count still 3', (await kiki.get(`/api/seller/products/${pid}`)).json.product.images.length === 3);

  // Main image
  r = await kiki.put(`/api/seller/products/${pid}/images/${imgs[2].id}/main`);
  check('set main image: chosen photo moves to position 0, others keep order',
    r.status === 200 && r.json.images.map((i) => i.id).join() === [imgs[2].id, imgs[0].id, imgs[1].id].join());

  // Publish and appear publicly
  r = await kiki.patch(`/api/seller/products/${pid}`, { isPublished: true });
  check('publish with photos: 200', r.status === 200 && r.json.product.isPublished === true);
  r = await guest.get('/api/products?q=hammered%20silver');
  check('published product appears in search with its main image',
    r.json.total === 1 && r.json.items[0].image.thumb === imgs[2].thumb && r.json.items[0].seller.storeName === 'Kiki Studio');

  // Edit
  r = await kiki.patch(`/api/seller/products/${pid}`, { title: 'Hammered silver ring, 4 mm', priceAmd: 16500 });
  check('edit title and price: 200', r.status === 200 && r.json.product.title === 'Hammered silver ring, 4 mm' && r.json.product.priceAmd === 16500);
  r = await guest.get(`/api/products/${pid}`);
  check('public product page shows the edit', r.json.product.priceAmd === 16500 && r.json.product.images.length === 3);
  r = await kiki.patch(`/api/seller/products/${pid}`, { stock: 'lots' });
  check('edit with a bad stock: 400, nothing changed', r.status === 400 && (await guest.get(`/api/products/${pid}`)).json.product.stock === 4);
  r = await kiki.patch(`/api/seller/products/${pid}`, {});
  check('edit with nothing to change: 400', r.status === 400);

  // Ownership (hard part #6)
  const ararat = client(server.base);
  await ararat.post('/api/auth/login', { email: 'ararat@shuka.test', password: 'shuka-demo-2026' });
  r = await ararat.patch(`/api/seller/products/${pid}`, { priceAmd: 1 });
  check("another seller edits my product: 404, price unchanged", r.status === 404 && (await guest.get(`/api/products/${pid}`)).json.product.priceAmd === 16500);
  r = await ararat.get(`/api/seller/products/${pid}`);
  check('another seller opens my product in the editor: 404', r.status === 404);
  r = await ararat.upload(`/api/seller/products/${pid}/images`, [jpg('x.jpg', await photo('jpeg', '#fff'))]);
  check('another seller uploads to my product: 404, no files added', r.status === 404 && filesOnDisk(pid) === 6);
  r = await ararat.del(`/api/seller/products/${pid}/images/${imgs[0].id}`);
  check('another seller deletes my photo: 404', r.status === 404);
  const araratList = (await ararat.get('/api/seller/products')).json.items;
  check('seller product list shows only own products (14 for Ararat Tech)', araratList.length === 14 && !araratList.some((p) => p.id === pid));

  // Delete images
  r = await kiki.del(`/api/seller/products/${pid}/images/${imgs[2].id}`);
  check('delete the main photo: next photo becomes main, positions 0–1',
    r.status === 200 && r.json.images.length === 2 && r.json.images[0].id === imgs[0].id && r.json.images.every((im, i) => im.position === i));
  check('deleted photo files removed from disk', filesOnDisk(pid) === 4 && (await fetch(server.base + imgs[2].thumb)).status === 404);
  await kiki.del(`/api/seller/products/${pid}/images/${imgs[1].id}`);
  r = await kiki.del(`/api/seller/products/${pid}/images/${imgs[0].id}`);
  check('delete the last photo of a published product: 409 LAST_IMAGE', r.status === 409 && r.json.error.code === 'LAST_IMAGE');

  // Unpublish
  r = await kiki.patch(`/api/seller/products/${pid}`, { isPublished: false });
  check('unpublish: 200', r.status === 200 && r.json.product.isPublished === false);
  check('unpublished product gone from search and product page',
    (await guest.get('/api/products?q=hammered%20silver')).json.total === 0 && (await guest.get(`/api/products/${pid}`)).status === 404);
  r = await kiki.del(`/api/seller/products/${pid}/images/${imgs[0].id}`);
  check('after unpublishing, the last photo can be deleted', r.status === 200 && r.json.images.length === 0);

  // Dashboard data from the seed
  const table = Object.fromEntries(araratList.map((p) => [p.title, p]));
  check('units sold: earbuds 1, yoga mat 2, power bank 1 (placed counts)',
    table['Wireless earbuds with charging case'].unitsSold === 1 && table['Yoga mat, 6 mm'].unitsSold === 2 && table['Power bank, 20,000 mAh'].unitsSold === 1);
  const kond = client(server.base);
  await kond.post('/api/auth/login', { email: 'kond@shuka.test', password: 'shuka-demo-2026' });
  const kondList = (await kond.get('/api/seller/products')).json.items;
  check('units sold excludes cancelled orders (T-shirt: 0)', kondList.find((p) => p.title === 'Cotton crew-neck T-shirt').unitsSold === 0);
  check('seller list includes unpublished products', kondList.some((p) => p.title === 'Wool beret' && p.isPublished === false));

  r = await ararat.get('/api/seller/overview');
  check('overview: 1 to confirm, 0 to ship, revenue 37,900 ֏ in the last 30 days',
    r.status === 200 && r.json.toConfirm === 1 && r.json.toShip === 0 && r.json.revenueLast30DaysAmd === 37900, JSON.stringify(r.json));
  r = await kiki.get('/api/seller/overview');
  check('overview for a new seller: all zero', r.json.toConfirm === 0 && r.json.revenueLast30DaysAmd === 0);
} finally {
  server.stop();
}

process.exit(finish());
