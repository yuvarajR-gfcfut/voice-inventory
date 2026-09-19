/**
 * Product matcher for NLU hints.
 * Checks product_aliases first (exact, case-insensitive).
 * Then matches against products.name using trigram similarity.
 * Returns: { matched: product | null, candidates: product[] }
 * Multiple close candidates indicates ambiguity (matched = null).
 */

function getTrigrams(str) {
  const padded = `  ${str.toLowerCase().trim()} `;
  const trigrams = new Set();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;

  // Word substring containment bonus
  if (s1.includes(s2) || s2.includes(s1)) {
    const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    return Math.max(ratio, 0.75);
  }

  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  let matches = 0;
  for (const tri of t1) {
    if (t2.has(tri)) matches++;
  }
  const union = t1.size + t2.size - matches;
  return union === 0 ? 0 : matches / union;
}

/**
 * Match a product hint to a user's inventory.
 *
 * @param {string} productHint
 * @param {string} ownerId
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<{ matched: any | null, candidates: any[] }>}
 */
export async function matchProduct(productHint, ownerId, db) {
  if (!productHint || typeof productHint !== 'string' || !productHint.trim()) {
    return { matched: null, candidates: [] };
  }
  if (!ownerId || !db) {
    return { matched: null, candidates: [] };
  }

  const cleanHint = productHint.trim().toLowerCase();

  try {
    // 1. Check product_aliases first (exact, case-insensitive)
    const { data: aliases, error: aliasErr } = await db
      .from('product_aliases')
      .select('product_id, alias, products(*)')
      .eq('owner_id', ownerId)
      .ilike('alias', cleanHint)
      .limit(1);

    if (!aliasErr && Array.isArray(aliases) && aliases.length > 0 && aliases[0]?.products) {
      const prod = aliases[0].products;
      if (!prod.archived_at) {
        return {
          matched: prod,
          candidates: [prod]
        };
      }
    }

    // 2. Exact match on products.name (case-insensitive)
    const { data: exactList, error: exactErr } = await db
      .from('products')
      .select('*')
      .eq('owner_id', ownerId)
      .is('archived_at', null)
      .ilike('name', cleanHint)
      .limit(1);

    if (!exactErr && Array.isArray(exactList) && exactList.length > 0) {
      const prod = exactList[0];
      return {
        matched: prod,
        candidates: [prod]
      };
    }

    // 3. Trigram similarity on active products
    const { data: allProducts, error: prodErr } = await db
      .from('products')
      .select('*')
      .eq('owner_id', ownerId)
      .is('archived_at', null);

    if (prodErr || !Array.isArray(allProducts) || allProducts.length === 0) {
      return { matched: null, candidates: [] };
    }

    const scored = allProducts.map((prod) => ({
      product: prod,
      score: calculateSimilarity(cleanHint, prod.name)
    }));

    const relevant = scored
      .filter((item) => item.score >= 0.3)
      .sort((a, b) => b.score - a.score);

    if (relevant.length === 0) {
      return { matched: null, candidates: [] };
    }

    const top = relevant[0];
    const second = relevant[1];
    const topCandidates = relevant.slice(0, 3).map((r) => r.product);

    // Decisive winner check:
    // Score is high (>= 0.65) and significantly ahead of second candidate (diff >= 0.18)
    if (top.score >= 0.65 && (!second || (top.score - second.score >= 0.18))) {
      return {
        matched: top.product,
        candidates: topCandidates
      };
    }

    // Multiple close candidates -> ambiguous
    return {
      matched: null,
      candidates: topCandidates
    };
  } catch (err) {
    console.error('[matchProduct] Error matching product:', err);
    return { matched: null, candidates: [] };
  }
}

export default {
  matchProduct,
  calculateSimilarity
};
