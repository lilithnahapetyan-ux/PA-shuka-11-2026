// Test harness: seeds a separate test database, starts the real server on a free port,
// and gives tests a tiny HTTP client that keeps cookies like a browser.
// Your normal data/shuka.db is never touched.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

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
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + path, {
        method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
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
