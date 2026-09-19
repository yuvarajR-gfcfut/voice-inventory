/**
 * Deterministic Rules-First Parser for StockSathi Inventory Commands.
 * Handles English, Hindi (Latin + Devanagari), and Telugu (Latin + Telugu script).
 * Returns structured output matching schema or null if confidence < 0.8 (escalates to Gemini).
 */

import { parseNumberWord } from '../units.js';

// Canonical unit mapping
const UNIT_CANONICAL = {
  // Bags / Boriyan / Bastalu
  bag: 'bag',
  bags: 'bag',
  bori: 'bag',
  borie: 'bag',
  boriyan: 'bag',
  boriyaan: 'bag',
  basta: 'bag',
  bastalu: 'bag',
  'बोरी': 'bag',
  'बोरियां': 'bag',
  'బస్తా': 'bag',
  'బస్తాలు': 'bag',

  // Quintal
  quintal: 'quintal',
  quintals: 'quintal',
  qtl: 'quintal',

  // Mass: kg, g
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kilolu: 'kg',
  'किलो': 'kg',
  'किग्रा': 'kg',
  'కిలో': 'kg',
  'కిలోలు': 'kg',
  'కిలోల': 'kg',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  gramulu: 'g',
  'ग्राम': 'g',
  'గ్రాములు': 'g',

  // Volume: l, ml
  l: 'l',
  ltr: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  leeter: 'l',
  leeterlu: 'l',
  litrelu: 'l',
  'लीटर': 'l',
  'లీటర్': 'l',
  'లీటర్లు': 'l',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',

  // Packets
  packet: 'packet',
  packets: 'packet',
  pkt: 'packet',
  pkts: 'packet',
  paiket: 'packet',
  packetalu: 'packet',
  packetlu: 'packet',
  'पैकेट': 'packet',
  'प్యాకెట్': 'packet',
  'ప్యాకెట్లు': 'packet',

  // Boxes / Peti / Crate
  box: 'box',
  boxes: 'box',
  peti: 'box',
  petilu: 'box',
  pettelu: 'box',
  dabba: 'box',
  dibbe: 'box',
  carton: 'box',
  cartons: 'box',
  crate: 'box',
  crates: 'box',
  'पेटी': 'box',
  'डिब्बा': 'box',
  'डिब्बे': 'box',
  'పెట్టె': 'box',

  // Bottles
  bottle: 'bottle',
  bottles: 'bottle',
  botal: 'bottle',
  seesalu: 'bottle',
  'बोतल': 'bottle',
  'సీసా': 'bottle',

  // Can / Tin
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',

  // Count: pcs, dozen
  pcs: 'pcs',
  pc: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  tukde: 'pcs',
  nagulu: 'pcs',
  'पीस': 'pcs',
  'ముక్కలు': 'pcs',
  dozen: 'dozen',
  dozens: 'dozen',
  darjan: 'dozen',
  darzan: 'dozen',
  dajan: 'dozen',
  dajanu: 'dozen',
  dajanla: 'dozen',
  'दर्जन': 'dozen',
  'డజను': 'dozen',
  'డజన్': 'dozen'
};

// Sorted unit keys (longest first to avoid partial prefix collisions)
const SORTED_UNIT_KEYS = Object.keys(UNIT_CANONICAL).sort((a, b) => b.length - a.length);

