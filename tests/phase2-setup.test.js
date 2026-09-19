import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, mapDbError } from '../src/lib/errors.js';
import app from '../src/index.js';

describe('Error Handling and mapDbError', () => {
  test('maps INSUFFICIENT_STOCK with available details', () => {
    const err = mapDbError({ message: 'INSUFFICIENT_STOCK', details: 'available=12' });
    assert.equal(err.status, 409);
    assert.equal(err.code, 'INSUFFICIENT_STOCK');
    assert.equal(err.details, 'available=12');
  });

  test('maps INSUFFICIENT_STOCK from message if details is empty', () => {
    const err = mapDbError({ message: 'INSUFFICIENT_STOCK: available=5, requested=10' });
    assert.equal(err.status, 409);
    assert.equal(err.code, 'INSUFFICIENT_STOCK');
    assert.ok(err.details.includes('available=5'));
  });

  test('maps PRODUCT_NOT_FOUND and MOVEMENT_NOT_FOUND to 404', () => {
    assert.equal(mapDbError({ message: 'PRODUCT_NOT_FOUND' }).status, 404);
    assert.equal(mapDbError({ message: 'MOVEMENT_NOT_FOUND' }).status, 404);
  });

  test('maps INVALID_QTY, INVALID_TYPE, NO_CHANGE to 400', () => {
    assert.equal(mapDbError({ message: 'INVALID_QTY' }).status, 400);
    assert.equal(mapDbError({ message: 'INVALID_TYPE' }).status, 400);
    assert.equal(mapDbError({ message: 'NO_CHANGE' }).status, 400);
  });

  test('maps ALREADY_UNDONE and CANNOT_UNDO_AN_UNDO to 409', () => {
    assert.equal(mapDbError({ message: 'ALREADY_UNDONE' }).status, 409);
    assert.equal(mapDbError({ message: 'CANNOT_UNDO_AN_UNDO' }).status, 409);
  });

  test('maps NOT_AUTHENTICATED to 401', () => {
    assert.equal(mapDbError({ message: 'NOT_AUTHENTICATED' }).status, 401);
  });

  test('maps Postgres SQLSTATE codes', () => {
    assert.equal(mapDbError({ code: '23505' }).status, 409);
    assert.equal(mapDbError({ code: '23505' }).code, 'DUPLICATE');

    assert.equal(mapDbError({ code: '42501' }).status, 403);
    assert.equal(mapDbError({ code: '42501' }).code, 'FORBIDDEN');

    assert.equal(mapDbError({ code: '23514' }).status, 400);
    assert.equal(mapDbError({ code: '22P02' }).status, 400);
    assert.equal(mapDbError({ code: '23503' }).status, 400);
  });

  test('maps unknown error to 500 INTERNAL', () => {
    const err = mapDbError(new Error('Unknown DB glitch'));
    assert.equal(err.status, 500);
    assert.equal(err.code, 'INTERNAL');
  });
});

describe('API Endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('GET /api/health returns db status and region', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.db, true);
    assert.equal(body.region, 'local');
    assert.ok(body.time);
  });

  test('GET /api/config returns public keys only with no secrets', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.supabaseUrl);
    assert.ok(body.supabasePublishableKey);
    assert.equal(body.supabaseSecretKey, undefined);
    assert.equal(body.geminiApiKey, undefined);
  });

  test('GET /api/me without authentication returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  test('GET /api/cron/keepalive without CRON_SECRET returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/cron/keepalive`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  test('GET /api/not-found returns 404 NOT_FOUND with standard error shape', async () => {
    const res = await fetch(`${baseUrl}/api/not-found`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
