import http from 'node:http';
import { HttpError } from '../lib/http-error.js';

/** Builds the uniform error body: { statusCode, error, message, details? }. */
function errorBody(status, message, details) {
  const body = { statusCode: status, error: http.STATUS_CODES[status] ?? 'Error', message };
  if (details !== undefined) body.details = details;
  return body;
}

/** 404 for API paths that match no route. */
export function apiNotFound(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`));
}

/**
 * Express error handler. Known errors keep their status; anything else is a 500 whose
 * details are logged but never sent to the client.
 */
// Express recognizes error handlers by their four parameters, so `_next` must stay.
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof HttpError) {
    ({ status, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    status = err.status;
    message = err.expose ? err.message : (http.STATUS_CODES[status] ?? 'Error');
  }

  if (status >= 500) console.error(`${req.method} ${req.originalUrl}`, err);
  res.status(status).json(errorBody(status, message, details));
}
