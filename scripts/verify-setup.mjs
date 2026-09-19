import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

let passed = 0;
const total = 7;

function mask(val) {
  if (!val || typeof val !== 'string') return '(not set)';
  return val.slice(0, 6) + '…';
}

// Check 1: Node version >= 20.6
const nodeVer = process.versions.node;
const [major, minor] = nodeVer.split('.').map(Number);
if (major > 20 || (major === 20 && minor >= 6)) {
  console.log(`✅ 1. Node version >= 20.6 (${nodeVer})`);
  passed++;
} else {
  console.log(`❌ 1. Node version (${nodeVer}) is too old. Please install Node.js v20.6 or higher.`);
}

// Check 2: Env vars exist and look right
const {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
  GEMINI_API_KEY,
  GEMINI_MODEL
} = process.env;

let envErrors = [];
if (!SUPABASE_URL || !SUPABASE_URL.startsWith('https://') || !SUPABASE_URL.includes('.supabase.co')) {
  envErrors.push('SUPABASE_URL must start with https:// and contain .supabase.co');
}
if (!SUPABASE_PUBLISHABLE_KEY || !SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  envErrors.push('SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_');
}
if (!SUPABASE_SECRET_KEY || !SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
  envErrors.push('SUPABASE_SECRET_KEY must start with sb_secret_');
}
if (!GEMINI_API_KEY || (!GEMINI_API_KEY.startsWith('AIza') && !GEMINI_API_KEY.startsWith('AQ.'))) {
  envErrors.push('GEMINI_API_KEY must start with AIza');
}
if (!GEMINI_MODEL || GEMINI_MODEL.includes('2.5')) {
  envErrors.push('GEMINI_MODEL must be set and cannot contain "2.5"');
}

if (envErrors.length === 0) {
  console.log(`✅ 2. Environment variables format valid (${mask(SUPABASE_PUBLISHABLE_KEY)}, ${mask(GEMINI_API_KEY)}, model: ${GEMINI_MODEL})`);
  passed++;
} else {
  console.log(`❌ 2. Environment variables invalid: ${envErrors.join('; ')}`);
}

// Check 3: Supabase reachable and publishable key valid
try {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 200) {
    console.log('✅ 3. Supabase reachable and publishable key valid (HTTP 200)');
    passed++;
  } else {
    console.log(`❌ 3. Supabase health check returned HTTP ${res.status}. Verify SUPABASE_URL and publishable key.`);
  }
} catch (err) {
  console.log(`❌ 3. Failed to connect to Supabase: ${err.message}. Check network or SUPABASE_URL.`);
}

// Check 4: Secret key valid
try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!error) {
    console.log('✅ 4. Supabase secret key verified via admin API');
    passed++;
  } else {
    console.log(`❌ 4. Supabase admin API error: ${error.message}. Check SUPABASE_SECRET_KEY.`);
  }
} catch (err) {
  console.log(`❌ 4. Supabase client initialization failed: ${err.message}.`);
}

// Check 5: Gemini model exists for this key
try {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}`, {
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 200) {
    console.log(`✅ 5. Gemini model "${GEMINI_MODEL}" exists and is accessible`);
    passed++;
  } else {
    console.log(`❌ 5. Gemini model query returned HTTP ${res.status}. Verify GEMINI_MODEL and GEMINI_API_KEY.`);
  }
} catch (err) {
  console.log(`❌ 5. Failed to query Gemini model: ${err.message}. Check network or GEMINI_API_KEY.`);
}

// Check 6: Gemini generation works
try {
  const startTime = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 64 }
    }),
    signal: AbortSignal.timeout(10000)
  });
  const latency = Date.now() - startTime;
  if (res.status === 200) {
    console.log(`✅ 6. Gemini generation succeeded (${latency}ms)`);
    passed++;
  } else if (res.status === 429) {
    console.log('❌ 6. quota hit, wait a minute and retry');
  } else {
    console.log(`❌ 6. Gemini generation returned HTTP ${res.status}. Check GEMINI_API_KEY permissions.`);
  }
} catch (err) {
  console.log(`❌ 6. Gemini generation request failed: ${err.message}`);
}

// Check 7: Git hygiene
try {
  let isIgnored = false;
  try {
    const ignoreOut = execSync('git check-ignore .env', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (ignoreOut.includes('.env')) isIgnored = true;
  } catch {
    isIgnored = false;
  }

  let lsFilesOut = '';
  try {
    lsFilesOut = execSync('git ls-files .env', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {}

  if (isIgnored && lsFilesOut === '') {
    console.log('✅ 7. Git hygiene verified (.env is properly ignored and untracked)');
    passed++;
  } else {
    console.log('❌ 7. Git hygiene failed. Ensure .env is in .gitignore and not tracked by git.');
  }
} catch (err) {
  console.log(`❌ 7. Git hygiene check failed: ${err.message}`);
}

console.log(`\n${passed}/${total} checks passed`);
if (passed !== total) {
  process.exit(1);
}
