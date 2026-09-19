import { Router } from 'express';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY
  });
});

export default router;
