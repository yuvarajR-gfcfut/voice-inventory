/**
 * Unit normalization and conversion utilities.
 * Pure functions only - fully offline-testable with no DB or network I/O.
 */

export const BASE_UNITS = ['kg', 'l', 'pcs'];

export const DEFAULT_FACTORS = Object.freeze({
  bag: 50,
  quintal: 100,
  dozen: 12,
  pcs: 1,
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001
});

export class UnitError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'UnitError';
    this.code = code;
  }
}

const UNIT_DEFINITIONS = {
  // Mass
  bag: { factor: 50, baseUnit: 'kg', dimension: 'mass' },
  bags: { factor: 50, baseUnit: 'kg', dimension: 'mass' },
  bori: { factor: 50, baseUnit: 'kg', dimension: 'mass' },
  borie: { factor: 50, baseUnit: 'kg', dimension: 'mass' },
  quintal: { factor: 100, baseUnit: 'kg', dimension: 'mass' },
  quintals: { factor: 100, baseUnit: 'kg', dimension: 'mass' },
  qtl: { factor: 100, baseUnit: 'kg', dimension: 'mass' },
  kg: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  kgs: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  kilo: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  kilos: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  kilogram: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  kilograms: { factor: 1, baseUnit: 'kg', dimension: 'mass' },
  g: { factor: 0.001, baseUnit: 'kg', dimension: 'mass' },
  gm: { factor: 0.001, baseUnit: 'kg', dimension: 'mass' },
  gms: { factor: 0.001, baseUnit: 'kg', dimension: 'mass' },
  gram: { factor: 0.001, baseUnit: 'kg', dimension: 'mass' },
  grams: { factor: 0.001, baseUnit: 'kg', dimension: 'mass' },

  // Volume
  l: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  ltr: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  litre: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  litres: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  liter: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  liters: { factor: 1, baseUnit: 'l', dimension: 'volume' },
  ml: { factor: 0.001, baseUnit: 'l', dimension: 'volume' },
  millilitre: { factor: 0.001, baseUnit: 'l', dimension: 'volume' },
  millilitres: { factor: 0.001, baseUnit: 'l', dimension: 'volume' },
  milliliter: { factor: 0.001, baseUnit: 'l', dimension: 'volume' },
  milliliters: { factor: 0.001, baseUnit: 'l', dimension: 'volume' },

  // Count
  pcs: { factor: 1, baseUnit: 'pcs', dimension: 'count' },
  pc: { factor: 1, baseUnit: 'pcs', dimension: 'count' },
  piece: { factor: 1, baseUnit: 'pcs', dimension: 'count' },
  pieces: { factor: 1, baseUnit: 'pcs', dimension: 'count' },
  dozen: { factor: 12, baseUnit: 'pcs', dimension: 'count' },
  dozens: { factor: 12, baseUnit: 'pcs', dimension: 'count' }
};

const BASE_UNIT_DIMENSIONS = {
  kg: 'mass',
  l: 'volume',
  pcs: 'count'
};

const UNRESOLVED_UNITS = new Set([
  'pav',
  'pao',
  'paav',
  'paao',
  'पाव'
]);

/**
 * Converts a quantity from a given unit to its base unit.
 *
 * @param {number} qty - Input quantity
 * @param {string} unit - Input unit
 * @param {string} [baseUnit] - Target base unit ('kg', 'l', 'pcs')
 * @param {Array<{unit: string, factor_to_base: number}>} [overrides=[]] - Per-product conversion overrides
 * @returns {number} Converted quantity in base unit
 */
