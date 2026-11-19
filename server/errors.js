// One error shape for the whole API: { "error": { "code", "message" } }
// Validation errors also carry `fields`, so the UI can show a message next to each input:
// { "error": { "code": "VALIDATION", "message": "...", "fields": { "email": "..." } } }
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new ApiError(400, 'VALIDATION', message, fields);
export const unauthorized = (message = 'Please log in.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to do this.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new ApiError(409, code, message);

// Express error handler: the last middleware. Turns anything thrown into the shape above.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    const body = { code: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json({ error: body });
  }
  // Errors from express.json(): broken JSON or a body over the size limit.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large.' } });
  }
  // Anything else is a bug: log it, but never leak details to the client.
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}
