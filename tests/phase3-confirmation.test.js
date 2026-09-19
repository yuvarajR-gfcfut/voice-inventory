import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../src/index.js';

describe('Phase 3.5 Confirmation Flow & Idempotency Tests', () => {
  let server;
  let baseUrl;
  let adminClient;
  let anonClient;
  let testUserId;
  let testToken;
  let testProductId;
  let testProduct2Id;

  before(async () => {
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

    const email = `test-confirm-${Date.now()}@example.test`;
    const password = `Pw_${crypto.randomUUID()}!`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_name: 'Confirmation Kirana' }
    });
    assert.ifError(createErr);
    testUserId = created.user.id;

    const { data: login, error: loginErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });
    assert.ifError(loginErr);
    testToken = login.session.access_token;

    // Create 2 test products: Sugar (kg) and Rice (kg)
    const resProd1 = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Sugar M30',
        category: 'Staples',
        base_unit: 'kg',
        low_stock_threshold: 10
      })
    });
    const p1 = await resProd1.json();
    testProductId = p1.id;

    const resProd2 = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Basmati Rice',
        category: 'Staples',
        base_unit: 'kg',
        low_stock_threshold: 20
      })
    });
    const p2 = await resProd2.json();
    testProduct2Id = p2.id;
  });

  after(async () => {
    if (testUserId) {
      try {
        await adminClient.auth.admin.deleteUser(testUserId);
      } catch (_) {}
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('Unit conversion: 2 bags of sugar (base_unit kg) adds 100 kg to stock', async () => {
    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'in',
        qty: 2,
        unit: 'bag',
        idempotency_key: idempotencyKey
      })
    });
    assert.equal(res.status, 200);
    const movement = await res.json();
    // Default factor for bag is 50 kg -> 2 * 50 = 100 kg
    assert.equal(Number(movement.delta_base), 100);
    assert.equal(Number(movement.balance_after), 100);

    const checkRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await checkRes.json();
    assert.equal(Number(prod.current_qty), 100);
  });

  test('Double-tap deduplication: Rapid identical calls with same idempotency_key apply exactly once', async () => {
    const fixedIdempotencyKey = crypto.randomUUID();

    // Fire two requests concurrently (simulating rapid double-tap)
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'in',
          qty: 10,
          unit: 'kg',
          idempotency_key: fixedIdempotencyKey
        })
      }),
      fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'in',
          qty: 10,
          unit: 'kg',
          idempotency_key: fixedIdempotencyKey
        })
      })
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both should return the same movement id
    assert.equal(body1.id, body2.id);

    // Stock should have increased by only 10 kg (100 + 10 = 110), NOT 120
    const checkRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await checkRes.json();
    assert.equal(Number(prod.current_qty), 110);
  });

  test('Sequential re-send with same idempotency_key returns cached result without re-applying', async () => {
    const key = crypto.randomUUID();

    const first = await fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'out',
        qty: 5,
        unit: 'kg',
        idempotency_key: key
      })
    });
    assert.equal(first.status, 200);
    const m1 = await first.json();
    assert.equal(Number(m1.balance_after), 105);

    // Resend second time
    const second = await fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'out',
        qty: 5,
        unit: 'kg',
        idempotency_key: key
      })
    });
    assert.equal(second.status, 200);
    const m2 = await second.json();
    assert.equal(m1.id, m2.id);
    assert.equal(Number(m2.balance_after), 105);

    // Verify stock is still 105
    const checkRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await checkRes.json();
    assert.equal(Number(prod.current_qty), 105);
  });

  test('Undo flow: /api/products/:id/undo/:movementId reverses stock and prevents double-undo', async () => {
    // Make a stock change
    const stockRes = await fetch(`${baseUrl}/api/products/${testProduct2Id}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'in',
        qty: 40,
        unit: 'kg',
        idempotency_key: crypto.randomUUID()
      })
    });
    assert.equal(stockRes.status, 200);
    const mov = await stockRes.json();
    assert.equal(Number(mov.balance_after), 40);

    // Call Undo
    const undoRes = await fetch(`${baseUrl}/api/products/${testProduct2Id}/undo/${mov.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(undoRes.status, 200);
    const undoResult = await undoRes.json();
    assert.equal(undoResult.type, 'undo');
    assert.equal(undoResult.reverses_id, mov.id);
    assert.equal(Number(undoResult.balance_after), 0);

    // Product current_qty is back to 0
    const prodRes = await fetch(`${baseUrl}/api/products/${testProduct2Id}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await prodRes.json();
    assert.equal(Number(prod.current_qty), 0);

    // Second undo on the same movement should fail with 409 ALREADY_UNDONE
    const undoAgainRes = await fetch(`${baseUrl}/api/products/${testProduct2Id}/undo/${mov.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(undoAgainRes.status, 409);
    const errBody = await undoAgainRes.json();
    assert.equal(errBody.error?.code, 'ALREADY_UNDONE');
  });

  test('Multi-item /api/parse pipeline test', async () => {
    const parseRes = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: '5 kg sugar aur 10 kg rice aaya',
        lang: 'hi'
      })
    });
    assert.equal(parseRes.status, 200);
    const parsed = await parseRes.json();
    assert.equal(parsed.action, 'in');
    assert.equal(parsed.items.length, 2);

    // Sugar item
    const sugarItem = parsed.items.find(i => i.product_hint?.toLowerCase().includes('sugar'));
    assert.ok(sugarItem);
    assert.equal(sugarItem.qty, 5);
    assert.equal(sugarItem.matched?.id, testProductId);

    // Rice item
    const riceItem = parsed.items.find(i => i.product_hint?.toLowerCase().includes('rice'));
    assert.ok(riceItem);
    assert.equal(riceItem.qty, 10);
    assert.equal(riceItem.matched?.id, testProduct2Id);
  });
});
