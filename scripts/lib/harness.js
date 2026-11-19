// Test harness: seeds a separate test database, starts the real server on a free port,
// and gives tests a tiny HTTP client that keeps cookies like a browser.
// Your normal data/shuka.db is never touched.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';

const TEST_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  DB_PATH: 'data/test/shuka.db',
  UPLOADS_DIR: 'data/test/uploads',
};

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer() {
  const seed = spawnSync('node', ['scripts/seed.js'], { env: TEST_ENV, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error(`seed failed:\n${seed.stderr}`);

  const port = await freePort();
  const proc = spawn('node', ['server/index.js'], { env: { ...TEST_ENV, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));

  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) throw new Error(`server did not start:\n${log}`);
  }
  return { base, stop: () => proc.kill(), log: () => log };
}

/** A client with its own cookie jar, like one browser window. */
export function client(base) {
  const jar = new Map();
  return {
    jar,
    async request(method, path, body) {
      const headers = {};
      const isForm = body instanceof FormData;
      if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + path, {
        method, headers,
        body: body === undefined || isForm ? body : (typeof body === 'string' ? body : JSON.stringify(body)),
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const [k, v] = pair.split('=');
        const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim())) || v === '';
        if (expired) jar.delete(k); else jar.set(k, v);
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: res.status, json, headers: res.headers, setCookie: res.headers.getSetCookie() };
    },
    get(p) { return this.request('GET', p); },
    post(p, b) { return this.request('POST', p, b); },
    patch(p, b) { return this.request('PATCH', p, b); },
    put(p, b) { return this.request('PUT', p, b); },
    del(p) { return this.request('DELETE', p); },
    /** Multipart upload: files = [{ name, type, data: Buffer }] sent in the "images" field. */
    upload(p, files) {
      const form = new FormData();
      for (const f of files) form.append('images', new Blob([f.data], { type: f.type }), f.name);
      return this.request('POST', p, form);
    },
  };
}

/** PASS/FAIL printer with a final summary. */
export function reporter() {
  let failed = 0;
  return {
    check(label, ok, detail = '') {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
      if (!ok) failed++;
    },
    finish() {
      console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
      return failed === 0 ? 0 : 1;
    },
  };
}

// ---- Shared helpers for order tests -------------------------------------------------

export const DEMO_PASSWORD = 'shuka-demo-2026';

export const ADDRESS = {
  recipient: 'Test Buyer', phone: '+374 91 555555', region: 'Yerevan', city: 'Yerevan',
  street: 'Abovyan 10', apartment: '5', note: 'Ring twice',
};

/** A client logged in as one of the seeded demo accounts. */
export async function loginAs(base, email) {
  const c = client(base);
  const r = await c.post('/api/auth/login', { email, password: DEMO_PASSWORD });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status}`);
  return c;
}

/** A brand-new registered buyer. */
let buyerCounter = 0;
export async function newBuyer(base, tag = 'buyer') {
  const c = client(base);
  const n = `${tag}${++buyerCounter}-${Date.now()}`;
  const r = await c.post('/api/auth/register', { email: `${n}@shuka.test`, password: 'buyer-pass-1', name: `Buyer ${n}`, phone: '+374 91 000000' });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.json)}`);
  return c;
}

/** Creates and publishes a product (with one photo) as `seller`. Returns its id. */
export async function makeProduct(seller, { title, priceAmd = 10000, stock = 10, categorySlug = 'home-kitchen' }) {
  const { default: sharp } = await import('sharp');
  const cats = (await seller.get('/api/categories')).json.categories;
  const categoryId = cats.find((c) => c.slug === categorySlug).id;
  const r = await seller.post('/api/seller/products', {
    title, description: `Test product: ${title}.`, priceAmd, stock, categoryId,
  });
  if (r.status !== 201) throw new Error(`create product failed: ${JSON.stringify(r.json)}`);
  const id = r.json.product.id;
  const img = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#888' } }).jpeg().toBuffer();
  await seller.upload(`/api/seller/products/${id}/images`, [{ name: 'p.jpg', type: 'image/jpeg', data: img }]);
  const pub = await seller.patch(`/api/seller/products/${id}`, { isPublished: true });
  if (pub.status !== 200) throw new Error(`publish failed: ${JSON.stringify(pub.json)}`);
  return id;
}

export const key = () => `test-${crypto.randomUUID()}`;
