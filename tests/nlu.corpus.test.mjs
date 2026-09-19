import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/lib/nlu/rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('NLU Corpus Evaluation (tests/fixtures/nlu-corpus.json)', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'nlu-corpus.json');
  const corpus = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  test('Corpus contains 60 sentences (20 en, 20 hi, 20 te)', () => {
    assert.equal(corpus.length, 60, 'Corpus must have exactly 60 sentences');
  });

  test('Rules-only parsing achieves >= 90% accuracy across 60 sentences', () => {
    let passed = 0;
    const failures = [];

    for (let i = 0; i < corpus.length; i++) {
      const entry = corpus[i];
      const { sentence, expected } = entry;
      const actual = parse(sentence);

      let isCorrect = false;

      if (actual && actual.action === expected.action) {
        if (expected.items.length === 0 && actual.items.length === 0) {
          isCorrect = true;
        } else if (expected.items.length === actual.items.length) {
          isCorrect = expected.items.every((exp, idx) => {
            const act = actual.items[idx];
            return (
              act &&
              act.product_hint.toLowerCase() === exp.product_hint.toLowerCase() &&
              act.qty === exp.qty &&
              act.unit === exp.unit
            );
          });
        }
      }

      if (isCorrect) {
        passed++;
      } else {
        failures.push({
          index: i + 1,
          sentence,
          expected,
          actual
        });
      }
    }

    const percentage = (passed / corpus.length) * 100;

    console.log(`\n========================================`);
    console.log(`NLU RULES-ONLY ACCURACY: ${passed}/${corpus.length} (${percentage.toFixed(1)}%)`);
    console.log(`========================================\n`);

    if (failures.length > 0) {
      console.log('Failed cases:');
      for (const f of failures) {
        console.log(`[#${f.index}] "${f.sentence}"`);
        console.log('  Expected:', JSON.stringify(f.expected));
        console.log('  Actual:  ', JSON.stringify(f.actual));
      }
    }

    assert.ok(
      percentage >= 90.0,
      `Corpus accuracy (${percentage.toFixed(1)}%) must be at least 90.0%`
    );
  });
});