export function toBase(qty, unit, baseUnit, overrides = []) {
  let effectiveBaseUnit = baseUnit;
  let effectiveOverrides = overrides;

  // If 3rd argument is an array of overrides
  if (Array.isArray(baseUnit)) {
    effectiveOverrides = baseUnit;
    effectiveBaseUnit = undefined;
  }

  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    throw new TypeError(`qty must be a finite number, received ${qty}`);
  }
  if (!unit || typeof unit !== 'string') {
    throw new UnitError('UNKNOWN_UNIT', `Invalid unit: ${unit}`);
  }

  const cleanUnit = unit.trim().toLowerCase();

  // 1. Check per-product overrides FIRST
  if (Array.isArray(effectiveOverrides)) {
    const matched = effectiveOverrides.find(
      (o) => o && o.unit && o.unit.trim().toLowerCase() === cleanUnit
    );
    if (matched) {
      const factor = Number(matched.factor_to_base ?? matched.factor);
      if (Number.isFinite(factor) && factor > 0) {
        return qty * factor;
      }
    }
  }

  // 2. Explicitly guard pav/pao without override
  if (UNRESOLVED_UNITS.has(cleanUnit)) {
    throw new UnitError(
      'UNRESOLVED_UNIT',
      `Unit "${unit}" requires a per-product override (cannot guess 200g vs 250g)`
    );
  }

  // 3. Look up in default definitions
  const def = UNIT_DEFINITIONS[cleanUnit];
  if (!def) {
    throw new UnitError('UNKNOWN_UNIT', `Unknown unit: "${unit}"`);
  }

  // 4. Verify dimension compatibility
  if (effectiveBaseUnit) {
    const cleanBaseUnit = effectiveBaseUnit.trim().toLowerCase();
    const baseDim = BASE_UNIT_DIMENSIONS[cleanBaseUnit];
    if (!baseDim || baseDim !== def.dimension) {
      throw new UnitError(
        'INCOMPATIBLE_UNIT',
        `Cannot convert unit "${unit}" (${def.dimension}) to base unit "${effectiveBaseUnit}" (${baseDim || 'unknown'})`
      );
    }
  }

  return qty * def.factor;
}

/**
 * Converts a quantity from a base unit to a target unit (inverse of toBase).
 *
 * @param {number} qtyBase - Quantity in base unit
 * @param {string} unit - Target unit
 * @param {string} [baseUnit] - Current base unit ('kg', 'l', 'pcs')
 * @param {Array<{unit: string, factor_to_base: number}>} [overrides=[]] - Per-product conversion overrides
 * @returns {number} Converted quantity in target unit
 */
export function fromBase(qtyBase, unit, baseUnit, overrides = []) {
  let effectiveBaseUnit = baseUnit;
  let effectiveOverrides = overrides;

  if (Array.isArray(baseUnit)) {
    effectiveOverrides = baseUnit;
    effectiveBaseUnit = undefined;
  }

  if (typeof qtyBase !== 'number' || !Number.isFinite(qtyBase)) {
    throw new TypeError(`qtyBase must be a finite number, received ${qtyBase}`);
  }
  if (!unit || typeof unit !== 'string') {
    throw new UnitError('UNKNOWN_UNIT', `Invalid unit: ${unit}`);
  }

  const cleanUnit = unit.trim().toLowerCase();

  // 1. Check per-product overrides FIRST
  if (Array.isArray(effectiveOverrides)) {
    const matched = effectiveOverrides.find(
      (o) => o && o.unit && o.unit.trim().toLowerCase() === cleanUnit
    );
    if (matched) {
      const factor = Number(matched.factor_to_base ?? matched.factor);
      if (Number.isFinite(factor) && factor > 0) {
        return qtyBase / factor;
      }
    }
  }

  // 2. Explicitly guard pav/pao without override
  if (UNRESOLVED_UNITS.has(cleanUnit)) {
    throw new UnitError(
      'UNRESOLVED_UNIT',
      `Unit "${unit}" requires a per-product override (cannot guess 200g vs 250g)`
    );
  }

  // 3. Look up in default definitions
  const def = UNIT_DEFINITIONS[cleanUnit];
  if (!def) {
    throw new UnitError('UNKNOWN_UNIT', `Unknown unit: "${unit}"`);
  }

  // 4. Verify dimension compatibility
  if (effectiveBaseUnit) {
    const cleanBaseUnit = effectiveBaseUnit.trim().toLowerCase();
    const baseDim = BASE_UNIT_DIMENSIONS[cleanBaseUnit];
    if (!baseDim || baseDim !== def.dimension) {
      throw new UnitError(
        'INCOMPATIBLE_UNIT',
        `Cannot convert base unit "${effectiveBaseUnit}" (${baseDim || 'unknown'}) to unit "${unit}" (${def.dimension})`
      );
    }
  }

  return qtyBase / def.factor;
}

// ---------------------------------------------------------------------------
// Number Word Dictionaries
// ---------------------------------------------------------------------------

