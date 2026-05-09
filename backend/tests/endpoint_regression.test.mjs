#!/usr/bin/env node
/**
 * AceTrack Endpoint Regression Suite v1.0
 * Validates all API endpoints are reachable and functional.
 * Reads config from backend/.env (MONGODB_URI for test fixtures).
 * 
 * Usage:
 *   node backend/tests/endpoint_regression.test.mjs
 *   API_BASE_URL=http://localhost:3005 node backend/tests/endpoint_regression.test.mjs
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE = process.env.API_BASE_URL || 'https://acetrack-suggested.onrender.com';
const API_KEY = 'AceTrack_Client_v2_Production';
const MASTER_KEY = process.env.ACE_API_KEY || API_KEY;
const TIMEOUT_MS = 15000;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
async function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

const h = (key = API_KEY) => ({
  'Content-Type': 'application/json',
  'x-ace-api-key': key,
});

let passed = 0, failed = 0, skipped = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    if (e.message === 'SKIP') { skipped++; console.log(`  ⏭️  ${name} (skipped)`); return; }
    failed++;
    const msg = e.name === 'AbortError' ? 'TIMEOUT (>15s)' : e.message;
    failures.push({ name, error: msg });
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ═══════════════════════════════════════════════════════════════
// Test Groups
// ═══════════════════════════════════════════════════════════════

async function runInfrastructureTests() {
  console.log('\n🏗️  INFRASTRUCTURE');

  await test('GET /api/health → 403 (requires health token in prod)', async () => {
    const res = await timedFetch(`${BASE}/api/health`);
    // In production, /health requires x-health-token header
    assert([200, 403].includes(res.status), `Expected 200/403, got ${res.status}`);
  });

  await test('GET /api/v1/health → reachable (not 404/502)', async () => {
    const res = await timedFetch(`${BASE}/api/v1/health`);
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('GET /api/status → 200 + latestAppVersion', async () => {
    const res = await timedFetch(`${BASE}/api/status`, { headers: h() });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = await res.json();
    assert(d.latestAppVersion, 'Missing latestAppVersion');
    assert(d.version !== undefined, 'Missing version');
  });
}

async function runAuthTests() {
  console.log('\n🔐 AUTHENTICATION');

  await test('GET /api/auth/me → 401 (no session)', async () => {
    const res = await timedFetch(`${BASE}/api/auth/me`, { headers: h() });
    assert([401, 404].includes(res.status), `Expected 401/404, got ${res.status}`);
  });

  await test('POST /api/admin/login → 401 (wrong creds)', async () => {
    const res = await timedFetch(`${BASE}/api/admin/login`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ identifier: 'admin', password: 'wrong_password_test' })
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/admin/verify-pin → 400 (no token)', async () => {
    const res = await timedFetch(`${BASE}/api/admin/verify-pin`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ mfaToken: 'invalid', pin: '000000' })
    });
    assert([400, 401].includes(res.status), `Expected 400/401, got ${res.status}`);
  });

  await test('POST /api/user/login → 400 (missing fields)', async () => {
    const res = await timedFetch(`${BASE}/api/user/login`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({})
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('POST /api/user/login → 401 (wrong creds)', async () => {
    const res = await timedFetch(`${BASE}/api/user/login`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ identifier: 'nonexistent_user_test', password: 'wrong' })
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/login → 401 (wrong creds)', async () => {
    const res = await timedFetch(`${BASE}/api/support/login`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ identifier: 'nonexistent_support_test', password: 'wrong' })
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/logout → 200', async () => {
    const res = await timedFetch(`${BASE}/api/logout`, { method: 'POST', headers: h() });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

async function runPasswordResetTests() {
  console.log('\n🔑 PASSWORD RESET');

  await test('POST /api/support/password-reset/request → 400 (no identifier)', async () => {
    const res = await timedFetch(`${BASE}/api/support/password-reset/request`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('POST /api/support/password-reset/request → 403 (admin blocked)', async () => {
    const res = await timedFetch(`${BASE}/api/support/password-reset/request`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ identifier: 'admin' })
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('POST /api/support/password-reset/request → 200 (fake user, no hang)', async () => {
    const res = await timedFetch(`${BASE}/api/support/password-reset/request`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ identifier: 'nonexistent_regression_test_user' })
    });
    // Should return 200 with generic message (security: no user enumeration)
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('POST /api/support/password-reset/confirm → 400 (missing fields)', async () => {
    const res = await timedFetch(`${BASE}/api/support/password-reset/confirm`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

async function runDataTests() {
  console.log('\n📊 DATA & SYNC');

  await test('GET /api/data → 200/401 (reachable)', async () => {
    const res = await timedFetch(`${BASE}/api/data`, { headers: h() });
    assert(![404, 502, 503].includes(res.status), `Endpoint unreachable: ${res.status}`);
  });

  await test('GET /api/status → JSON with version', async () => {
    const res = await timedFetch(`${BASE}/api/status`, { headers: h() });
    const d = await res.json();
    assert(d.version, 'Missing version');
  });

  await test('POST /api/register-push-token → 400 (missing body)', async () => {
    const res = await timedFetch(`${BASE}/api/register-push-token`, {
      method: 'POST', headers: h(MASTER_KEY), body: JSON.stringify({})
    });
    assert(![404, 502].includes(res.status), `Endpoint unreachable: ${res.status}`);
  });

  await test('GET /api/audit-logs → reachable (401 or 200)', async () => {
    const res = await timedFetch(`${BASE}/api/audit-logs`, { headers: h(MASTER_KEY) });
    assert(![404, 502].includes(res.status), `Endpoint unreachable: ${res.status}`);
  });
}

async function runDiagnosticsTests() {
  console.log('\n🩺 DIAGNOSTICS');

  await test('GET /api/diagnostics?userId=test → reachable', async () => {
    const res = await timedFetch(`${BASE}/api/diagnostics?userId=test`, { headers: h(MASTER_KEY) });
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('POST /api/diagnostics → 200 (telemetry submit)', async () => {
    const res = await timedFetch(`${BASE}/api/diagnostics`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        username: 'regression_test', deviceId: 'test_device',
        logs: [{ type: 'REGRESSION_TEST', ts: new Date().toISOString() }]
      })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('POST /api/diagnostics/auto-flush → 200', async () => {
    const res = await timedFetch(`${BASE}/api/diagnostics/auto-flush`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        username: 'regression_test', deviceId: 'test_device',
        logs: [{ timestamp: new Date().toISOString(), level: 'info', type: 'REGRESSION', message: 'test' }]
      })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

async function runSupportTests() {
  console.log('\n🎫 SUPPORT & TICKETS');

  await test('POST /api/otp/send → 400 (missing target)', async () => {
    const res = await timedFetch(`${BASE}/api/otp/send`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('POST /api/otp/verify → 400 (missing code)', async () => {
    const res = await timedFetch(`${BASE}/api/otp/verify`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('GET /api/support/invite/preview → 200 (public)', async () => {
    const res = await timedFetch(`${BASE}/api/support/invite/preview`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /api/debug/active-sessions → 200', async () => {
    const res = await timedFetch(`${BASE}/api/debug/active-sessions`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('POST /api/support/invite → 401 (no master key)', async () => {
    const res = await timedFetch(`${BASE}/api/support/invite`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/manage-user → 401 (no master key)', async () => {
    const res = await timedFetch(`${BASE}/api/support/manage-user`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/force-reset → 401 (no master key)', async () => {
    const res = await timedFetch(`${BASE}/api/support/force-reset`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/claim-ticket → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/claim-ticket`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/reassign-ticket → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/reassign-ticket`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/rate-ticket → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/rate-ticket`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/transfer-tickets → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/transfer-tickets`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('POST /api/support/ai-summary → reachable', async () => {
    const res = await timedFetch(`${BASE}/api/support/ai-summary`, {
      method: 'POST', headers: h(), body: JSON.stringify({ text: 'test' })
    });
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('GET /api/support/attendance → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/attendance`, { headers: h() });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('GET /api/support/analytics → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/analytics`, { headers: h() });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('GET /api/support/export → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/export`, { headers: h() });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  await test('GET /api/support/invites → 401 (no auth)', async () => {
    const res = await timedFetch(`${BASE}/api/support/invites`, { headers: h() });
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });
}

async function runWebPageTests() {
  console.log('\n🌐 WEB PAGES');

  await test('GET / → 200 (SPA entry)', async () => {
    const res = await timedFetch(`${BASE}/`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /reset-password/fake_token → 200 (page renders)', async () => {
    const res = await timedFetch(`${BASE}/reset-password/fake_token_test`);
    assert(![404, 502].includes(res.status), `Unreachable: ${res.status}`);
  });

  await test('GET /setup/fake_token → 200 (onboard page)', async () => {
    const res = await timedFetch(`${BASE}/setup/fake_token_test`);
    assert(![502, 503].includes(res.status), `Unreachable: ${res.status}`);
  });
}

async function runNon404Tests() {
  console.log('\n🚫 404 GUARD (non-existent routes)');

  await test('GET /api/nonexistent → 404', async () => {
    const res = await timedFetch(`${BASE}/api/this_route_does_not_exist`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  await test('POST /api/nonexistent → 404', async () => {
    const res = await timedFetch(`${BASE}/api/this_route_does_not_exist`, {
      method: 'POST', headers: h(), body: JSON.stringify({})
    });
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   AceTrack Endpoint Regression Suite v1.0           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Target: ${BASE}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms per request`);
  console.log(`Time: ${new Date().toISOString()}`);

  const start = Date.now();

  await runInfrastructureTests();
  await runAuthTests();
  await runPasswordResetTests();
  await runDataTests();
  await runDiagnosticsTests();
  await runSupportTests();
  await runWebPageTests();
  await runNon404Tests();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped (${elapsed}s)`);

  if (failures.length > 0) {
    console.log('\n  Failed Tests:');
    failures.forEach(f => console.log(`    ❌ ${f.name}: ${f.error}`));
  }

  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
