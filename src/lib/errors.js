export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function mapDbError(error) {
  if (!error) {
    return new AppError(500, 'INTERNAL', 'Internal server error');
  }

  if (error instanceof AppError) {
    return error;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const details = typeof error.details === 'string' ? error.details : '';

  if (message.includes('INSUFFICIENT_STOCK')) {
    let availDetails = details;
    if (!availDetails && message.includes('available=')) {
      availDetails = message.slice(message.indexOf('available='));
    }
    return new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock', availDetails || undefined);
  }

  if (message.includes('PRODUCT_NOT_FOUND')) {
    return new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  if (message.includes('MOVEMENT_NOT_FOUND')) {
    return new AppError(404, 'MOVEMENT_NOT_FOUND', 'Movement not found');
  }

  if (message.includes('PRODUCT_ARCHIVED')) {
    return new AppError(409, 'PRODUCT_ARCHIVED', 'Product is archived');
  }

  if (message.includes('INVALID_UNIT')) {
    return new AppError(400, 'INVALID_UNIT', 'Invalid unit');
  }

  if (message.includes('INVALID_QTY')) {
    return new AppError(400, 'INVALID_QTY', 'Invalid quantity');
  }

  if (message.includes('INVALID_TYPE')) {
    return new AppError(400, 'INVALID_TYPE', 'Invalid type');
  }

  if (message.includes('NO_CHANGE')) {
    return new AppError(400, 'NO_CHANGE', 'No change');
  }

  if (message.includes('ALREADY_UNDONE')) {
    return new AppError(409, 'ALREADY_UNDONE', 'Movement already undone');
  }

  if (message.includes('CANNOT_UNDO_AN_UNDO')) {
    return new AppError(409, 'CANNOT_UNDO_AN_UNDO', 'Cannot undo an undo movement');
  }

  if (message.includes('NOT_AUTHENTICATED')) {
    return new AppError(401, 'NOT_AUTHENTICATED', 'Not authenticated');
  }

  // SQLSTATE codes
  if (code === '23505') {
    return new AppError(409, 'DUPLICATE', 'Duplicate record');
  }

  if (code === '42501') {
    return new AppError(403, 'FORBIDDEN', 'Access forbidden');
  }

  if (code === '23514' || code === '22P02' || code === '23503') {
    return new AppError(400, 'INVALID_INPUT', 'Invalid input');
  }

  return new AppError(500, 'INTERNAL', 'Internal server error');
}
