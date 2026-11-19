// Accounts: POST /auth/register, POST /auth/login, POST /auth/logout, GET /me, PATCH /me
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { conflict, ApiError } from '../errors.js';
import { rules, assertValid, clean } from '../validate.js';
import { setSessionCookie, clearSessionCookie, publicUser, requireAuth } from '../auth.js';

const router = Router();
const BCRYPT_COST = 10;
// Compared against when the email does not exist, so a wrong email and a wrong
// password take the same time and give the same answer (no account guessing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)'
);

// POST /auth/register — anyone
router.post('/auth/register', async (req, res) => {
  const { email, password, name, phone } = req.body ?? {};
  assertValid({
    email: rules.email(email),
    password: rules.password(password),
    name: rules.name(name),
    phone: rules.phone(phone),
  });

  // Hash before touching the database: slow work stays outside any write.
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  let id;
  try {
    id = insertUser.run(clean(email), hash, clean(name), clean(phone)).lastInsertRowid;
  } catch (e) {
    // The UNIQUE constraint is the real check, so two simultaneous sign-ups can't both win.
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
        email: 'An account with this email already exists.',
      });
    }
    throw e;
  }
  setSessionCookie(res, Number(id));
  res.status(201).json({ user: publicUser(findById.get(id)) });
});

// POST /auth/login — anyone
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = typeof email === 'string' ? findByEmail.get(email.trim()) : undefined;
  const ok = await bcrypt.compare(typeof password === 'string' ? password : '', user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
  }
  setSessionCookie(res, user.id);
  res.json({ user: publicUser(user) });
});

// POST /auth/logout — anyone (logging out twice is not an error)
router.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// GET /me — signed in
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PATCH /me — signed in. Only name and phone can change.
router.patch('/me', requireAuth, (req, res) => {
  const body = req.body ?? {};
  const checks = {};
  if ('name' in body) checks.name = rules.name(body.name);
  if ('phone' in body) checks.phone = rules.phone(body.phone);
  assertValid(checks);
  if (!('name' in body) && !('phone' in body)) {
    throw new ApiError(400, 'VALIDATION', 'Send name and/or phone to update.');
  }

  db.prepare(`
    UPDATE users SET
      name  = COALESCE(?, name),
      phone = COALESCE(?, phone)
    WHERE id = ?`
  ).run('name' in body ? clean(body.name) : null, 'phone' in body ? clean(body.phone) : null, req.user.id);

  res.json({ user: publicUser(findById.get(req.user.id)) });
});

export default router;
