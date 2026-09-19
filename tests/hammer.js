import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const email = `hammer-${Date.now()}@example.test`;
const password = `Pw_${crypto.randomUUID()}!`;
const { data: user, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (userErr) throw userErr;

const { data: session, error: loginErr } = await anon.auth.signInWithPassword({ email, password });
if (loginErr) throw loginErr;
const token = session.session.access_token;

// Create product with 0 stock
const createRes = await fetch('http://localhost:3000/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ name: `Hammer Stock ${Date.now()}`, base_unit: 'kg', low_stock_threshold: 5 })
});
const prod = await createRes.json();
console.log('Created product:', prod.id, 'current_qty:', prod.current_qty);

// Add 10 kg
await fetch(`http://localhost:3000/api/products/${prod.id}/stock`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ type: 'in', qty: 10, idempotency_key: `in-${Date.now()}` })
});
console.log('Added 10 kg stock. Now hammering 10 concurrent requests for 15 kg OUT (exceeding 10 kg available)...');

const requests = Array.from({ length: 10 }).map((_, i) =>
  fetch(`http://localhost:3000/api/products/${prod.id}/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'out', qty: 15, idempotency_key: `hammer-out-${i}-${Date.now()}` })
  }).then(async res => ({ status: res.status, body: await res.json() }))
);

const results = await Promise.all(requests);
let all409 = true;
results.forEach((r, idx) => {
  console.log(`Request #${idx + 1}: HTTP ${r.status} | code=${r.body.error?.code} | details=${r.body.error?.details}`);
  if (r.status !== 409 || r.body.error?.code !== 'INSUFFICIENT_STOCK') {
    all409 = false;
  }
});

console.log('All 10 requests returned 409 INSUFFICIENT_STOCK:', all409);

await admin.auth.admin.deleteUser(user.user.id);
console.log('Cleaned up test user.');
