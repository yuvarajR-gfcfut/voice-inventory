import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_UNITS,
  DEFAULT_FACTORS,
  UnitError,
  toBase,
  fromBase,
  parseNumberWord
} from '../src/lib/units.js';

describe('Unit Normalization & Conversion (src/lib/units.js)', () => {

  test('Exports BASE_UNITS', () => {
    assert.deepEqual(BASE_UNITS, ['kg', 'l', 'pcs']);
  });

  test('Exports DEFAULT_FACTORS with exact constants', () => {
    assert.equal(DEFAULT_FACTORS.bag, 50);
    assert.equal(DEFAULT_FACTORS.quintal, 100);
    assert.equal(DEFAULT_FACTORS.dozen, 12);
    assert.equal(DEFAULT_FACTORS.pcs, 1);
    assert.equal(DEFAULT_FACTORS.kg, 1);
    assert.equal(DEFAULT_FACTORS.g, 0.001);
    assert.equal(DEFAULT_FACTORS.l, 1);
    assert.equal(DEFAULT_FACTORS.ml, 0.001);
    assert.equal(DEFAULT_FACTORS.pav, undefined);
    assert.equal(DEFAULT_FACTORS.pao, undefined);
  });

  test('3 bags × 50 kg = 150 kg (default factor)', () => {
    assert.equal(toBase(3, 'bag', 'kg'), 150);
    assert.equal(toBase(3, 'bags', 'kg'), 150);
    assert.equal(fromBase(150, 'bag', 'kg'), 3);
  });

  test('2 quintal = 200 kg', () => {
    assert.equal(toBase(2, 'quintal', 'kg'), 200);
    assert.equal(toBase(2, 'quintals', 'kg'), 200);
    assert.equal(fromBase(200, 'quintal', 'kg'), 2);
  });

  test('1 dozen = 12 pcs', () => {
    assert.equal(toBase(1, 'dozen', 'pcs'), 12);
    assert.equal(toBase(2, 'dozen', 'pcs'), 24);
    assert.equal(fromBase(12, 'dozen', 'pcs'), 1);
  });

  test('per-product override: rice bag = 25 kg overrides the 50 kg default', () => {
    // Override 'bag' default 50 -> 25
    const bagOverride = [{ unit: 'bag', factor_to_base: 25 }];
    assert.equal(toBase(1, 'bag', 'kg', bagOverride), 25);
    assert.equal(toBase(3, 'bag', 'kg', bagOverride), 75);
    assert.equal(fromBase(75, 'bag', 'kg', bagOverride), 3);

    // Named unit override: 'rice bag'
    const riceBagOverride = [{ unit: 'rice bag', factor_to_base: 25 }];
    assert.equal(toBase(1, 'rice bag', 'kg', riceBagOverride), 25);
    assert.equal(toBase(4, 'rice bag', 'kg', riceBagOverride), 100);
    assert.equal(fromBase(100, 'rice bag', 'kg', riceBagOverride), 4);
  });

  test('kg -> l throws INCOMPATIBLE_UNIT', () => {
    assert.throws(
      () => toBase(1, 'kg', 'l'),
      (err) => {
        assert.equal(err.code, 'INCOMPATIBLE_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /INCOMPATIBLE_UNIT/);
        return true;
      }
    );

    assert.throws(
      () => fromBase(1, 'kg', 'l'),
      (err) => {
        assert.equal(err.code, 'INCOMPATIBLE_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /INCOMPATIBLE_UNIT/);
        return true;
      }
    );

    // Also check other cross-dimension pairs
    assert.throws(() => toBase(1, 'l', 'kg'), { code: 'INCOMPATIBLE_UNIT' });
    assert.throws(() => toBase(1, 'pcs', 'kg'), { code: 'INCOMPATIBLE_UNIT' });
    assert.throws(() => toBase(1, 'dozen', 'l'), { code: 'INCOMPATIBLE_UNIT' });
  });

  test('unknown unit throws UNKNOWN_UNIT', () => {
    assert.throws(
      () => toBase(1, 'xyz_random_unit', 'kg'),
      (err) => {
        assert.equal(err.code, 'UNKNOWN_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /UNKNOWN_UNIT/);
        return true;
      }
    );

    assert.throws(
      () => fromBase(1, 'non_existent_unit', 'pcs'),
      (err) => {
        assert.equal(err.code, 'UNKNOWN_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /UNKNOWN_UNIT/);
        return true;
      }
    );
  });

  test('pav/pao with no override throws UNRESOLVED_UNIT', () => {
    assert.throws(
      () => toBase(1, 'pav', 'kg'),
      (err) => {
        assert.equal(err.code, 'UNRESOLVED_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /UNRESOLVED_UNIT/);
        return true;
      }
    );

    assert.throws(
      () => toBase(1, 'pao', 'kg'),
      (err) => {
        assert.equal(err.code, 'UNRESOLVED_UNIT');
        assert.ok(err instanceof UnitError);
        assert.match(err.message, /UNRESOLVED_UNIT/);
        return true;
      }
    );

    assert.throws(
      () => fromBase(1, 'pav', 'kg'),
      (err) => {
        assert.equal(err.code, 'UNRESOLVED_UNIT');
        return true;
      }
    );

    // With explicit override, pav/pao resolves correctly
    const pavOverride250 = [{ unit: 'pav', factor_to_base: 0.25 }];
    assert.equal(toBase(2, 'pav', 'kg', pavOverride250), 0.5);
    assert.equal(fromBase(0.5, 'pav', 'kg', pavOverride250), 2);

    const paoOverride200 = [{ unit: 'pao', factor_to_base: 0.2 }];
    assert.equal(toBase(5, 'pao', 'kg', paoOverride200), 1.0);
    assert.equal(fromBase(1.0, 'pao', 'kg', paoOverride200), 5);
  });

  test('number words: do, teen, రెండు, "half"', () => {
    // English
    assert.equal(parseNumberWord('zero', 'en'), 0);
    assert.equal(parseNumberWord('one', 'en'), 1);
    assert.equal(parseNumberWord('half', 'en'), 0.5);
    assert.equal(parseNumberWord('one and a half', 'en'), 1.5);
    assert.equal(parseNumberWord('two and a half', 'en'), 2.5);
    assert.equal(parseNumberWord('dozen', 'en'), 12);

    // Hindi
    assert.equal(parseNumberWord('do', 'hi'), 2);
    assert.equal(parseNumberWord('teen', 'hi'), 3);
    assert.equal(parseNumberWord('char', 'hi'), 4);
    assert.equal(parseNumberWord('एक', 'hi'), 1);
    assert.equal(parseNumberWord('दो', 'hi'), 2);
    assert.equal(parseNumberWord('तीन', 'hi'), 3);
    assert.equal(parseNumberWord('आधा', 'hi'), 0.5);
    assert.equal(parseNumberWord('डेढ़', 'hi'), 1.5);
    assert.equal(parseNumberWord('ढाई', 'hi'), 2.5);
    assert.equal(parseNumberWord('sadhe teen', 'hi'), 3.5);

    // Telugu
    assert.equal(parseNumberWord('రెండు', 'te'), 2);
    assert.equal(parseNumberWord('ఒకటి', 'te'), 1);
    assert.equal(parseNumberWord('మూడు', 'te'), 3);
    assert.equal(parseNumberWord('rendu', 'te'), 2);
    assert.equal(parseNumberWord('moodu', 'te'), 3);
    assert.equal(parseNumberWord('సగం', 'te'), 0.5);
    assert.equal(parseNumberWord('ఒకటిన్నర', 'te'), 1.5);

    // Without specifying language (auto-detect)
    assert.equal(parseNumberWord('do'), 2);
    assert.equal(parseNumberWord('teen'), 3);
    assert.equal(parseNumberWord('రెండు'), 2);
    assert.equal(parseNumberWord('half'), 0.5);
    assert.equal(parseNumberWord('one and a half'), 1.5);

    // Unrecognized words return null, never throw
    assert.equal(parseNumberWord('unknown_word', 'en'), null);
    assert.equal(parseNumberWord('random_gibberish'), null);
    assert.equal(parseNumberWord('', 'en'), null);
    assert.equal(parseNumberWord(null), null);
    assert.equal(parseNumberWord(undefined), null);
  });

  test('round-trip: fromBase(toBase(x, unit), unit) ≈ x within 0.001', () => {
    const testCases = [
      { unit: 'bag', val: 3.5 },
      { unit: 'quintal', val: 2.75 },
      { unit: 'dozen', val: 5 },
      { unit: 'pcs', val: 18 },
      { unit: 'kg', val: 42.125 },
      { unit: 'g', val: 750 },
      { unit: 'l', val: 3.5 },
      { unit: 'ml', val: 250 }
    ];

    for (const { unit, val } of testCases) {
      const baseQty = toBase(val, unit);
      const restored = fromBase(baseQty, unit);
      assert.ok(
        Math.abs(restored - val) < 0.001,
        `Round-trip failed for ${unit}: expected ${val}, got ${restored}`
      );
    }

    // Round trip with overrides
    const overrides = [{ unit: 'oil tin', factor_to_base: 15 }];
    const tinVal = 4;
    const baseTin = toBase(tinVal, 'oil tin', overrides);
    const restoredTin = fromBase(baseTin, 'oil tin', overrides);
    assert.ok(
      Math.abs(restoredTin - tinVal) < 0.001,
      `Round-trip failed for override: expected ${tinVal}, got ${restoredTin}`
    );
  });

});
