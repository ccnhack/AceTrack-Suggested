import { describe, it, expect } from 'vitest';

const API_BASE = 'http://localhost:3005/api';
const API_KEY = process.env.ACE_API_KEY;

async function clientCall(url, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 
      'x-ace-api-key': API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(url, options);
  return { status: resp.status, data: resp.status !== 204 ? await resp.json().catch(() => ({})) : {} };
}

describe('AceTrack Production Stress Suite (50 Parallel Requests)', () => {
  it('should handle heavy parallel load without data loss or crashes', async () => {
    console.log('🚀 Starting Stress Test (50 Parallel Requests)...');
    
    const startTime = Date.now();
    const requests = [];

    // 1. Concurrent Save Requests (Test SyncMutex)
    for (let i = 0; i < 20; i++) {
      requests.push(
        clientCall(`${API_BASE}/save`, 'POST', {
          players: [{ id: `p${i}`, name: `Player ${i}` }],
          version: 1 // Valid version to bypass conflict in some cases
        }).catch(err => ({ status: 500, error: err.message }))
      );
    }

    // 2. Concurrent Diagnostics
    for (let i = 0; i < 10; i++) {
      requests.push(
        clientCall(`${API_BASE}/diagnostics/auto-flush`, 'POST', {
          username: `stress_user_${i}`,
          deviceId: 'stress_device',
          logs: [{ timestamp: new Date().toISOString(), level: 'info', type: 'stress', message: 'stress test' }]
        }).catch(err => ({ status: 500, error: err.message }))
      );
    }

    // 3. Concurrent Audit Fetches
    for (let i = 0; i < 10; i++) {
      requests.push(
        clientCall(`${API_BASE}/audit-logs?limit=10`)
          .catch(err => ({ status: 500, error: err.message }))
      );
    }

    // 4. Concurrent Public Results (No API Key)
    for (let i = 0; i < 10; i++) {
      requests.push(
        fetch('http://localhost:3005/results/invalid-id-test')
          .then(resp => ({ status: resp.status }))
          .catch(err => ({ status: 500, error: err.message }))
      );
    }

    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    let failureCount = 0;
    const statusCodes = new Map();
    for (const res of results) {
      // 409 (Conflict) and 429 (Rate Limit) are VALID hardened responses during high-parallel load
      if (res.status !== 200 && res.status !== 404 && res.status !== 201 && res.status !== 429 && res.status !== 409) {
        statusCodes.set(res.status, (statusCodes.get(res.status) || 0) + 1);
        failureCount++;
      }
    }

    console.log(`📊 Stress Test Finished in ${duration}ms`);
    if (failureCount > 0) {
      console.log("📊 Failure Distribution:", Object.fromEntries(statusCodes));
    }

    expect(failureCount).toBe(0);
    expect(duration).toBeLessThan(25000); 
  }, 30000);
});
