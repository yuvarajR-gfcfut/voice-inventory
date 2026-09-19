import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AppError, mapDbError } from '../lib/errors.js';

const router = Router();

/**
 * GET /api/stock/low
 * Returns all active products where current_qty <= low_stock_threshold.
 * Database rows only - zero LLM.
 */
router.get('/low', requireAuth, async (req, res, next) => {
  try {
    const { data: products, error } = await req.db
      .from('products')
      .select('*')
      .eq('owner_id', req.user.id)
      .is('archived_at', null)
      .order('name');

    if (error) throw mapDbError(error);

    const lowStockItems = (products || []).filter(
      (p) => Number(p.current_qty) <= Number(p.low_stock_threshold)
    );

    res.json(lowStockItems);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stock/reorder
 * Returns low-stock products with a computed suggested reorder quantity and days_of_stock_left
 * based on the last 14 days' net consumption from stock_movements.
 * Never routed through Gemini for any number.
 */
router.get('/reorder', requireAuth, async (req, res, next) => {
  try {
    // 1. Fetch active products
    const { data: products, error: prodErr } = await req.db
      .from('products')
      .select('*')
      .eq('owner_id', req.user.id)
      .is('archived_at', null)
      .order('name');

    if (prodErr) throw mapDbError(prodErr);

    const lowProducts = (products || []).filter(
      (p) => Number(p.current_qty) <= Number(p.low_stock_threshold)
    );

    if (lowProducts.length === 0) {
      return res.json([]);
    }

    // 2. Fetch stock movements from past 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const productIds = lowProducts.map((p) => p.id);

    const { data: movements, error: movErr } = await req.db
      .from('stock_movements')
      .select('product_id, type, delta_base, created_at')
      .eq('owner_id', req.user.id)
      .in('product_id', productIds)
      .gte('created_at', fourteenDaysAgo);

    if (movErr) throw mapDbError(movErr);

    // Group outward movements by product
    const usageByProduct = new Map();
    for (const mov of movements || []) {
      const pId = mov.product_id;
      const current = usageByProduct.get(pId) || 0;
      // Count out movements or negative deltas
      if (mov.type === 'out' || Number(mov.delta_base) < 0) {
        usageByProduct.set(pId, current + Math.abs(Number(mov.delta_base)));
      }
    }

    // 3. Compute 14-day consumption and suggested reorder
    const result = lowProducts.map((p) => {
      const currentQty = Number(p.current_qty);
      const threshold = Number(p.low_stock_threshold);
      const totalOut14d = usageByProduct.get(p.id) || 0;
      const dailyUsage = totalOut14d / 14;

      // Safe division: days_of_stock_left is null if daily usage is 0
      const daysOfStockLeft =
        dailyUsage > 0 ? Math.round((currentQty / dailyUsage) * 10) / 10 : null;

      // Suggested reorder: either 14 days buffer or (2 * threshold - currentQty)
      let suggestedQty;
      if (dailyUsage > 0) {
        suggestedQty = Math.max(Math.ceil(dailyUsage * 14), Math.max(1, threshold * 2 - currentQty));
      } else {
        suggestedQty = Math.max(1, Math.ceil(threshold * 2 - currentQty));
      }

      return {
        ...p,
        total_out_14d: Math.round(totalOut14d * 1000) / 1000,
        daily_usage: Math.round(dailyUsage * 1000) / 1000,
        days_of_stock_left: daysOfStockLeft,
        suggested_reorder_qty: suggestedQty
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stock/:productId
 * Returns exact current stock and unit from DB only.
 */
router.get('/:productId', requireAuth, async (req, res, next) => {
  try {
    const { data: product, error } = await req.db
      .from('products')
      .select('id, name, current_qty, base_unit, low_stock_threshold, category')
      .eq('id', req.params.productId)
      .eq('owner_id', req.user.id)
      .is('archived_at', null)
      .single();

    if (error || !product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    }

    res.json(product);
  } catch (err) {
    next(err);
  }
});

export default router;