const EN_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  quarter: 0.25,
  'a quarter': 0.25,
  half: 0.5,
  'a half': 0.5,
  'three quarters': 0.75,
  'three fourths': 0.75,
  'one and a half': 1.5,
  'one and half': 1.5,
  'two and a half': 2.5,
  'two and half': 2.5,
  'three and a half': 3.5,
  dozen: 12,
  'a dozen': 12,
  'half a dozen': 6,
  'half dozen': 6,
  pair: 2
};

const HI_WORDS = {
  // Transliterated Latin
  shunya: 0,
  shoonya: 0,
  zero: 0,
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  che: 6,
  chhe: 6,
  chhah: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  no: 9,
  das: 10,
  dus: 10,
  gyarah: 11,
  gyara: 11,
  barah: 12,
  bara: 12,
  terah: 13,
  tera: 13,
  chaudah: 14,
  chauda: 14,
  choudah: 14,
  pandrah: 15,
  pandra: 15,
  solah: 16,
  sola: 16,
  satrah: 17,
  satra: 17,
  atharah: 18,
  athara: 18,
  unnis: 19,
  unnees: 19,
  bees: 20,
  bis: 20,

  // Devanagari
  'शून्य': 0,
  'एक': 1,
  'दो': 2,
  'तीन': 3,
  'चार': 4,
  'पांच': 5,
  'पाँच': 5,
  'छह': 6,
  'छे': 6,
  'सात': 7,
  'आठ': 8,
  'नौ': 9,
  'दस': 10,
  'ग्यारह': 11,
  'बारह': 12,
  'तेरह': 13,
  'चौदह': 14,
  'पंद्रह': 15,
  'सोलह': 16,
  'सत्रह': 17,
  'अठारह': 18,
  'उन्नीस': 19,
  'बीस': 20,

  // Multiples & fractions
  half: 0.5,
  aadha: 0.5,
  adha: 0.5,
  'आधा': 0.5,
  pav: 0.25,
  pao: 0.25,
  paav: 0.25,
  'पाव': 0.25,
  paun: 0.75,
  pauna: 0.75,
  paune: 0.75,
  'पौन': 0.75,
  'पौना': 0.75,
  'पौने': 0.75,
  sawa: 1.25,
  sawai: 1.25,
  'सवा': 1.25,
  dedh: 1.5,
  derh: 1.5,
  'डेढ़': 1.5,
  dhai: 2.5,
  dhaai: 2.5,
  'ढाई': 2.5,
  'one and a half': 1.5,
  'ek aur aadha': 1.5,
  'ek aadha': 1.5,
  'एक और आधा': 1.5,
  'do aur aadha': 2.5,
  'do aadha': 2.5,
  'दो और आधा': 2.5,
  dozen: 12,
  darjan: 12,
  darzan: 12,
  'दर्जन': 12,
  'aadha darjan': 6,
  'आधा दर्जन': 6
};

const TE_WORDS = {
  // Transliterated Latin
  sunna: 0,
  zero: 0,
  okati: 1,
  oka: 1,
  rendu: 2,
  moodu: 3,
  mudu: 3,
  naalugu: 4,
  nalugu: 4,
  aidu: 5,
  ayidu: 5,
  aaru: 6,
  aru: 6,
  yedu: 7,
  edu: 7,
  enimidi: 8,
  tommidi: 9,
  padi: 10,
  padakondu: 11,
  pannendu: 12,
  padamoodu: 13,
  padamudu: 13,
  padanaalugu: 14,
  padanalugu: 14,
  padihenu: 15,
  padahaaru: 16,
  padaharu: 16,
  padihedu: 17,
  paddhenimidi: 18,
  pantommidi: 19,
  iravai: 20,

  // Telugu script
  'సున్న': 0,
  'ఒకటి': 1,
  'ఒక': 1,
  'రెండు': 2,
  'మూడు': 3,
  'నాలుగు': 4,
  'ఐదు': 5,
  'ఆరు': 6,
  'ఏడు': 7,
  'ఎనిమిది': 8,
  'తొమ్మిది': 9,
  'పది': 10,
  'పదకొండు': 11,
  'పన్నెండు': 12,
  'పదమూడు': 13,
  'పద్నాలుగు': 14,
  'పదిహేను': 15,
  'పదహారు': 16,
  'పదిహేడు': 17,
  'పద్దెనిమిది': 18,
  'పంతొమ్మిది': 19,
  'ఇరవై': 20,

  // Multiples & fractions
  half: 0.5,
  sagam: 0.5,
  sagamu: 0.5,
  'సగం': 0.5,
  paavu: 0.25,
  pavu: 0.25,
  'పావు': 0.25,
  muppavu: 0.75,
  'ముప్పావు': 0.75,
  dozen: 12,
  dajan: 12,
  dajanu: 12,
  'డజను': 12,
  'డజన్': 12,
  'oka darjan': 12,
  'ara darjan': 6,
  'అర డజను': 6,
  'one and a half': 1.5,
  okatinara: 1.5,
  'ఒకటిన్నర': 1.5,
  rendunnara: 2.5,
  'రెండున్నర': 2.5,
  moodunnara: 3.5,
  'మూడున్నర': 3.5
};

