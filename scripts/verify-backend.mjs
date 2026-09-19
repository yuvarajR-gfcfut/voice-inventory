import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error('Missing required environment variables in .env');
  process.exit(1);
}

const rawArg = process.argv[2] || 'http://localhost:3000';
const baseUrl = rawArg.replace(/\/+$/, '');

let totalChecks = 15;
let passedChecks = 0;

function pass(num, description) {
  passedChecks++;
  console.log(`✅ ${num}. ${description}`);
}

function fail(num, description, reason = '') {
  console.log(`❌ ${num}. ${description}${reason ? ` (${reason})` : ''}`);
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let userAId = null;
let userBId = null;
let tokenA = null;
let tokenB = null;
let clientA = null;
let clientB = null;
let productId = null;

async function run() {
  console.log(`Starting backend verification against ${baseUrl}...\n`);

  try {
    // 0. Setup: Clean leftover verify-* users
    try {
      const { data: listData } = await adminClient.auth.admin.listUsers();
      if (listData?.users) {
        for (const u of listData.users) {
          if (u.email && /^verify-.*@example\.test$/i.test(u.email)) {
            await adminClient.auth.admin.deleteUser(u.id);
          }
        }
      }
    } catch (err) {
      console.warn('Warning during initial cleanup:', err.message);
    }

    // Create User A
    const emailA = `verify-a-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.test`;
    const passwordA = `PwA_${crypto.randomUUID()}!`;
    const { data: userACreated, error: errCreateA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
      user_metadata: { shop_name: 'Verify A' }
    });
    if (errCreateA || !userACreated?.user) {
      throw new Error(`Failed to create User A: ${errCreateA?.message || 'unknown error'}`);
    }
    userAId = userACreated.user.id;

    // Create User B
    const emailB = `verify-b-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.test`;
    const passwordB = `PwB_${crypto.randomUUID()}!`;
    const { data: userBCreated, error: errCreateB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
      user_metadata: { shop_name: 'Verify B' }
    });
    if (errCreateB || !userBCreated?.user) {
      throw new Error(`Failed to create User B: ${errCreateB?.message || 'unknown error'}`);
    }
    userBId = userBCreated.user.id;

    // Login A
    const { data: loginA, error: errLoginA } = await anonClient.auth.signInWithPassword({
      email: emailA,
      password: passwordA
    });
    if (errLoginA || !loginA?.session?.access_token) {
      throw new Error(`Failed to login User A: ${errLoginA?.message || 'no token'}`);
    }
    tokenA = loginA.session.access_token;

    // Login B
    const { data: loginB, error: errLoginB } = await anonClient.auth.signInWithPassword({
      email: emailB,
      password: passwordB
    });
    if (errLoginB || !loginB?.session?.access_token) {
      throw new Error(`Failed to login User B: ${errLoginB?.message || 'no token'}`);
    }
    tokenB = loginB.session.access_token;

    // Build per-user clients
    clientA = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${tokenA}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    clientB = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${tokenB}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // --- API CHECKS ---

    // Check 1: GET /api/health -> 200 and db:true
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10000) });
      const body = await res.json();
      if (res.status === 200 && body.status === 'ok' && body.db === true) {
        pass(1, 'GET /api/health returns 200 and db:true');
      } else {
        fail(1, 'GET /api/health returns 200 and db:true', `status=${res.status}, db=${body.db}`);
      }
    } catch (e) {
      fail(1, 'GET /api/health returns 200 and db:true', e.message);
    }

    // Check 2: GET /api/config -> has supabaseUrl + publishable key, response text does NOT contain secret key or GEMINI key
    try {
      const res = await fetch(`${baseUrl}/api/config`, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      const body = JSON.parse(text);
      const hasKeys = !!(body.supabaseUrl && body.supabasePublishableKey);
      const noSecret = !text.includes(SUPABASE_SECRET_KEY);
      const noGemini = !GEMINI_API_KEY || !text.includes(GEMINI_API_KEY);
      if (res.status === 200 && hasKeys && noSecret && noGemini) {
        pass(2, 'GET /api/config returns public keys with zero secrets exposed');
      } else {
        fail(2, 'GET /api/config returns public keys with zero secrets exposed', 'keys missing or secret leaked');
      }
    } catch (e) {
      fail(2, 'GET /api/config returns public keys with zero secrets exposed', e.message);
    }

    // Check 3: GET /api/me with no token -> 401 UNAUTHENTICATED; with a garbage token -> 401
    try {
      const resNoToken = await fetch(`${baseUrl}/api/me`, { signal: AbortSignal.timeout(10000) });
      const bodyNoToken = await resNoToken.json();
      const resGarbage = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: 'Bearer garbage.invalid.token' },
        signal: AbortSignal.timeout(10000)
      });
      const bodyGarbage = await resGarbage.json();

      if (
        resNoToken.status === 401 &&
        bodyNoToken.error?.code === 'UNAUTHENTICATED' &&
        resGarbage.status === 401 &&
        bodyGarbage.error?.code === 'UNAUTHENTICATED'
      ) {
        pass(3, 'GET /api/me requires valid token (401 on missing/garbage token)');
      } else {
        fail(3, 'GET /api/me requires valid token', `noToken=${resNoToken.status}, garbage=${resGarbage.status}`);
      }
    } catch (e) {
      fail(3, 'GET /api/me requires valid token', e.message);
    }

    // Check 4: GET /api/me as A -> 200 and shop_name "Verify A" (proves signup trigger)
    try {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${tokenA}` },
        signal: AbortSignal.timeout(10000)
      });
      const body = await res.json();
      if (res.status === 200 && body.shop_name === 'Verify A') {
        pass(4, 'GET /api/me as User A returns 200 and shop_name "Verify A" (signup trigger verified)');
      } else {
        fail(4, 'GET /api/me as User A', `status=${res.status}, shop_name=${body.shop_name}`);
      }
    } catch (e) {
      fail(4, 'GET /api/me as User A', e.message);
    }

    // Check 5: PATCH /api/me {language:"te"} -> 200 and persisted; {language:"xx"} -> 400 INVALID_INPUT; {} -> 400
    try {
      const resPatch = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ language: 'te' }),
        signal: AbortSignal.timeout(10000)
      });
      const bodyPatch = await resPatch.json();

      const resGet = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${tokenA}` },
        signal: AbortSignal.timeout(10000)
      });
      const bodyGet = await resGet.json();

      const resInvalid = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ language: 'xx' }),
        signal: AbortSignal.timeout(10000)
      });
      const bodyInvalid = await resInvalid.json();

      const resEmpty = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000)
      });
      const bodyEmpty = await resEmpty.json();

      const okValid = resPatch.status === 200 && (bodyPatch.language === 'te' || bodyGet.language === 'te');
      const okInvalid = resInvalid.status === 400 && bodyInvalid.error?.code === 'INVALID_INPUT';
      const okEmpty = resEmpty.status === 400 && bodyEmpty.error?.code === 'INVALID_INPUT';

      if (okValid && okInvalid && okEmpty) {
        pass(5, 'PATCH /api/me validates input and persists updates');
      } else {
        fail(5, 'PATCH /api/me validation & persistence', `valid=${okValid}, invalid=${okInvalid}, empty=${okEmpty}`);
      }
    } catch (e) {
      fail(5, 'PATCH /api/me validation & persistence', e.message);
    }

    // Check 6: GET /api/nope -> 404 in the standard { error: { code, message } } shape
    try {
      const res = await fetch(`${baseUrl}/api/nope`, { signal: AbortSignal.timeout(10000) });
      const body = await res.json();
      if (res.status === 404 && body.error?.code && body.error?.message) {
        pass(6, 'GET /api/nope returns 404 with standard error shape');
      } else {
        fail(6, 'GET /api/nope returns 404 standard error shape', `status=${res.status}`);
      }
    } catch (e) {
      fail(6, 'GET /api/nope returns 404 standard error shape', e.message);
    }

    // Check 7: GET /api/cron/keepalive without the secret -> 401
    try {
      const res = await fetch(`${baseUrl}/api/cron/keepalive`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 401) {
        pass(7, 'GET /api/cron/keepalive without secret returns 401');
      } else {
        fail(7, 'GET /api/cron/keepalive without secret returns 401', `status=${res.status}`);
      }
    } catch (e) {
      fail(7, 'GET /api/cron/keepalive without secret returns 401', e.message);
    }

    // --- DATABASE CHECKS (RLS & Grants) ---

    // Check 8: A inserts product {name:"Sugar", base_unit:"kg", low_stock_threshold:5} -> ok
    try {
      const { data, error } = await clientA
        .from('products')
        .insert({ name: 'Sugar', base_unit: 'kg', low_stock_threshold: 5 })
        .select()
        .single();

      if (!error && data?.id) {
        productId = data.id;
        pass(8, 'User A inserts product successfully');
      } else {
        fail(8, 'User A inserts product', error?.message || 'No id returned');
      }
    } catch (e) {
      fail(8, 'User A inserts product', e.message);
    }

    // Check 9: A inserting product with current_qty:999, A updating current_qty, A inserting into stock_movements, A deleting product -> ALL error
    try {
      const { error: err1 } = await clientA
        .from('products')
        .insert({ name: 'Salt', base_unit: 'kg', low_stock_threshold: 1, current_qty: 999 });

      const { error: err2 } = await clientA
        .from('products')
        .update({ current_qty: 999 })
        .eq('id', productId);

      const { error: err3 } = await clientA
        .from('stock_movements')
        .insert({ product_id: productId, type: 'in', delta_base: 10, balance_after: 10 });

      const { error: err4 } = await clientA
        .from('products')
        .delete()
        .eq('id', productId);

      if (err1 && err2 && err3 && err4) {
        pass(9, 'Direct writes to current_qty, manual ledger insert, and product deletion are blocked by grants');
      } else {
        fail(9, 'Unauthorized direct writes blocked', `insertQty=${!!err1}, updateQty=${!!err2}, insertMove=${!!err3}, deleteProd=${!!err4}`);
      }
    } catch (e) {
      fail(9, 'Unauthorized direct writes blocked', e.message);
    }

    // Check 10: B selects products -> []; B calls rpc apply_stock_movement on A's product -> error PRODUCT_NOT_FOUND
    try {
      const { data: bProducts, error: bSelectErr } = await clientB.from('products').select('*');
      const isBEmpty = !bSelectErr && Array.isArray(bProducts) && bProducts.length === 0;

      const { error: bRpcErr } = await clientB.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_type: 'in',
        p_qty_base: 5
      });
      const isNotFound = bRpcErr && (bRpcErr.message?.includes('PRODUCT_NOT_FOUND') || bRpcErr.details?.includes('PRODUCT_NOT_FOUND'));

      if (isBEmpty && isNotFound) {
        pass(10, 'Tenant isolation: User B cannot see or manipulate User A products (PRODUCT_NOT_FOUND)');
      } else {
        fail(10, 'Tenant isolation', `bEmpty=${isBEmpty}, notFound=${isNotFound}`);
      }
    } catch (e) {
      fail(10, 'Tenant isolation', e.message);
    }

    // Check 11: B inserts an alias pointing at A's product_id -> error
    try {
      const { error: aliasErr } = await clientB
        .from('product_aliases')
        .insert({ product_id: productId, alias: 'Cheeni', language: 'hi' });

      if (aliasErr) {
        pass(11, 'Cross-tenant foreign key violation on product_aliases is blocked');
      } else {
        fail(11, 'Cross-tenant alias insertion blocked', 'No error was returned');
      }
    } catch (e) {
      fail(11, 'Cross-tenant alias insertion blocked', e.message);
    }

    // Check 12: anon client: select on products -> error or empty; rpc apply_stock_movement -> error
    try {
      const { data: anonProducts, error: anonSelectErr } = await anonClient.from('products').select('*');
      const isAnonSelectSafe = !!anonSelectErr || (Array.isArray(anonProducts) && anonProducts.length === 0);

      const { error: anonRpcErr } = await anonClient.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_type: 'in',
        p_qty_base: 1
      });
      const isAnonRpcBlocked = !!anonRpcErr;

      if (isAnonSelectSafe && isAnonRpcBlocked) {
        pass(12, 'Anonymous access to products table and RPC functions is blocked');
      } else {
        fail(12, 'Anonymous access blocked', `selectSafe=${isAnonSelectSafe}, rpcBlocked=${isAnonRpcBlocked}`);
      }
    } catch (e) {
      fail(12, 'Anonymous access blocked', e.message);
    }

    // Check 13: A calls rpc apply_stock_movement (p_type "in", p_qty_base 10, p_idempotency_key "K1") twice -> same movement id both times and product qty is 10, not 20
    try {
      const { data: call1, error: errCall1 } = await clientA.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_type: 'in',
        p_qty_base: 10,
        p_idempotency_key: 'K1'
      });

      const { data: call2, error: errCall2 } = await clientA.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_type: 'in',
        p_qty_base: 10,
        p_idempotency_key: 'K1'
      });

      const { data: prodData, error: prodErr } = await clientA
        .from('products')
        .select('current_qty')
        .eq('id', productId)
        .single();

      const sameId = call1?.id && call1.id === call2?.id;
      const qtyTen = !prodErr && Number(prodData?.current_qty) === 10;

      if (!errCall1 && !errCall2 && sameId && qtyTen) {
        pass(13, 'RPC apply_stock_movement idempotency verified (same ID, quantity is 10 not 20)');
      } else {
        fail(13, 'RPC apply_stock_movement idempotency', `sameId=${sameId}, qtyTen=${qtyTen}`);
      }
    } catch (e) {
      fail(13, 'RPC apply_stock_movement idempotency', e.message);
    }

    // Check 14: A fires 20 PARALLEL rpc apply_stock_movement (out, 1, distinct idempotency keys) -> exactly 10 succeed, 10 fail with INSUFFICIENT_STOCK; final qty 0; sum of ledger delta_base = 0
    try {
      const promises = [];
      const timestamp = Date.now();
      for (let i = 1; i <= 20; i++) {
        promises.push(
          clientA.rpc('apply_stock_movement', {
            p_product_id: productId,
            p_type: 'out',
            p_qty_base: 1,
            p_idempotency_key: `out-${timestamp}-${i}`
          })
        );
      }

      const results = await Promise.all(promises);
      let successCount = 0;
      let insufficientCount = 0;

      for (const res of results) {
        if (!res.error && res.data) {
          successCount++;
        } else if (res.error?.message?.includes('INSUFFICIENT_STOCK') || res.error?.details?.includes('INSUFFICIENT_STOCK')) {
          insufficientCount++;
        }
      }

      const { data: prod14, error: prod14Err } = await clientA
        .from('products')
        .select('current_qty')
        .eq('id', productId)
        .single();

      const { data: ledger, error: ledgerErr } = await clientA
        .from('stock_movements')
        .select('delta_base')
        .eq('product_id', productId);

      const sumDelta = ledger ? ledger.reduce((acc, row) => acc + Number(row.delta_base), 0) : null;
      const isQtyZero = !prod14Err && Number(prod14?.current_qty) === 0;
      const isSumZero = sumDelta !== null && Math.abs(sumDelta) < 0.001;

      if (successCount === 10 && insufficientCount === 10 && isQtyZero && isSumZero) {
        pass(14, 'Concurrency test: 20 parallel movements -> 10 succeed, 10 INSUFFICIENT_STOCK, final qty 0, ledger sum 0');
      } else {
        fail(
          14,
          'Concurrency test',
          `successes=${successCount}/10, insufficient=${insufficientCount}/10, qtyZero=${isQtyZero}, sumZero=${isSumZero}`
        );
      }
    } catch (e) {
      fail(14, 'Concurrency test', e.message);
    }

    // Check 15: A: rpc in 5, then undo_stock_movement on it (ok), then undo it again -> second call fails with ALREADY_UNDONE
    try {
      const { data: move15, error: err15In } = await clientA.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_type: 'in',
        p_qty_base: 5,
        p_idempotency_key: `in5-${Date.now()}`
      });

      const { error: errUndo1 } = await clientA.rpc('undo_stock_movement', {
        p_movement_id: move15?.id
      });

      const { error: errUndo2 } = await clientA.rpc('undo_stock_movement', {
        p_movement_id: move15?.id
      });

      const isUndo2AlreadyUndone =
        errUndo2 &&
        (errUndo2.message?.includes('ALREADY_UNDONE') || errUndo2.details?.includes('ALREADY_UNDONE'));

      if (!err15In && move15?.id && !errUndo1 && isUndo2AlreadyUndone) {
        pass(15, 'RPC undo_stock_movement reverses movement and blocks repeated undo with ALREADY_UNDONE');
      } else {
        fail(
          15,
          'RPC undo_stock_movement',
          `inOk=${!err15In}, undo1Ok=${!errUndo1}, undo2AlreadyUndone=${isUndo2AlreadyUndone}`
        );
      }
    } catch (e) {
      fail(15, 'RPC undo_stock_movement', e.message);
    }
  } finally {
    // ALWAYS delete both users in a finally block
    if (userAId) {
      try {
        await adminClient.auth.admin.deleteUser(userAId);
      } catch (err) {
        console.warn('Cleanup User A error:', err.message);
      }
    }
    if (userBId) {
      try {
        await adminClient.auth.admin.deleteUser(userBId);
      } catch (err) {
        console.warn('Cleanup User B error:', err.message);
      }
    }
  }

  console.log(`\n${passedChecks}/${totalChecks} checks passed`);
  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during verification:', err.message);
  process.exit(1);
});
