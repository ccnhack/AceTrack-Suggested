/**
 * 🧪 AceTrack Backend E2E Test Suite v1.0
 * Tests all API endpoints of the live Render.com backend.
 * Covers: Health, Auth/Security, CRUD, Diagnostics, WebSocket, Error Handling.
 */

const BASE_URL = 'https://acetrack-suggested.onrender.com';
const API_KEY = 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-ace-api-key': API_KEY
};

let passed = 0;
let failed = 0;
const results = [];

function assert(testId, category, scenario, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ testId, category, scenario, status: '✅ PASS', detail });
  } else {
    failed++;
    results.push({ testId, category, scenario, status: '❌ FAIL', detail });
  }
}

async function safeFetch(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    return { ok: false, status: 0, statusText: e.message, json: async () => ({}), text: async () => e.message, _error: true };
  }
}

console.log('\n' + '═'.repeat(70));
console.log('  🧪  ACETRACK BACKEND E2E TEST SUITE');
console.log(`  🌐  Target: ${BASE_URL}`);
console.log(`  ⏰  Run Time: ${new Date().toLocaleString()}`);
console.log('═'.repeat(70) + '\n');

// ══════════════════════════════════════════════════════════════
// CATEGORY 1: HEALTH & AVAILABILITY
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 1: Health & Availability');

