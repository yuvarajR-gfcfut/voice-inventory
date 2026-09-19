import { AppError } from '../lib/errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : source;
        if (!details[path]) {
          details[path] = issue.message;
        }
      }
      return next(new AppError(400, 'INVALID_INPUT', 'Validation failed', details));
    }
    req[source] = result.data;
    next();
  };
}
