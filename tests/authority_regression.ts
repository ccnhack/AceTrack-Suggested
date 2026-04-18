/**
 * 🛡️ DEEP TRIDECA-GUARD AUTHORITY REGRESSION
 * Verifies the 13 layers of architectural integrity in SyncManager.
 */

import logger from '../utils/logger';
import MatchService from '../services/MatchService';
import { SyncManager } from '../services/SyncManager';

// ──────────────────────────────────────────────
// MOCK FOUNDATION
// ──────────────────────────────────────────────

let store = new Map();
let storageQueue = Promise.resolve();

// Mock storage bridge (Matching the interface in SyncManager)
const mockStorage = {
  getItem: async (key) => store.get(key) || null,
  setItem: async (key, value) => {
    storageQueue = storageQueue.then(() => { store.set(key, value); });
    return storageQueue;
  },
  removeItem: async (key) => {
    storageQueue = storageQueue.then(() => { store.delete(key); });
    return storageQueue;
  },
  runAtomic: async (action) => {
    storageQueue = storageQueue.then(action).catch(e => console.error(e));
    return storageQueue;
  },
  getSystemFlag: async (key) => store.get(`flag_${key}`) || null,
  setSystemFlag: async (key, value) => { store.set(`flag_${key}`, value); },
  getQueueLength: () => 0
};

// Injection: Override the internal storage reference for testing
// Note: In a real environment we'd use jest.mock, here we rely on the singleton pattern.
const syncManager = SyncManager.getInstance();
(syncManager as any).storage = mockStorage; // Direct injection

// ──────────────────────────────────────────────
// TEST UTILITIES
// ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(scenario, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${scenario}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${scenario} | ${detail}`);
  }
}

async function runAuthorityTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('  🛡️  DEEP TRIDECA-GUARD AUTHORITY — REGRESSION REPORT');
  console.log('  ⏰  Run Time:', new Date().toLocaleString());
  console.log('═'.repeat(70) + '\n');

  // TEST 1: Atomicity & Concurrency (Guard 8)
  console.log('📦 Layer 8: Atomicity & Sequencing');
  try {
    store.set('matchmaking', []);
    const match = { id: 'm1', version: 1, name: 'Initial' };
    
    // Simulate 3 rapid updates arriving simultaneously
    const updates = [
      { data: { updatedMatch: { ...match, name: 'Update 1', version: 2 } } },
      { data: { updatedMatch: { ...match, name: 'Update 2', version: 3 } } },
      { data: { updatedMatch: { ...match, name: 'Update 3', version: 4 } } }
    ];

    // Fire them all at once (Throttling will collapse them, but Atomicity ensures final state is correct)
    await Promise.all(updates.map(u => syncManager.handleMatchUpdate(u)));
    
    // Wait for the throttle window (100ms) + storage queue
    await new Promise(r => setTimeout(r, 200));
    
    const finalState = store.get('matchmaking');
    assert('Correct final state after sequence', finalState[0]?.name === 'Update 3' && finalState[0]?.version === 4);
    assert('History records all updates', (store.get('match_history_m1'))?.actions?.length === 3);
  } catch (e) {
    console.error(e);
    failed++;
  }

  // TEST 2: Chronos (Guard 10 - Logical Versioning)
  console.log('\n📦 Layer 10: Chronos Logical Versioning');
  try {
    const match = { id: 'm1', version: 10, lastUpdated: '2026-04-12T10:00:00Z' };
    store.set('matchmaking', [match]);

    // Scenario A: Stale Version (Older version should be ignored)
    const staleUpdate = { data: { updatedMatch: { ...match, version: 5, name: 'Stale' } } };
    await syncManager.handleMatchUpdate(staleUpdate);
    await new Promise(r => setTimeout(r, 150));
    assert('Stale version ignored', store.get('matchmaking')[0].version === 10);

    // Scenario B: Stale Timestamp (Same version, older time should be ignored)
    const staleTime = { data: { updatedMatch: { ...match, version: 10, lastUpdated: '2026-04-01T00:00:00Z', name: 'OldTime' } } };
    await syncManager.handleMatchUpdate(staleTime);
    await new Promise(r => setTimeout(r, 150));
    assert('Stale timestamp ignored', store.get('matchmaking')[0].lastUpdated === '2026-04-12T10:00:00Z');
  } catch (e) {
    failed++;
  }

  // TEST 3: Deep Merge Safety (Guard 9)
  console.log('\n📦 Layer 9: Deep Merge Safety');
  try {
    const match = { 
        id: 'm1', 
        version: 1, 
        metadata: { score: 10, notes: 'Stay low' },
        players: ['p1', 'p2']
    };
    store.set('matchmaking', [match]);

    // Update ONLY nested metadata
    const nestedUpdate = { data: { updatedMatch: { id: 'm1', version: 2, metadata: { score: 20 } } } };
    await syncManager.handleMatchUpdate(nestedUpdate);
    await new Promise(r => setTimeout(r, 150));

    const result = store.get('matchmaking')[0];
    assert('Nested score updated', result.metadata.score === 20);
    assert('Sibling nested data (notes) preserved', result.metadata.notes === 'Stay low');
    assert('Top-level sibling data (players) preserved', result.players.length === 2);
  } catch (e) {
    failed++;
  }

  // TEST 4: Integrity & Security (Guard 1, 3)
  console.log('\n📦 Layer 1 & 3: Security & Integrity');
  try {
    const matchId = 'm_secure';
    const initAction = { data: { updatedMatch: { id: matchId, version: 1, name: 'Secure' } } };
    await syncManager.handleMatchUpdate(initAction);
    await new Promise(r => setTimeout(r, 150));

    // Verify history exists
    const historyKey = `match_history_${matchId}`;
    let history = store.get(historyKey);
    assert('History recorded with signature', !!history.actions[0].signature);
    assert('History has checksum', !!history.checksum);

    // Scenario: Tamper detection (Modify signature)
    history.actions[0].signature = 'invalid_sig';
    store.set(historyKey, history);
    
    const replayed = await syncManager.replayMatch(matchId);
    assert('Tampered action rejected during replay', replayed === null || Object.keys(replayed).length === 0);

    // Scenario: Corruption detection (Modify checksum)
    history.checksum = 'corrupt';
    store.set(historyKey, history);
    const corruptedReplay = await syncManager.replayMatch(matchId);
    assert('Corrupted checksum rejected during replay', corruptedReplay === null);
  } catch (e) {
    failed++;
  }

  // TEST 5: Idempotency (Guard 12)
  console.log('\n📦 Layer 12: Idempotency');
  try {
    const startCount = syncManager.getMetrics().successfulUpdateCount;
    const match = { id: 'm_idem', version: 1, name: 'Identical' };
    store.set('matchmaking', [match]);

    // Send the SAME update
    const idemUpdate = { data: { updatedMatch: { ...match } } };
    await syncManager.handleMatchUpdate(idemUpdate);
    await new Promise(r => setTimeout(r, 150));

    const endCount = syncManager.getMetrics().successfulUpdateCount;
    assert('Identical update skipped (Deduplication)', endCount === startCount);
  } catch (e) {
    failed++;
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`  📊  AUTHORITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═'.repeat(70) + '\n');

  if (failed > 0) process.exit(1);
}

runAuthorityTests();
