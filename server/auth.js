// Sessions as a signed, httpOnly cookie: no sessions table needed (the brief has exactly ten).
// Cookie value: base64url(JSON {uid, exp}) + "." + HMAC-SHA256 signature.
// The server trusts the cookie only if the signature matches, so it cannot be forged or edited.
// Trade-off: a stolen cookie works until it expires; logout clears it from the browser.
import crypto from 'node:crypto';
import db from './db.js';
import { IS_PROD, SESSION_SECRET, SESSION_DAYS } from './config.js';
import { unauthorized, forbidden } from './errors.js';

export const COOKIE_NAME = 'shuka_session';

const sign = (data) => crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');

export function setSessionCookie(res, userId) {
  const exp = Date.now() + SESSION_DAYS * 24 * 3600_000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,          // JavaScript in the page cannot read it
    sameSite: 'lax',         // not sent on cross-site POSTs (basic CSRF protection)
    secure: IS_PROD,         // HTTPS only in production
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600_000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
}

function readSession(value) {
  if (typeof value !== 'string') return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isInteger(uid) && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

const userById = db.prepare(
  'SELECT id, email, name, phone, store_name, created_at FROM users WHERE id = ?'
);

/** API shape of a user. Never includes password_hash. */
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    storeName: u.store_name,
    isSeller: u.store_name !== null,
    createdAt: u.created_at,
  };
}

/** Runs on every request: sets req.user to the signed-in user, or null. */
export function loadUser(req, _res, next) {
  const uid = readSession(req.cookies?.[COOKIE_NAME]);
  req.user = uid ? userById.get(uid) ?? null : null;
  next();
}

/** Route guard: 401 when signed out. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Route guard: 401 when signed out, 403 when signed in but not a seller. */
export function requireSeller(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.store_name === null) return next(forbidden('Become a seller first.'));
  next();
}