const LANG_MAPS = {
  en: EN_WORDS,
  hi: HI_WORDS,
  te: TE_WORDS
};

/**
 * Parses a number word in English, Hindi, or Telugu into a number.
 * Covers 0-20 plus common multiples/fractions (dozen, half, quarter/pav).
 * Returns null if unrecognized (never throws).
 *
 * @param {string} word - The word or phrase to parse
 * @param {'en'|'hi'|'te'} [lang] - Language code
 * @returns {number|null} Parsed number or null
 */
export function parseNumberWord(word, lang) {
  if (!word || typeof word !== 'string') {
    return null;
  }

  const clean = word
    .toLowerCase()
    .trim()
    .replace(/[,\-_]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!clean) {
    return null;
  }

  // If already a valid number in string form
  const num = Number(clean);
  if (Number.isFinite(num)) {
    return num;
  }

  // 1. If language is specified, check that language first
  if (lang && LANG_MAPS[lang]) {
    const val = lookupInMap(clean, LANG_MAPS[lang], lang);
    if (val !== null) {
      return val;
    }
  }

  // 2. Check all maps
  for (const [l, map] of Object.entries(LANG_MAPS)) {
    if (l === lang) continue; // Already checked
    const val = lookupInMap(clean, map, l);
    if (val !== null) {
      return val;
    }
  }

  return null;
}

function lookupInMap(phrase, map, lang) {
  if (Object.prototype.hasOwnProperty.call(map, phrase)) {
    return map[phrase];
  }

  // Compound English: "<num> and a half", "<num> and half", "<num> and a quarter"
  if (lang === 'en') {
    if (phrase.endsWith(' and a half') || phrase.endsWith(' and half')) {
      const baseStr = phrase.replace(/ and (a )?half$/, '');
      const base = map[baseStr];
      if (typeof base === 'number') return base + 0.5;
    }
    if (phrase.endsWith(' and a quarter') || phrase.endsWith(' and quarter')) {
      const baseStr = phrase.replace(/ and (a )?quarter$/, '');
      const base = map[baseStr];
      if (typeof base === 'number') return base + 0.25;
    }
    if (phrase.endsWith(' and three quarters') || phrase.endsWith(' and three fourths')) {
      const baseStr = phrase.replace(/ and (three quarters|three fourths)$/, '');
      const base = map[baseStr];
      if (typeof base === 'number') return base + 0.75;
    }
  }

  // Compound Hindi: "sadhe <num>", "saadhe <num>", "साढ़े <num>"
  if (lang === 'hi') {
    const sadheMatch = phrase.match(/^(?:sadhe|saadhe|साढ़े)\s+(.+)$/);
    if (sadheMatch) {
      const base = map[sadheMatch[1]];
      if (typeof base === 'number') return base + 0.5;
    }

    const sawaMatch = phrase.match(/^(?:sawa|sawai|सवा)\s+(.+)$/);
    if (sawaMatch) {
      const base = map[sawaMatch[1]];
      if (typeof base === 'number') return base + 0.25;
    }

    const pauneMatch = phrase.match(/^(?:paune|पौने)\s+(.+)$/);
    if (pauneMatch) {
      const base = map[pauneMatch[1]];
      if (typeof base === 'number') return base - 0.25;
    }
  }

  return null;
}

export default {
  BASE_UNITS,
  DEFAULT_FACTORS,
  UnitError,
  toBase,
  fromBase,
  parseNumberWord
};
