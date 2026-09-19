import { z } from 'zod';

export const nluItemSchema = z.object({
  product_hint: z.string().trim().min(1),
  qty: z.number().nullable(),
  unit: z.string().trim().min(1).nullable()
});

export const nluOutputSchema = z.object({
  action: z.enum(['in', 'out', 'adjust', 'query_stock', 'query_low', 'unknown']),
  items: z.array(nluItemSchema),
  lang: z.enum(['en', 'hi', 'te']),
  confidence: z.number().min(0).max(1)
});

/**
 * Validates an object against the NLU output schema.
 * Throws ZodError on mismatch.
 * @param {unknown} obj
 * @returns {z.infer<typeof nluOutputSchema>}
 */
export function validate(obj) {
  return nluOutputSchema.parse(obj);
}

export default {
  nluItemSchema,
  nluOutputSchema,
  validate
};
