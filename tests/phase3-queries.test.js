import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../src/index.js';

describe('Phase 3.7 Stock Queries & Smart Alerts API Tests', () => {
  let server;
  let baseUrl;
  let adminClient;
  let anonClient;
  let testUserId;
  let testToken;
  let lowProductId;
  let normalProductId;

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

    // Create test user
    const email = `test-queries-${Date.now()}@example.test`;
    const password = `Pw_${crypto.randomUUID()}!`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_name: 'Queries Kirana' }
    });
    assert.ifError(createErr);
    testUserId = created.user.id;

    const { data: login, error: loginErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });
    assert.ifError(loginErr);
    testToken = login.session.access_token;

    // 1. Create a product that will be LOW stock (threshold: 10, initial current_qty: 0 -> <= 10)
    const p1Res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Parle-G 80g',
        category: 'Biscuits',
        base_unit: 'pcs',
        low_stock_threshold: 10
      })
    });
    const p1 = await p1Res.json();
    lowProductId = p1.id;

    // Add 20 pcs of Parle-G, then sell 15 pcs -> leaves 5 pcs (which is <= 10, so LOW stock)
    await fetch(`${baseUrl}/api/products/${lowProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'in',
        qty: 20,
        unit: 'pcs',
        idempotency_key: crypto.randomUUID()
      })
    });

    await fetch(`${baseUrl}/api/products/${lowProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'out',
        qty: 15,
        unit: 'pcs',
        idempotency_key: crypto.randomUUID()
      })
    });

    // 2. Create a product with NORMAL stock (threshold: 5, current_qty: 50 -> healthy)
    const p2Res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Wheat Flour Aata',
        category: 'Staples',
        base_unit: 'kg',
        low_stock_threshold: 5
      })
    });
    const p2 = await p2Res.json();
    normalProductId = p2.id;

    await fetch(`${baseUrl}/api/products/${normalProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'in',
        qty: 50,
        unit: 'kg',
        idempotency_key: crypto.randomUUID()
      })
    });
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

  test('GET /api/stock/:productId requires authentication and returns product stock', async () => {
    // 401 unauth
    const unauth = await fetch(`${baseUrl}/api/stock/${lowProductId}`);
    assert.equal(unauth.status, 401);

    // 200 auth
    const res = await fetch(`${baseUrl}/api/stock/${lowProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const prod = await res.json();
    assert.equal(prod.id, lowProductId);
    assert.equal(prod.name, 'Parle-G 80g');
    assert.equal(Number(prod.current_qty), 5);
    assert.equal(prod.base_unit, 'pcs');
  });

  test('GET /api/stock/low returns only low stock items', async () => {
    const res = await fetch(`${baseUrl}/api/stock/low`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    // Parle-G (5 <= 10) is low
    assert.ok(list.some((p) => p.id === lowProductId));
    // Wheat Flour (50 > 5) is NOT low
    assert.ok(!list.some((p) => p.id === normalProductId));
  });

  test('GET /api/stock/reorder computes 14-day consumption and suggested reorder', async () => {
    const res = await fetch(`${baseUrl}/api/stock/reorder`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));

    const item = list.find((p) => p.id === lowProductId);
    assert.ok(item, 'Low stock product must be included in reorder list');

    // Sold 15 pcs in 14 days -> daily usage = 15/14 ≈ 1.071
    assert.equal(Number(item.total_out_14d), 15);
    assert.ok(item.daily_usage > 0);
    // days_of_stock_left = 5 / (15/14) ≈ 4.7 days
    assert.ok(item.days_of_stock_left > 0);
    // suggested_reorder_qty computed from consumption or threshold
    assert.ok(item.suggested_reorder_qty >= 10);
  });

  test('GET /api/stock/reorder handles zero-usage product gracefully without crashing', async () => {
    // Create another low-stock product with 0 usage
    const p3Res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Mustard Oil 1L',
        category: 'Oil',
        base_unit: 'l',
        low_stock_threshold: 4
      })
    });
    const p3 = await p3Res.json();

    const res = await fetch(`${baseUrl}/api/stock/reorder`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    const item = list.find((p) => p.id === p3.id);
    assert.ok(item);
    assert.equal(item.total_out_14d, 0);
    assert.equal(item.daily_usage, 0);
    // Zero usage must result in null days_of_stock_left (to display "—" safely)
    assert.equal(item.days_of_stock_left, null);
    assert.ok(item.suggested_reorder_qty > 0);
  });
});
