// Small hand-written validators. Each returns an error message string, or null if valid.
// Collect messages per field, then throw badRequest(..., fields) once.
import { badRequest } from './errors.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export const rules = {
  email(v) {
    const s = str(v);
    if (!s) return 'Enter your email.';
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Enter a valid email address.';
    return null;
  },
  password(v) {
    if (typeof v !== 'string' || v.length < 8) return 'Use at least 8 characters.';
    if (v.length > 72) return 'Use at most 72 characters.'; // bcrypt ignores anything past 72 bytes
    return null;
  },
  name(v) {
    const s = str(v);
    if (!s) return 'Enter your name.';
    if (s.length > 100) return 'Use at most 100 characters.';
    return null;
  },
  phone(v) {
    const digits = str(v).replace(/[\s\-()]/g, '');
    if (!digits) return 'Enter a phone number.';
    if (!/^\+?\d{8,15}$/.test(digits)) return 'Enter a valid phone number, e.g. +374 91 123456.';
    return null;
  },
};

/** Runs `checks` ({ field: message|null }) and throws one 400 with every failing field. */
export function assertValid(checks) {
  const fields = Object.fromEntries(Object.entries(checks).filter(([, msg]) => msg));
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
}

export const clean = str;