// Action triggers across languages
const ACTION_RULES = [
  // Query stock
  {
    action: 'query_stock',
    patterns: [
      /how\s+much\s+(?:stock\s+)?(?:is\s+)?(?:left|remaining|available)/i,
      /how\s+(?:much|many)\s+/i,
      /what\s+is\s+the\s+stock\s+(?:of)?/i,
      /check\s+(?:the\s+)?stock\s+(?:of)?/i,
      /stock\s+check\s+(?:karo|chey)?/i,
      /kitna\s+(?:stock\s+)?(?:bacha|pada|hai)/i,
      /kya\s+stock\s+hai/i,
      /kitna\s+hai/i,
      /stock\s+kitna\s+hai/i,
      /entha\s+(?:stock\s+)?(?:undi|migilindi|unnai|undho)/i,
      /unnada/i,
      /enni\s+unnai/i,
      /ఎంత\s+ఉంది/i,
      /ఎంత\s+మిగిలింది/i,
      /ఎన్ని\s+ఉన్నాయి/i,
      /कितना\s+बचा/i,
      /कितना\s+है/i
    ]
  },
  // Query low stock
  {
    action: 'query_low',
    patterns: [
      /low\s+stock/i,
      /running\s+low/i,
      /what\s+is\s+low/i,
      /items?\s+running\s+out/i,
      /out\s+of\s+stock/i,
      /khatam\s+hone\s+wala/i,
      /kya\s+khatam\s+ho\s+raha\s+hai/i,
      /kam\s+(?:stock|maal)/i,
      /takuva\s+(?:unna\s+)?stock/i,
      /takkuva\s+(?:unna\s+)?stock/i,
      /ayipotundi/i,
      /తక్కువ\s+స్టాక్/i,
      /ఖతమ్\s+అయ్యే/i,
      /खत्म\s+होने\s+वाला/i,
      /कम\s+स्टॉक/i
    ]
  },
  // Adjust stock
  {
    action: 'adjust',
    patterns: [
      /set\s+(?:the\s+)?stock\s+to/i,
      /(?:set|adjust|reset)\s+(?:the\s+)?stock\s+(?:of\s+)?/i,
      /set\s+(?:stock\s+)?to/i,
      /adjust\s+(?:stock\s+)?to/i,
      /reset\s+(?:stock\s+)?to/i,
      /count\s+is/i,
      /barabar\s+karo/i,
      /set\s+karo/i,
      /stock\s+fix\s+karo/i,
      /sari\s+(?:chey|cheyyi)/i,
      /set\s+chey/i,
      /बराबर\s+करो/i,
      /सेट\s+करो/i,
      /సరి\s+చెయ్యి/i,
      /సెట్\s+చెయ్యి/i
    ]
  },
  // Inward stock (In)
  {
    action: 'in',
    patterns: [
      /\b(?:received|receive|added|add|got|brought|bring|bought|buy|incoming|restock|restocked)\b/i,
      /\b(?:aa\s+gaya|aa\s+gaye|aa\s+gayi|aaya\s+hai|aaye\s+hain|aaya|aaye|aayi)\b/i,
      /\b(?:mil\s+gaya|mil\s+gaye|mil\s+gayi|mila|mili|mile)\b/i,
      /\b(?:laaya|laaye|laayi|le\s+aaya|le\s+aaye|khareeda|khareede|khareedi)\b/i,
      /\b(?:add\s+karo|daalo|dal\s+do|jodo)\b/i,
      /\b(?:vachindi|vachindhi|vachayi|vachina|vachaindi)\b/i,
      /\b(?:teesuko|teesukunnamu|teesukunnam|thesukunna|konna|konnamu|konnam|konesam)\b/i,
      /\b(?:cherchandi|add\s+chey|add\s+cheyyi|dhorikindi)\b/i,
      /(?:आया|आई|आए|आ\s+गया|आ\s+गए|आ\s+गई|मिला|मिली|मिले|लाया|लाए|खरीदा|खरीदे|डालो|जोड़ो|ऐड\s+करो)/i,
      /(?:వచ్చింది|వచ్చాయి|వచ్చిన|తీసుకున్నాం|కొన్నాం|చేర్చండి|యాడ్\s+చెయ్యి)/i
    ]
  },
  // Outward stock (Out)
  {
    action: 'out',
    patterns: [
      /\b(?:sold|sell|used|use|gave|give|reduce|reduced|taken|take|outgoing|dispatch|dispatched)\b/i,
      /\b(?:bik\s+gaya|bik\s+gaye|bik\s+gayi|bika|biki|becha|beche|bechi)\b/i,
      /\b(?:de\s+do|de\s+diya|de\s+diye|diya|diye|diyi)\b/i,
      /\b(?:nikala|nikalo|kam\s+karo|ghata\s+do|chala\s+gaya|gaya|gaye)\b/i,
      /\b(?:ammamu|ammesam|ammindi|ammadam|amminamu|amminavi)\b/i,
      /\b(?:ichamu|icham|ichindi|poyindi|theeyandi|theeyi|tagginchandi)\b/i,
      /(?:बेचा|बेचे|बेची|बिका|बिक\s+गया|बिके|दिया|दिए|दे\s+दो|निकाला|निकालो|कम\s+करो)/i,
      /(?:అమ్మాము|అమ్మేసాం|అమ్మింది|ఇచ్చాము|ఇచ్చాం|పోయింది|తీయండి)/i
    ]
  }
];

