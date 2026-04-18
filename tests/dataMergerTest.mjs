/**
 * 🧪 Test Runner for DataMerger
 * Runs specific scenarios to ensure the new Pure DataMerger service 
 * maintains functional parity with the legacy logic.
 */

import dataMerger from '../services/dataMerger.ts';

// Mock dependencies since we are running in Node
const mockStorage = {
  thinPlayers: (p) => p,
  capPlayerDetail: (p) => p
};

const mockTournamentUtils = {
  parseTournamentDate: (d) => new Date(d)
};

async function runTests() {
  console.log('🧪 Starting DataMerger Unit Tests...');

  const results = {
    passed: 0,
    failed: 0
  };

  const assert = (condition, message) => {
    if (condition) {
      console.log(`✅ ${message}`);
      results.passed++;
    } else {
      console.error(`❌ ${message}`);
      results.failed++;
    }
  };

  /**
   * SCENARIO 1: Cloud Overlays Local (Cloud Wins)
   */
  try {
    const local = [{ id: 'player1', name: 'Local Name' }];
    const cloud = [{ id: 'player1', name: 'Cloud Name' }];
    const merged = dataMerger.mergePlayers(local, cloud);
    assert(merged[0].name === 'Cloud Name', 'Scenario 1: Cloud should win on conflict');
  } catch (e) {
    console.error('Scenario 1 Error:', e);
    results.failed++;
  }

  /**
   * SCENARIO 2: Avatar Buster Injection
   */
  try {
    const local = [{ id: 'p1', avatar: 'https://cloudinary.com/v1.jpg?v=old' }];
    const cloud = [{ id: 'p1', avatar: 'https://cloudinary.com/v2.jpg' }];
    const merged = dataMerger.mergePlayers(local, cloud);
    assert(merged[0].avatar.includes('?v='), 'Scenario 2: Avatar buster should be injected for new URLs');
    assert(merged[0].avatar.includes('/v2.jpg'), 'Scenario 2: Base URL should be updated');
  } catch (e) {
    console.error('Scenario 2 Error:', e);
    results.failed++;
  }

  /**
   * SCENARIO 3: Stale Tournament Payment Cleanup
   */
  try {
    const now = Date.now();
    const t_cloud = [{
      id: 't1',
      pendingPaymentPlayerIds: ['p1', 'p2'],
      pendingPaymentTimestamps: {
        'p1': now - (40 * 60 * 1000), // 40 mins ago (STALE)
        'p2': now - (10 * 60 * 1000)  // 10 mins ago (VALID)
      }
    }];
    const merged = dataMerger.mergeTournaments([], t_cloud);
    assert(merged[0].pendingPaymentPlayerIds.length === 1, 'Scenario 3: Stale pending payments should be removed');
    assert(merged[0].pendingPaymentPlayerIds[0] === 'p2', 'Scenario 3: Valid pending payments should be kept');
  } catch (e) {
    console.error('Scenario 3 Error:', e);
    results.failed++;
  }

  /**
   * SCENARIO 4: Current User Sync
   */
  try {
    const localUser = { id: 'u1', name: 'Local', avatar: 'old' };
    const cloudPlayers = [{ id: 'u1', name: 'Cloud', avatar: 'new' }];
    const merged = dataMerger.mergeCurrentUser(localUser, cloudPlayers);
    assert(merged.name === 'Cloud', 'Scenario 4: Current user should be updated from cloud matching player');
  } catch (e) {
    console.error('Scenario 4 Error:', e);
    results.failed++;
  }

  console.log('\n--- Test Summary ---');
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  if (results.failed > 0) process.exit(1);
}

runTests();
