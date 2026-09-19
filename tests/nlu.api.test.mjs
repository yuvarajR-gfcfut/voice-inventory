import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../src/index.js';
import { validate } from '../src/lib/nlu/schema.js';
import { calculateSimilarity, matchProduct } from '../src/lib/nlu/matchProduct.js';

describe('NLU Schema & Product Matching Unit Tests', () => {
  test('schema.validate passes on valid structured NLU output', () => {
    const valid = {
      action: 'in',
      items: [{ product_hint: 'sugar', qty: 5, unit: 'bag' }],
      lang: 'hi',
      confidence: 0.95
    };
    const res = validate(valid);
    assert.equal(res.action, 'in');
    assert.equal(res.items[0].product_hint, 'sugar');
  });

  test('schema.validate throws on invalid action or confidence', () => {
    assert.throws(() => {
      validate({
        action: 'invalid_action',
        items: [],
        lang: 'en',
        confidence: 0.5
      });
    });

    assert.throws(() => {
      validate({
        action: 'in',
        items: [],
        lang: 'en',
        confidence: 1.5 // > 1.0
      });
    });
  });

  test('calculateSimilarity scores exact matches, substrings, and trigrams', () => {
    assert.equal(calculateSimilarity('sugar', 'sugar'), 1.0);
    assert.ok(calculateSimilarity('refined oil', 'oil') >= 0.75);
    assert.ok(calculateSimilarity('chawal', 'chaval') >= 0.35);
    assert.equal(calculateSimilarity('', 'sugar'), 0);
  });

  test('matchProduct distinguishes clear match from ambiguous candidates', async () => {
    const mockProducts = [
      { id: 'p1', name: 'Refined Oil Fortune', current_qty: 10, base_unit: 'l', archived_at: null },
      { id: 'p2', name: 'Refined Oil Dhara', current_qty: 5, base_unit: 'l', archived_at: null },
      { id: 'p3', name: 'Basmati Rice', current_qty: 20, base_unit: 'kg', archived_at: null }
    ];

    const mockDb = {
      from(table) {
        if (table === 'product_aliases') {
          return {
            select() {
              return {
                eq() {
                  return {
                    ilike() {
                      return {
                        limit() {
                          return Promise.resolve({ data: [], error: null });
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }
        if (table === 'products') {
          return {
            select() {
              return {
                eq() {
                  return {
                    is() {
                      return {
                        ilike(col, val) {
                          return {
                            limit() {
                              const found = mockProducts.filter(p => p.name.toLowerCase() === val.toLowerCase());
                              return Promise.resolve({ data: found, error: null });
                            }
                          };
                        },
                        then(resolve) {
                          resolve({ data: mockProducts, error: null });
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }
      }
    };

    // Ambiguous query: "refined oil" matches both Fortune and Dhara closely
    const ambig = await matchProduct('refined oil', 'user-1', mockDb);
    assert.equal(ambig.matched, null, 'Close candidates should produce ambiguous match (null)');
    assert.ok(ambig.candidates.length >= 2, 'Should return multiple candidates');

    // Decisive query: "basmati rice"
    const clear = await matchProduct('basmati rice', 'user-1', mockDb);
    assert.ok(clear.matched, 'Decisive candidate should be matched');
    assert.equal(clear.matched.name, 'Basmati Rice');
  });
});

describe('POST /api/parse Integration Tests', () => {
  let server;
  let baseUrl;
  let adminClient;
  let anonClient;
  let testUserId;
  let testToken;
  let testProductId;

  before(async () => {
    process.env.GEMINI_TIMEOUT_MS = '8000';
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const email = `test-parse-${Date.now()}@example.test`;
    const password = `Pw_${crypto.randomUUID()}!`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_name: 'Parse Test Shop' }
    });
    assert.ifError(createErr);
    testUserId = created.user.id;

    const { data: login, error: loginErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });
    assert.ifError(loginErr);
    testToken = login.session.access_token;

    // Create a product for product matching
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Sugar M30',
        category: 'Grocery',
        base_unit: 'kg',
        low_stock_threshold: 10
      })
    });
    assert.equal(res.status, 201);
    const prod = await res.json();
    testProductId = prod.id;

    // Add an alias for testing alias matching
    const { error: aliasErr } = await adminClient.from('product_aliases').insert({
      owner_id: testUserId,
      product_id: testProductId,
      alias: 'cheeni',
      language: 'hi'
    });
    assert.ifError(aliasErr);
  });

  after(async () => {
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
    }
    if (server) {
      server.close();
    }
  });

  test('POST /api/parse requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '2 bags sugar aa gaya' })
    });
    assert.equal(res.status, 401);
  });

  test('POST /api/parse parses via deterministic rules and matches alias', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: '2 bori cheeni aa gayi', lang: 'hi' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.action, 'in');
    assert.equal(data.source, 'rules');
    assert.equal(data.needsManualEntry, false);
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].qty, 2);
    assert.equal(data.items[0].unit, 'bag');
    assert.equal(data.items[0].product_hint, 'cheeni');
    // Matched product via alias
    assert.ok(data.items[0].matched, 'Should match product via cheeni alias');
    assert.equal(data.items[0].matched.id, testProductId);
  });

  test('POST /api/parse parses via rules and matches product name with similarity', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: '5 kg sugar sold', lang: 'en' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.action, 'out');
    assert.equal(data.source, 'rules');
    assert.equal(data.items[0].qty, 5);
    assert.equal(data.items[0].unit, 'kg');
    assert.ok(data.items[0].matched, 'Should match Sugar M30 via trigram similarity');
    assert.equal(data.items[0].matched.name, 'Sugar M30');
  });

  test('POST /api/parse escalates to Gemini for non-rule sentence', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: 'we purchased four bottles of cold drink yesterday', lang: 'en' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.action, 'in');
    assert.equal(data.source, 'gemini');
    assert.equal(data.needsManualEntry, false);
    assert.ok(data.items.length >= 1);
    assert.equal(data.items[0].qty, 4);
    assert.equal(data.items[0].unit, 'bottle');
  });

  test('POST /api/parse handles complete gibberish with needsManualEntry: true', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: 'blablabla xyz123', lang: 'en' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.action, 'unknown');
    assert.equal(data.needsManualEntry, true);
  });
});