// Filler / stop words to prune from product hints
const STOP_WORDS = new Set([
  // English
  'of', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'left', 'for', 'please', 'to', 'in', 'stock',
  // Hindi
  'ka', 'ki', 'ke', 'ko', 'se', 'hai', 'hain', 'tha', 'the', 'thi', 'aur', 'karo', 'bhi',
  'का', 'की', 'के', 'को', 'से', 'है', 'हैं', 'था', 'थी', 'थे', 'और', 'करो',
  // Telugu
  'lo', 'ki', 'ku', 'gurinchi', 'yokka', 'undi', 'unnai', 'anu', 'mariyu', 'chey', 'cheyyi',
  'లో', 'కి', 'కు', 'మరియు', 'యొక్క'
]);

/**
 * Detect language based on script or keywords.
 * @param {string} text
 * @param {string} [hint]
 * @returns {'en'|'hi'|'te'}
 */
export function detectLanguage(text, hint) {
  if (hint && ['en', 'hi', 'te'].includes(hint.toLowerCase())) {
    return hint.toLowerCase();
  }

  // Devanagari script
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  // Telugu script
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';

  const lower = text.toLowerCase();

  // Telugu distinctive words
  if (/\b(?:vachindi|vachayi|vachina|ammamu|ammesam|ammindi|entha|migilindi|undi|unnai|unnada|biyyam|pappu|guddu|konna|teesuko|mariyu|sagam|dajan)\b/i.test(lower)) {
    return 'te';
  }

  // Hindi distinctive words
  if (/\b(?:aa\s+gaya|aa\s+gaye|aa\s+gayi|aaya|aaye|aayi|mila|mili|mile|bika|biki|becha|beche|diya|diye|de\s+do|kitna|bacha|chawal|cheeni|aata|aur|karo|bori|peti|aadha|dedh|dhai)\b/i.test(lower)) {
    return 'hi';
  }

  return 'en';
}

/**
 * Identifies the action and removes the matched action substring from text.
 * @param {string} text
 * @returns {{ action: string, cleanText: string } | null}
 */
function extractAction(text) {
  for (const rule of ACTION_RULES) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match) {
        // Replace matched pattern with a single space
        const clean = text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
        return {
          action: rule.action,
          cleanText: clean
        };
      }
    }
  }
  return null;
}

/**
 * Parses an individual item clause (e.g. "2 bags sugar", "5 packet refined oil", "sugar").
 * @param {string} clause
 * @param {'en'|'hi'|'te'} lang
 * @param {string} action
 * @returns {{ product_hint: string, qty: number|null, unit: string|null } | null}
 */