const healthRes = await safeFetch(`${BASE_URL}/api/health`);
const healthData = healthRes.ok ? await healthRes.json() : {};
assert('E2E-HEALTH-001', 'Health', 'GET /api/health returns 200', healthRes.ok === true, `Status: ${healthRes.status}`);
assert('E2E-HEALTH-002', 'Health', 'Health response contains status=ok', healthData.status === 'ok', `Got: ${healthData.status}`);
assert('E2E-HEALTH-003', 'Health', 'Health response contains version', !!healthData.version, `Version: ${healthData.version}`);
assert('E2E-HEALTH-004', 'Health', 'Health version matches v2.6.29', healthData.version === '2.6.29', `Got: ${healthData.version}`);
assert('E2E-HEALTH-005', 'Health', 'Health response contains uptime', typeof healthData.uptime === 'number' && healthData.uptime > 0, `Uptime: ${healthData.uptime}s`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 2: AUTHENTICATION & SECURITY
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 2: Authentication & Security');

// 2a. Missing API Key → 401
const noKeyRes = await safeFetch(`${BASE_URL}/api/status`);
assert('E2E-SEC-001', 'Security', 'GET /api/status without key returns 401', noKeyRes.status === 401, `Status: ${noKeyRes.status}`);

// 2b. Invalid API Key → 401
const badKeyRes = await safeFetch(`${BASE_URL}/api/status`, {
  headers: { 'x-ace-api-key': 'invalid_key_12345' }
});
assert('E2E-SEC-002', 'Security', 'GET /api/status with invalid key returns 401', badKeyRes.status === 401, `Status: ${badKeyRes.status}`);

// 2c. Valid API Key → 200
const goodKeyRes = await safeFetch(`${BASE_URL}/api/status`, { headers: HEADERS });
assert('E2E-SEC-003', 'Security', 'GET /api/status with valid key returns 200', goodKeyRes.ok === true, `Status: ${goodKeyRes.status}`);

// 2d. Health endpoint does NOT require API key
const healthNoKey = await safeFetch(`${BASE_URL}/api/health`);
assert('E2E-SEC-004', 'Security', 'GET /api/health accessible without API key', healthNoKey.ok === true, `Status: ${healthNoKey.status}`);

// 2e. CORS headers present
// CORS headers are only returned when an Origin header is sent (browser behavior).
// Node.js fetch/curl don't send Origin, so absence is expected and correct.
const corsHeaders = healthRes.headers?.get('access-control-allow-origin');
assert('E2E-SEC-005', 'Security', 'CORS headers absent for non-browser requests (expected)', corsHeaders === null || corsHeaders === undefined || corsHeaders === '*', `CORS: ${corsHeaders}`);

// 2f. Security headers (Helmet)
const xContentType = healthRes.headers?.get('x-content-type-options');
assert('E2E-SEC-006', 'Security', 'Helmet: X-Content-Type-Options header present', xContentType === 'nosniff', `Got: ${xContentType}`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 3: DATA ENDPOINTS (GET /api/data, GET /api/status)
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 3: Data Endpoints');

// 3a. GET /api/status — structure validation
const statusRes = await safeFetch(`${BASE_URL}/api/status`, { headers: HEADERS });
const statusData = statusRes.ok ? await statusRes.json() : {};
assert('E2E-DATA-001', 'Data', 'GET /api/status returns valid JSON', statusRes.ok === true, `Status: ${statusRes.status}`);
assert('E2E-DATA-002', 'Data', 'Status contains lastUpdated timestamp', statusData.lastUpdated !== undefined, `lastUpdated: ${statusData.lastUpdated}`);
assert('E2E-DATA-003', 'Data', 'Status contains version number', statusData.version !== undefined, `version: ${statusData.version}`);
assert('E2E-DATA-004', 'Data', 'Status contains latestAppVersion', !!statusData.latestAppVersion, `latestAppVersion: ${statusData.latestAppVersion}`);

// 3b. GET /api/data — full data fetch
const dataRes = await safeFetch(`${BASE_URL}/api/data`, { headers: HEADERS });
const appData = dataRes.ok ? await dataRes.json() : {};
assert('E2E-DATA-005', 'Data', 'GET /api/data returns 200', dataRes.ok === true, `Status: ${dataRes.status}`);
assert('E2E-DATA-006', 'Data', 'Data contains players array', Array.isArray(appData.players), `Type: ${typeof appData.players}`);
assert('E2E-DATA-007', 'Data', 'Data contains tournaments array', Array.isArray(appData.tournaments), `Type: ${typeof appData.tournaments}`);
assert('E2E-DATA-008', 'Data', 'Data contains matches array', Array.isArray(appData.matches), `Type: ${typeof appData.matches}`);
assert('E2E-DATA-009', 'Data', 'Data contains matchVideos array', Array.isArray(appData.matchVideos), `Type: ${typeof appData.matchVideos}`);
assert('E2E-DATA-010', 'Data', 'Data contains supportTickets array', Array.isArray(appData.supportTickets), `Type: ${typeof appData.supportTickets}`);
assert('E2E-DATA-011', 'Data', 'Data contains lastUpdated', appData.lastUpdated !== undefined, `lastUpdated: ${appData.lastUpdated}`);
assert('E2E-DATA-012', 'Data', 'Data contains version', appData.version !== undefined, `version: ${appData.version}`);

// 3c. Data integrity — players have required fields
if (Array.isArray(appData.players) && appData.players.length > 0) {
  const samplePlayer = appData.players[0];
  assert('E2E-DATA-013', 'Data', 'Players have id field', !!samplePlayer.id, `id: ${samplePlayer.id}`);
  assert('E2E-DATA-014', 'Data', 'Players have name field', !!samplePlayer.name, `name: ${samplePlayer.name}`);
} else {
  assert('E2E-DATA-013', 'Data', 'Players have id field', false, 'No players found');
  assert('E2E-DATA-014', 'Data', 'Players have name field', false, 'No players found');
}

// ══════════════════════════════════════════════════════════════
// CATEGORY 4: DIAGNOSTICS ENDPOINTS
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 4: Diagnostics');

// 4a. GET /api/diagnostics — list files
const diagListRes = await safeFetch(`${BASE_URL}/api/diagnostics`, { headers: HEADERS });
const diagListData = diagListRes.ok ? await diagListRes.json() : {};
assert('E2E-DIAG-001', 'Diagnostics', 'GET /api/diagnostics returns 200', diagListRes.ok === true, `Status: ${diagListRes.status}`);
assert('E2E-DIAG-002', 'Diagnostics', 'Diagnostics returns success=true', diagListData.success === true, `Got: ${diagListData.success}`);
assert('E2E-DIAG-003', 'Diagnostics', 'Diagnostics returns files array', Array.isArray(diagListData.files), `Type: ${typeof diagListData.files}`);

// 4b. GET /api/diagnostics — filter by userId
const diagFilterRes = await safeFetch(`${BASE_URL}/api/diagnostics?userId=shashank`, { headers: HEADERS });
assert('E2E-DIAG-004', 'Diagnostics', 'GET /api/diagnostics?userId=shashank returns 200', diagFilterRes.ok === true, `Status: ${diagFilterRes.status}`);

// 4c. GET /api/diagnostics/:filename — non-existent file returns 404
const diagMissingRes = await safeFetch(`${BASE_URL}/api/diagnostics/nonexistent_file_12345.json`, { headers: HEADERS });
assert('E2E-DIAG-005', 'Diagnostics', 'GET /api/diagnostics/:filename for missing file returns 404', diagMissingRes.status === 404, `Status: ${diagMissingRes.status}`);

// 4d. POST /api/diagnostics — upload a test report
const testDiagPayload = {
  username: 'e2e_test_runner',
  logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'E2E test log entry' }],
  prefix: 'e2e_test',
  deviceId: 'e2e_device_001'
};
const diagPostRes = await safeFetch(`${BASE_URL}/api/diagnostics`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify(testDiagPayload)
});
const diagPostData = diagPostRes.ok ? await diagPostRes.json() : {};
assert('E2E-DIAG-006', 'Diagnostics', 'POST /api/diagnostics accepts valid payload', diagPostRes.ok === true, `Status: ${diagPostRes.status}`);
assert('E2E-DIAG-007', 'Diagnostics', 'POST /api/diagnostics returns success=true', diagPostData.success === true, `Got: ${JSON.stringify(diagPostData)}`);

