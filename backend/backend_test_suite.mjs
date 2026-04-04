import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';
const BASE_URL = 'http://localhost:3005/api';

async function runTests() {
  console.log('🧪 Starting AceTrack Backend Validation Suite (v2.6.3)\n');
  
  let results = {
    pass: 0,
    fail: 0,
    details: []
  };

  const test = async (name, fn) => {
    try {
      await fn();
      results.pass++;
      results.details.push(`✅ [PASS] ${name}`);
      console.log(`✅ [PASS] ${name}`);
    } catch (e) {
      results.fail++;
      results.details.push(`❌ [FAIL] ${name}: ${e.message}`);
      console.log(`❌ [FAIL] ${name}: ${e.message}`);
    }
  };

  // 1. Security Check (Unauthorized)
  await test('Security: Reject missing API Key', async () => {
    const res = await fetch(`${BASE_URL}/status`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 2. Pulse Check
  await test('Pulse: Server Status & Version', async () => {
    const res = await fetch(`${BASE_URL}/status`, {
      headers: { 'x-ace-api-key': API_KEY }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.latestAppVersion) throw new Error('Missing application version in response');
  });

  // 3. Data Retrieval
  let currentVersion = 1;
  await test('Data: Initial State Fetch', async () => {
    const res = await fetch(`${BASE_URL}/data`, {
      headers: { 'x-ace-api-key': API_KEY }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    currentVersion = data.version || 1;
    console.log(`   (Current Server Version: v${currentVersion})`);
  });

  // 4. Synchronization (OCC Conflict Test)
  await test('Sync: Optimistic Concurrency Control (Conflict)', async () => {
    const res = await fetch(`${BASE_URL}/save`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: currentVersion - 1, // Intentional conflict
        tournaments: []
      })
    });
    if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
    const data = await res.json();
    if (!data.error.includes('Conflict')) throw new Error('Response did not contain conflict error message');
  });

  // 5. Successful Sync & Hashing Test
  await test('Sync: Successful Tournament Injection & OTP Hashing', async () => {
    const testTourneyId = `test_t_${Date.now()}`;
    const res = await fetch(`${BASE_URL}/save`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: currentVersion,
        tournaments: [{
          id: testTourneyId,
          title: 'Backend Validation Test',
          startOtp: '123456', // Should be hashed
          endOtp: '654321'    // Should be hashed
        }]
      })
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const saveResult = await res.json();
    
    // Verify hashing (FETCH BACK)
    const fetchRes = await fetch(`${BASE_URL}/data`, {
      headers: { 'x-ace-api-key': API_KEY }
    });
    const masterData = await fetchRes.json();
    const tourney = masterData.tournaments?.find(t => t.id === testTourneyId);
    if (!tourney) throw new Error('Injected tournament not found in master state');
    
    // Check if OTPs are hashed (Bcrypt hashes start with $2)
    if (!tourney.startOtp.startsWith('$2')) throw new Error('startOtp was NOT hashed in the database');
    if (!tourney.endOtp.startsWith('$2')) throw new Error('endOtp was NOT hashed in the database');
    
    console.log('   (Verified: Tournament OTPs were hashed successfully)');
  });

  // 6. Diagnostics Upload Task
  await test('Diagnostics: Report Upload & Cloud Mirroring', async () => {
    const res = await fetch(`${BASE_URL}/diagnostics`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'test_validator',
        prefix: 'manual_upload',
        logs: [{ timestamp: new Date().toISOString(), level: 'INFO', type: 'TEST', message: 'Backend validation pulse' }]
      })
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    if (!data.filename) throw new Error('Missing filename in diagnostic response');
    
    // Verify readability
    const readRes = await fetch(`${BASE_URL}/diagnostics/${data.filename}`, {
      headers: { 'x-ace-api-key': API_KEY }
    });
    if (!readRes.ok) throw new Error(`Could not retrieve uploaded diagnostic [${data.filename}]`);
  });

  console.log('\n📊 Final Test Summary:');
  console.log(`   TOTAL: ${results.pass + results.fail}`);
  console.log(`   PASSED: ${results.pass}`);
  console.log(`   FAILED: ${results.fail}`);
  
  if (results.fail > 0) process.exit(1);
}

runTests().catch(e => {
  console.error('\n💥 FATAL ERROR during test execution:', e);
  process.exit(1);
});
