import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, mapDbError } from '../lib/errors.js';
import { toBase } from '../lib/units.js';

const router = Router();

// All product routes require authentication
router.use(requireAuth);

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).optional().nullable(),
  base_unit: z.enum(['kg', 'l', 'pcs']),
  low_stock_threshold: z.number().min(0).default(0).optional()
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().max(40).optional().nullable(),
    low_stock_threshold: z.number().min(0).optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update must be provided'
  });

const stockMovementSchema = z.object({
  type: z.enum(['in', 'out', 'adjust']),
  qty: z.number().positive(),
  unit: z.string().trim().max(30).optional().nullable(),
  idempotency_key: z.string().trim().min(1)
});

// GET / - List products for user, optional ?archived=true, sorted by name
router.get('/', async (req, res, next) => {
  try {
    let query = req.db.from('products').select('*').order('name');
    if (req.query.archived === 'true') {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) throw mapDbError(error);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /:id - Single product details
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw mapDbError(error);
    if (!data) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST / - Create product
router.post('/', validate(createProductSchema, 'body'), async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('products')
      .insert({
        name: req.body.name,
        category: req.body.category || null,
        base_unit: req.body.base_unit,
        low_stock_threshold: req.body.low_stock_threshold ?? 0
      })
      .select('*')
      .single();

    if (error) throw mapDbError(error);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id - Update product
router.patch('/:id', validate(updateProductSchema, 'body'), async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('products')
      .update(req.body)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw mapDbError(error);
    if (!data) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /:id/archive - Archive product
router.post('/:id/archive', async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('products')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw mapDbError(error);
    if (!data) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /:id/stock - Apply stock movement
router.post('/:id/stock', validate(stockMovementSchema, 'body'), async (req, res, next) => {
  try {
    const { type, qty, unit, idempotency_key } = req.body;

    let qtyBase = qty;
    if (unit) {
      const { data: prod, error: prodErr } = await req.db
        .from('products')
        .select('id, base_unit')
        .eq('id', req.params.id)
        .single();
      if (prodErr || !prod) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');

      const { data: conversions } = await req.db
        .from('unit_conversions')
        .select('unit, factor_to_base')
        .eq('product_id', req.params.id);

      try {
        qtyBase = toBase(qty, unit, prod.base_unit, conversions || []);
      } catch (uErr) {
        throw new AppError(400, 'INVALID_UNIT', uErr.message);
      }
    }

    const { data, error } = await req.db.rpc('apply_stock_movement', {
      p_product_id: req.params.id,
      p_type: type,
      p_qty_base: qtyBase,
      p_input_qty: qty,
      p_input_unit: unit || null,
      p_source: 'manual',
      p_idempotency_key: idempotency_key
    });

    if (error) throw mapDbError(error);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /:id/undo/:movementId - Undo stock movement
router.post('/:id/undo/:movementId', async (req, res, next) => {
  try {
    const { data, error } = await req.db.rpc('undo_stock_movement', {
      p_movement_id: req.params.movementId
    });

    if (error) throw mapDbError(error);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /:id/movements - List movements for product
router.get('/:id/movements', async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('stock_movements')
      .select('*')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw mapDbError(error);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

export default router;
