import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../src/index.js';

describe('Phase 4 Hardening & Security Tests', () => {
  let server;
  let baseUrl;
  let adminClient;
  let anonClient;
  let testUserId;
  let testToken;

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

    const email = `test-hardening-${Date.now()}@example.test`;
    const password = `Pw_${crypto.randomUUID()}!`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_name: 'Hardening Kirana' }
    });
    assert.ifError(createErr);
    testUserId = created.user.id;

    const { data: login, error: loginErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });
    assert.ifError(loginErr);
    testToken = login.session.access_token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (adminClient && testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
    }
  });

  test('Invalid input returns standard error shape without stack traces', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Invalid Product Test',
        base_unit: 'garbage_unit'
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.equal(typeof body.error.message, 'string');
    assert.equal(body.stack, undefined);
    assert.equal(body.error.stack, undefined);
  });

  test('Malformed JSON returns standard error shape', async () => {
    const res = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: '{ "name": "Broken JSON, }'
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.equal(body.stack, undefined);
  });

  test('Undefined API route returns standard 404 NOT_FOUND error shape', async () => {
    const res = await fetch(`${baseUrl}/api/non_existent_endpoint`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.stack, undefined);
  });

  test('/api/parse returns needsManualEntry: true with status 200 on unparseable inputs', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'hello this is unparseable inventory query with no product or quantity or action'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.action === 'string');
    assert.ok(Array.isArray(body.items));
    assert.ok(typeof body.needsManualEntry === 'boolean');
  });
});
