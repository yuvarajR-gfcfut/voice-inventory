import { AppError } from '../lib/errors.js';
import { userClient } from '../lib/supabase.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const jwt = authHeader.slice(7).trim();
    if (!jwt) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const db = userClient(jwt);
    const { data, error } = await db.auth.getClaims(jwt);

    if (error || !data?.claims?.sub) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
    }

    const claims = data.claims;
    req.user = {
      id: claims.sub,
      email: claims.email
    };
    req.db = db;

    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
  }
}
