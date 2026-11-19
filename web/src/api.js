// One way to call the API. Always relative URLs (/api/...), always the session cookie.
// Every failure becomes an ApiError with the server's { code, message, fields, items }.
export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message ?? 'Something went wrong.');
    this.status = status;
    this.code = error.code ?? 'INTERNAL';
    this.fields = error.fields ?? {};
    this.items = error.items ?? [];
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? {
      code: res.status >= 500 ? 'INTERNAL' : 'NETWORK',
      message: 'The server did not answer properly. Try again in a moment.',
    });
  }
  return data;
}

/** Turns an object into ?a=1&b=2, skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Random request key. crypto.randomUUID needs HTTPS or localhost; this works everywhere. */
export function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
