import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { mapDbError } from '../lib/errors.js';

const router = Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      throw mapDbError(error);
    }

    res.json({
      ...data,
      email: req.user.email
    });
  } catch (err) {
    next(err);
  }
});

const patchMeSchema = z
  .object({
    shop_name: z.string().trim().min(1).max(80).optional(),
    language: z.enum(['en', 'hi', 'te']).optional()
  })
  .refine((data) => data.shop_name !== undefined || data.language !== undefined, {
    message: 'At least one field (shop_name, language) is required'
  });

router.patch('/me', requireAuth, validate(patchMeSchema, 'body'), async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('profiles')
      .update(req.body)
      .eq('id', req.user.id)
      .select('*')
      .single();

    if (error) {
      throw mapDbError(error);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