function parseItemClause(clause, lang, action) {
  const trimmed = clause.trim();
  if (!trimmed) return null;

  // Handle queries where quantity and unit are not expected
  if (action === 'query_stock' || action === 'query_low') {
    const hint = cleanProductHint(trimmed);
    if (!hint && action === 'query_stock') return null;
    return {
      product_hint: hint || 'all',
      qty: null,
      unit: null
    };
  }

  let working = trimmed;
  let detectedQty = null;
  let detectedUnit = null;

  // 1. Try finding a digit number (e.g. 2, 5, 2.5, 0.5)
  const digitMatch = working.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digitMatch) {
    const val = Number(digitMatch[1]);
    if (Number.isFinite(val) && val > 0) {
      detectedQty = val;
      // Remove the digit match
      working = (working.slice(0, digitMatch.index) + ' ' + working.slice(digitMatch.index + digitMatch[0].length)).trim();
    }
  }

  // 2. If no digit found, try parsing number words (e.g. "two and a half", "dedh", "teen", "rendu")
  if (detectedQty === null) {
    // Check combinations of up to 4 words from the start of the clause
    const words = working.split(/\s+/);
    for (let len = Math.min(words.length, 4); len >= 1; len--) {
      const candidatePhrase = words.slice(0, len).join(' ');
      const val = parseNumberWord(candidatePhrase, lang);
      if (val !== null && val > 0) {
        detectedQty = val;
        working = words.slice(len).join(' ').trim();
        break;
      }
    }
  }

  // 3. Detect Unit from the remaining clause
  // Iterate through SORTED_UNIT_KEYS to match units
  for (const uKey of SORTED_UNIT_KEYS) {
    // Match as whole word or with standard boundary
    const regex = new RegExp(`(?:^|\\s)${escapeRegex(uKey)}(?:$|\\s)`, 'i');
    if (regex.test(working)) {
      detectedUnit = UNIT_CANONICAL[uKey];
      // Remove matched unit from working string
      working = working.replace(regex, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // 4. Extract product hint from the remaining text
  if (action === 'adjust') {
    working = working.replace(/\bto\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  const productHint = cleanProductHint(working);

  if (!productHint) {
    return null;
  }

  return {
    product_hint: productHint,
    qty: detectedQty,
    unit: detectedUnit
  };
}

/**
 * Cleans product hint by stripping stop words and punctuation.
 * @param {string} str
 * @returns {string}
 */
function cleanProductHint(str) {
  if (!str) return '';

  return str
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // Strip punctuation, preserving letters, vowel marks (matras), and digits
    .split(/\s+/)
    .filter((w) => {
      const clean = w.toLowerCase().trim();
      return clean && !STOP_WORDS.has(clean) && clean.length > 0;
    })
    .join(' ')
    .trim();
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a sentence into a structured inventory command using deterministic rules.
 * Returns null if confidence is low (<0.8), triggering fallback to Gemini.
 *
 * @param {string} sentence
 * @param {string} [langHint]
 * @returns {{
 *   action: "in"|"out"|"adjust"|"query_stock"|"query_low"|"unknown",
 *   items: Array<{ product_hint: string, qty: number|null, unit: string|null }>,
 *   lang: "en"|"hi"|"te",
 *   confidence: number
 * } | null}
 */
export function parse(sentence, langHint = null) {
  if (!sentence || typeof sentence !== 'string') {
    return null;
  }

  const trimmed = sentence.trim();
  if (!trimmed) {
    return null;
  }

  const lang = detectLanguage(trimmed, langHint);

  // 1. Extract action from sentence
  const actionResult = extractAction(trimmed);
  if (!actionResult) {
    // Could not resolve action with high confidence -> escalate to Gemini
    return null;
  }

  const { action, cleanText } = actionResult;

  // Handle Query Low Stock (often has no items)
  if (action === 'query_low') {
    return {
      action: 'query_low',
      items: [],
      lang,
      confidence: 0.95
    };
  }

  // 2. Split multi-item clauses on conjunctions ("and", "aur", "mariyu", ",", "+")
  const splitRegex = /\s*(?:,\s*|\band\b|\baur\b|\bmariyu\b|\bమరియు\b|\bऔर\b|\+)\s*/i;
  const rawClauses = cleanText
    .split(splitRegex)
    .map((c) => c.trim())
    .filter(Boolean);

  if (rawClauses.length === 0) {
    return null;
  }

  const items = [];

  for (const clause of rawClauses) {
    const item = parseItemClause(clause, lang, action);
    if (item && item.product_hint) {
      // For in/out/adjust: ensure valid qty and unit are present
      if (['in', 'out', 'adjust'].includes(action)) {
        if (typeof item.qty === 'number' && item.qty > 0 && item.unit) {
          items.push(item);
        }
      } else {
        // Query stock: product_hint is sufficient
        items.push(item);
      }
    }
  }

  // If no items resolved with full qty & unit for in/out/adjust, return null (escalate to Gemini)
  if (items.length === 0) {
    return null;
  }

  return {
    action,
    items,
    lang,
    confidence: 0.95
  };
}

export default {
  parse,
  detectLanguage
};
