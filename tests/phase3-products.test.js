import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../src/index.js';

describe('Products & Stock API Endpoints', () => {
  let server;
  let baseUrl;
  let adminClient;
  let anonClient;
  let testUserId;
  let testToken;
  let testProductId;
  let testMovementId;

  before(async () => {
    // Start local server
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
    const email = `test-products-${Date.now()}@example.test`;
    const password = `Pw_${crypto.randomUUID()}!`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_name: 'Test Kirana' }
    });
    assert.ifError(createErr);
    testUserId = created.user.id;

    // Login user
    const { data: login, error: loginErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });
    assert.ifError(loginErr);
    testToken = login.session.access_token;
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

  test('GET /api/products requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/products`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error?.code, 'UNAUTHENTICATED');
  });

  test('POST /api/products creates a new product', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Mustard Seeds',
        category: 'Spices',
        base_unit: 'kg',
        low_stock_threshold: 5
      })
    });
    assert.equal(res.status, 201);
    const product = await res.json();
    assert.ok(product.id);
    assert.equal(product.name, 'Mustard Seeds');
    assert.equal(product.base_unit, 'kg');
    assert.equal(Number(product.current_qty), 0);
    testProductId = product.id;
  });

  test('POST /api/products rejects invalid unit', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Invalid Item',
        base_unit: 'liters_invalid'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error?.code, 'INVALID_INPUT');
  });

  test('GET /api/products lists created products', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.some((p) => p.id === testProductId));
  });

  test('PATCH /api/products/:id updates name and rejects current_qty', async () => {
    // Attempting to inject current_qty must fail
    const resBad = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Mustard Seeds Premium',
        current_qty: 999
      })
    });
    assert.equal(resBad.status, 400);

    // Valid update
    const resGood = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Mustard Seeds Premium'
      })
    });
    assert.equal(resGood.status, 200);
    const updated = await resGood.json();
    assert.equal(updated.name, 'Mustard Seeds Premium');
  });

  test('POST /api/products/:id/stock handles in movement', async () => {
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'in',
        qty: 25,
        unit: 'kg',
        idempotency_key: `key-in-${Date.now()}`
      })
    });
    assert.equal(res.status, 200);
    const movement = await res.json();
    assert.equal(Number(movement.balance_after), 25);
    testMovementId = movement.id;

    const prodRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await prodRes.json();
    assert.equal(Number(prod.current_qty), 25);
  });

  test('POST /api/products/:id/stock blocks "out" movement exceeding available qty with 409 INSUFFICIENT_STOCK', async () => {
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'out',
        qty: 50, // 50 > 25 available
        unit: 'kg',
        idempotency_key: `key-out-fail-${Date.now()}`
      })
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error?.code, 'INSUFFICIENT_STOCK');
    assert.ok(body.error?.details?.includes('available='));
  });

  test('GET /api/products/:id/movements returns history newest first', async () => {
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/movements`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const movements = await res.json();
    assert.ok(Array.isArray(movements));
    assert.ok(movements.length >= 1);
    assert.equal(movements[0].id, testMovementId);
  });

  test('POST /api/products/:id/undo/:movementId undoes movement', async () => {
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/undo/${testMovementId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);

    const prodRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const prod = await prodRes.json();
    assert.equal(Number(prod.current_qty), 0);
  });

  test('POST /api/products/:id/archive archives product', async () => {
    const res = await fetch(`${baseUrl}/api/products/${testProductId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.equal(res.status, 200);
    const archived = await res.json();
    assert.ok(archived.archived_at);

    // Regular list excludes it
    const listRes = await fetch(`${baseUrl}/api/products`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const list = await listRes.json();
    assert.ok(!list.some((p) => p.id === testProductId));

    // Archived list includes it
    const archiveListRes = await fetch(`${baseUrl}/api/products?archived=true`, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    const archiveList = await archiveListRes.json();
    assert.ok(archiveList.some((p) => p.id === testProductId));
  });
});
