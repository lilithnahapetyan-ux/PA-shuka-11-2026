// Step 3 checks: accounts, sessions and the error shape, against a real running server.
// Usage: npm run test:auth
import { startServer, client, reporter } from './lib/harness.js';

const server = await startServer();
const { check, finish } = reporter();
const isErrorShape = (j) => j?.error && typeof j.error.code === 'string' && typeof j.error.message === 'string';

try {
  const guest = client(server.base);

  // Error shape and unknown routes
  let r = await guest.get('/api/nope');
  check('unknown endpoint: 404 in the error shape', r.status === 404 && isErrorShape(r.json), r.json?.error?.code);

  r = await guest.post('/api/auth/login', '{bad json');
  check('broken JSON: 400 INVALID_JSON', r.status === 400 && r.json?.error?.code === 'INVALID_JSON');

  // Signed out
  r = await guest.get('/api/me');
  check('GET /me signed out: 401', r.status === 401 && isErrorShape(r.json));
  r = await guest.patch('/api/me', { name: 'X' });
  check('PATCH /me signed out: 401', r.status === 401);

  // Validation: every bad field reported at once
  r = await guest.post('/api/auth/register', { email: 'nope', password: '123', name: '', phone: 'abc' });
  const f = r.json?.error?.fields ?? {};
  check('register with bad input: 400 with a message per field',
    r.status === 400 && ['email', 'password', 'name', 'phone'].every((k) => typeof f[k] === 'string'),
    Object.keys(f).join(', '));

  // Register
  const alice = client(server.base);
  r = await alice.post('/api/auth/register', {
    email: 'Alice@Example.am', password: 'correct-horse', name: ' Alice ', phone: '+374 91 123456',
  });
  check('register: 201 with the user', r.status === 201 && r.json?.user?.email === 'Alice@Example.am');
  check('register: name is trimmed', r.json?.user?.name === 'Alice');
  check('register: new user is not a seller', r.json?.user?.isSeller === false && r.json?.user?.storeName === null);
  check('register: password hash never returned', !JSON.stringify(r.json).includes('password'));

  const cookie = r.setCookie.find((c) => c.startsWith('shuka_session='));
  check('session cookie is httpOnly', /httponly/i.test(cookie ?? ''));
  check('session cookie is SameSite=Lax', /samesite=lax/i.test(cookie ?? ''));

  r = await alice.get('/api/me');
  check('GET /me after register: signed in', r.status === 200 && r.json?.user?.name === 'Alice');

  // Duplicate email, different case
  r = await guest.post('/api/auth/register', { email: 'alice@example.AM', password: 'whatever1', name: 'A', phone: '+37491000000' });
  check('register same email in other case: 409 EMAIL_TAKEN', r.status === 409 && r.json?.error?.code === 'EMAIL_TAKEN');

  // Edit profile
  r = await alice.patch('/api/me', { name: 'Alice H.', phone: '+374 93 000111', email: 'hacker@x.am' });
  check('PATCH /me updates name and phone', r.status === 200 && r.json?.user?.name === 'Alice H.' && r.json?.user?.phone === '+374 93 000111');
  check('PATCH /me ignores email', r.json?.user?.email === 'Alice@Example.am');
  r = await alice.patch('/api/me', { phone: '12' });
  check('PATCH /me with a bad phone: 400 on phone', r.status === 400 && typeof r.json?.error?.fields?.phone === 'string');

  // Tampered cookie
  const forger = client(server.base);
  const [payload, sig] = alice.jar.get('shuka_session').split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 1e9 })).toString('base64url');
  forger.jar.set('shuka_session', `${forged}.${sig}`);
  r = await forger.get('/api/me');
  check('edited cookie (uid changed): rejected, 401', r.status === 401);
  forger.jar.set('shuka_session', `${payload}.${sig.slice(0, -2)}xx`);
  r = await forger.get('/api/me');
  check('edited signature: rejected, 401', r.status === 401);

  // Logout
  r = await alice.post('/api/auth/logout');
  check('logout: 204 and cookie cleared', r.status === 204 && !alice.jar.has('shuka_session'));
  r = await alice.get('/api/me');
  check('GET /me after logout: 401', r.status === 401);

  // Login
  r = await alice.post('/api/auth/login', { email: 'alice@example.am', password: 'wrong-password' });
  check('login with wrong password: 401 INVALID_CREDENTIALS', r.status === 401 && r.json?.error?.code === 'INVALID_CREDENTIALS');
  const wrongPw = r.json?.error?.message;
  r = await alice.post('/api/auth/login', { email: 'nobody@example.am', password: 'wrong-password' });
  check('login with unknown email: same answer as wrong password', r.status === 401 && r.json?.error?.message === wrongPw);
  r = await alice.post('/api/auth/login', { email: 'ALICE@example.am', password: 'correct-horse' });
  check('login (email in any case): 200', r.status === 200 && r.json?.user?.name === 'Alice H.');

  // Seeded accounts work
  const seller = client(server.base);
  r = await seller.post('/api/auth/login', { email: 'ararat@shuka.test', password: 'shuka-demo-2026' });
  check('seeded seller can log in and is a seller', r.status === 200 && r.json?.user?.isSeller === true && r.json?.user?.storeName === 'Ararat Tech');

  // Health check (Render uses this to know the service is up)
  r = await guest.get('/api/health');
  check('health endpoint: 200', r.status === 200 && r.json?.ok === true);
} finally {
  server.stop();
}

process.exit(finish());
