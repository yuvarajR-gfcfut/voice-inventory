import { AppError, mapDbError } from '../lib/errors.js';

export function errorHandler(err, req, res, next) {
  let appError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err?.type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
  } else if (err?.type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_INPUT', 'Malformed JSON payload');
  } else if (err?.code && typeof err.code === 'string' && (err.code.length === 5 || err.message)) {
    appError = mapDbError(err);
  } else if (err?.status && typeof err.status === 'number') {
    appError = new AppError(err.status, err.code || 'ERROR', err.message || 'Error');
  } else {
    appError = new AppError(500, 'INTERNAL', 'Internal server error');
  }

  const errorLog = {
    level: 'error',
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    status: appError.status,
    code: appError.code,
    message: appError.message
  };

  if (appError.details !== undefined) {
    errorLog.details = appError.details;
  }

  console.error(JSON.stringify(errorLog));

  const responseBody = {
    error: {
      code: appError.code,
      message: appError.message
    }
  };

  if (appError.details !== undefined) {
    responseBody.error.details = appError.details;
  }

  res.status(appError.status).json(responseBody);
}