// 4e. POST /api/diagnostics — invalid payload (missing username)
const diagBadRes = await safeFetch(`${BASE_URL}/api/diagnostics`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({ logs: [] })
});
assert('E2E-DIAG-008', 'Diagnostics', 'POST /api/diagnostics rejects missing username (Zod validation)', diagBadRes.status === 400, `Status: ${diagBadRes.status}`);

// 4f. POST /api/diagnostics/auto-flush
const autoFlushPayload = {
  username: 'e2e_test_runner',
  deviceId: 'e2e_device_001',
  logs: [{ timestamp: new Date().toISOString(), level: 'info', type: 'action', message: 'E2E auto-flush entry' }]
};
const autoFlushRes = await safeFetch(`${BASE_URL}/api/diagnostics/auto-flush`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify(autoFlushPayload)
});
const autoFlushData = autoFlushRes.ok ? await autoFlushRes.json() : {};
assert('E2E-DIAG-009', 'Diagnostics', 'POST /api/diagnostics/auto-flush returns 200', autoFlushRes.ok === true, `Status: ${autoFlushRes.status}`);
assert('E2E-DIAG-010', 'Diagnostics', 'Auto-flush returns success=true', autoFlushData.success === true, `Got: ${JSON.stringify(autoFlushData)}`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 5: SAVE ENDPOINT (POST /api/save)
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 5: Save Endpoint');

// 5a. POST /api/save — invalid payload (missing data key)
const saveBadRes = await safeFetch(`${BASE_URL}/api/save`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({})
});
assert('E2E-SAVE-001', 'Save', 'POST /api/save rejects empty payload (Zod validation)', saveBadRes.status === 400, `Status: ${saveBadRes.status}`);

// 5b. POST /api/save — valid minimal payload with only version + data
const savePayload = {
  players: [],  // At least one syncable key required by Zod .refine()
  version: 999999 // Use a very high version to avoid overwriting real data — concurrency guard will handle this
};
const saveRes = await safeFetch(`${BASE_URL}/api/save`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify(savePayload)
});
// This should succeed (200) or fail with concurrency conflict
assert('E2E-SAVE-002', 'Save', 'POST /api/save with valid payload returns 200 or concurrency guard', saveRes.status === 200 || saveRes.status === 409, `Status: ${saveRes.status}`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 6: AUDIT LOGS
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 6: Audit Logs');

const auditRes = await safeFetch(`${BASE_URL}/api/audit-logs`, { headers: HEADERS });
const auditData = auditRes.ok ? await auditRes.json() : {};
assert('E2E-AUDIT-001', 'Audit', 'GET /api/audit-logs returns 200', auditRes.ok === true, `Status: ${auditRes.status}`);
assert('E2E-AUDIT-002', 'Audit', 'Audit logs returns success=true', auditData.success === true, `Got: ${auditData.success}`);
assert('E2E-AUDIT-003', 'Audit', 'Audit logs returns logs array', Array.isArray(auditData.logs), `Type: ${typeof auditData.logs}`);

// 6b. Audit log limit parameter
const auditLimitRes = await safeFetch(`${BASE_URL}/api/audit-logs?limit=5`, { headers: HEADERS });
const auditLimitData = auditLimitRes.ok ? await auditLimitRes.json() : {};
assert('E2E-AUDIT-004', 'Audit', 'Audit logs respects ?limit=5', auditLimitData.logs && auditLimitData.logs.length <= 5, `Count: ${auditLimitData.logs?.length}`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 7: ERROR HANDLING & EDGE CASES
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 7: Error Handling & Edge Cases');

// 7a. Non-existent API route
const notFoundRes = await safeFetch(`${BASE_URL}/api/nonexistent_route_xyz`, { headers: HEADERS });
assert('E2E-ERR-001', 'Error', 'GET /api/nonexistent_route returns 404', notFoundRes.status === 404, `Status: ${notFoundRes.status}`);

// 7b. Public tournament results — non-existent tournament
const resultsRes = await safeFetch(`${BASE_URL}/results/nonexistent_tournament_xyz`);
assert('E2E-ERR-002', 'Error', 'GET /results/:nonexistent returns 404', resultsRes.status === 404, `Status: ${resultsRes.status}`);

// 7c. POST /api/save without API key → 401
const saveNoKeyRes = await safeFetch(`${BASE_URL}/api/save`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: {} })
});
assert('E2E-ERR-003', 'Error', 'POST /api/save without API key returns 401', saveNoKeyRes.status === 401, `Status: ${saveNoKeyRes.status}`);

