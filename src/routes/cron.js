import { Router } from 'express';
import { adminClient } from '../lib/supabase.js';
import { AppError, mapDbError } from '../lib/errors.js';
import { CRON_SECRET } from '../config.js';

const router = Router();

router.get('/cron/keepalive', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedSecret = CRON_SECRET || process.env.CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Unauthorized cron request');
    }

    const { error } = await adminClient()
      .from('profiles')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      throw mapDbError(error);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
