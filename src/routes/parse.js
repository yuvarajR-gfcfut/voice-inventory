import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { parse as parseRules } from '../lib/nlu/rules.js';
import { callGemini } from '../lib/nlu/gemini.js';
import { matchProduct } from '../lib/nlu/matchProduct.js';
import { AppError } from '../lib/errors.js';

const router = express.Router();

const parseInputSchema = z.object({
  text: z.string().trim().min(1, 'Text is required'),
  lang: z.enum(['en', 'hi', 'te']).optional()
});

// In-memory per-user daily Gemini usage counter
const geminiDailyUsage = new Map();
const DAILY_GEMINI_CAP = 50;

function canUseGemini(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}:${today}`;
  const current = geminiDailyUsage.get(key) || 0;
  if (current >= DAILY_GEMINI_CAP) {
    return false;
  }
  geminiDailyUsage.set(key, current + 1);
  return true;
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parseResult = parseInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(400, 'INVALID_INPUT', 'Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const { text, lang } = parseResult.data;

    let result = null;
    let source = 'rules';

    // 1. Try deterministic rules first
    result = parseRules(text, lang);

    // 2. If rules return null (low confidence), escalate to Gemini (subject to daily cap)
    if (!result) {
      if (canUseGemini(req.user.id)) {
        result = await callGemini(text, lang);
        if (result) {
          source = 'gemini';
        }
      } else {
        console.warn(`[POST /api/parse] User ${req.user.id} exceeded daily Gemini cap`);
      }
    }

    // 3. If still null or action is unknown, return unknown with needsManualEntry
    const isUnknown = !result || result.action === 'unknown' || (result.items.length === 0 && result.action !== 'query_low');
    if (isUnknown) {
      return res.json({
        action: 'unknown',
        items: [],
        lang: result?.lang || lang || 'en',
        confidence: result?.confidence || 0,
        source: result ? source : null,
        needsManualEntry: true
      });
    }

    // 4. For each item, match against user's products
    const enrichedItems = [];
    for (const item of result.items) {
      const matchRes = await matchProduct(item.product_hint, req.user.id, req.db);
      enrichedItems.push({
        product_hint: item.product_hint,
        qty: item.qty,
        unit: item.unit,
        matched: matchRes.matched,
        candidates: matchRes.candidates
      });
    }

    return res.json({
      action: result.action,
      items: enrichedItems,
      lang: result.lang,
      confidence: result.confidence,
      source,
      needsManualEntry: false
    });
  } catch (err) {
    next(err);
  }
});

export default router;
