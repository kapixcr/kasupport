'use strict';

class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendError(res, error, logger = console) {
  const status = Number(error?.status) || 500;
  if (status >= 500) logger?.error?.(error);

  const payload = {
    error: status >= 500 && !error?.expose ? 'error interno' : (error.message || 'error interno'),
    code: error?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
  };
  if (error?.details !== undefined && (status < 500 || error.expose)) {
    payload.details = error.details;
  }
  return res.status(status).json(payload);
}

function asyncRoute(handler, logger = console) {
  return async function meetingRoute(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (res.headersSent) return next(error);
      return sendError(res, error, logger);
    }
  };
}

module.exports = {
  HttpError,
  asyncRoute,
  sendError,
};
