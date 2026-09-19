import { Router } from 'express';
import { adminClient } from '../lib/supabase.js';

const router = Router();

router.get('/health', async (req, res) => {
  let db = false;
  try {
    const { error } = await adminClient()
      .from('profiles')
      .select('id', { head: true, count: 'exact' });
    db = !error;
  } catch {
    db = false;
  }

  const region = process.env.VERCEL_REGION ?? 'local';
  const time = new Date().toISOString();

  const body = {
    status: db ? 'ok' : 'error',
    db,
    region,
    time
  };

  if (!db) {
    return res.status(503).json(body);
  }

  return res.status(200).json(body);
});

export default router;