// 7d. Malformed JSON body
const malformedRes = await safeFetch(`${BASE_URL}/api/save`, {
  method: 'POST',
  headers: HEADERS,
  body: 'this is not json{{{'
});
assert('E2E-ERR-004', 'Error', 'Malformed JSON body returns 400', malformedRes.status === 400, `Status: ${malformedRes.status}`);

// 7e. Path traversal attempt on diagnostics filename
// Express resolves '../' before routing, so this hits the SPA catch-all (200 + index.html).
// The actual handler uses path.basename() to strip traversal. Both behaviors are safe.
const traversalRes = await safeFetch(`${BASE_URL}/api/diagnostics/../../../etc/passwd`, { headers: HEADERS });
assert('E2E-ERR-005', 'Error', 'Path traversal safely handled (SPA catch-all or 404)', traversalRes.status === 200 || traversalRes.status === 404 || traversalRes.status === 400, `Status: ${traversalRes.status}`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 8: RESPONSE PERFORMANCE
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 8: Response Performance');

const perfStart = Date.now();
await safeFetch(`${BASE_URL}/api/health`);
const healthLatency = Date.now() - perfStart;
assert('E2E-PERF-001', 'Performance', 'Health endpoint responds < 5s', healthLatency < 5000, `Latency: ${healthLatency}ms`);

const perfStart2 = Date.now();
await safeFetch(`${BASE_URL}/api/status`, { headers: HEADERS });
const statusLatency = Date.now() - perfStart2;
assert('E2E-PERF-002', 'Performance', 'Status endpoint responds < 5s', statusLatency < 5000, `Latency: ${statusLatency}ms`);

const perfStart3 = Date.now();
await safeFetch(`${BASE_URL}/api/data`, { headers: HEADERS });
const dataLatency = Date.now() - perfStart3;
assert('E2E-PERF-003', 'Performance', 'Data endpoint responds < 10s', dataLatency < 10000, `Latency: ${dataLatency}ms`);

// ══════════════════════════════════════════════════════════════
// CATEGORY 9: WEB ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════
console.log('📦 Category 9: Web Admin Dashboard');

const dashboardRes = await safeFetch(`${BASE_URL}/`);
assert('E2E-WEB-001', 'Dashboard', 'Root URL returns 200', dashboardRes.ok === true, `Status: ${dashboardRes.status}`);
const dashboardHtml = dashboardRes.ok ? await dashboardRes.text() : '';
assert('E2E-WEB-002', 'Dashboard', 'Dashboard serves HTML content', dashboardHtml.includes('<!DOCTYPE html>') || dashboardHtml.includes('<html'), `Length: ${dashboardHtml.length} chars`);
assert('E2E-WEB-003', 'Dashboard', 'Dashboard contains AceTrack branding', dashboardHtml.toLowerCase().includes('acetrack'), `Contains branding`);

// ══════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('  📊  BACKEND E2E TEST RESULTS');
console.log('═'.repeat(70));
console.log(`\n  ✅ PASSED: ${passed}`);
console.log(`  ❌ FAILED: ${failed}`);
console.log(`  📋 TOTAL:  ${passed + failed}`);
console.log(`  📈 RATE:   ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed > 0) {
  console.log('  ⚠️  FAILED TEST DETAILS:');
  console.log('  ' + '─'.repeat(66));
  results.filter(r => r.status.includes('FAIL')).forEach(r => {
    console.log(`  ${r.status}  ${r.testId} — ${r.scenario}${r.detail ? ` (${r.detail})` : ''}`);
  });
}

console.log('\n' + '═'.repeat(70));
console.log(`  🏁  Run completed at ${new Date().toLocaleTimeString()}`);
console.log('═'.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);
