// Client-side checks that mirror the server's, so messages appear in the chosen language
// before anything is sent. The server checks everything again; it has the final word.
// Each returns a translation key, or null when the value is fine.
const s = (v) => (typeof v === 'string' ? v.trim() : '');

export const check = {
  required: (v) => (s(v) ? null : 'v.required'),
  email: (v) => (!s(v) ? 'v.required' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(v)) ? null : 'v.email'),
  password: (v) => (typeof v === 'string' && v.length >= 8 && v.length <= 72 ? null : 'v.password'),
  phone: (v) => (!s(v) ? 'v.required' : /^\+?\d{8,15}$/.test(s(v).replace(/[\s\-()]/g, '')) ? null : 'v.phone'),
  title: (v) => (s(v).length >= 3 && s(v).length <= 120 ? null : 'v.title'),
  description: (v) => (s(v).length >= 10 && s(v).length <= 5000 ? null : 'v.description'),
  price: (v) => (/^\d+$/.test(s(String(v))) && Number(v) >= 1 && Number(v) <= 100_000_000 ? null : 'v.price'),
  stock: (v) => (/^\d+$/.test(s(String(v))) && Number(v) <= 100_000 ? null : 'v.stock'),
  storeName: (v) => (s(v).length >= 2 && s(v).length <= 60 ? null : 'v.storeName'),
  review: (v) => (s(v).length >= 3 ? null : 'v.review'),
};

/** Runs { field: errorKey|null } and returns only the failing fields. */
export function collect(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, k]) => k));
}
