import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { connectivityService } from '../services/ConnectivityService';
import { eventBus } from '../services/EventBus';

/**
 * DETERMINISTIC TEST CONTROL API
 * Injected into global scope during testing to allow Detox to
 * manipulate internal app state directly.
 * 
 * ╔══════════════════════════════════════════════════════════╗
 * ║  TEST ACCOUNT CREDENTIALS (Auto-seeded in __DEV__)      ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Role        │ Username         │ Password              ║
 * ║──────────────┼──────────────────┼───────────────────────║
 * ║  Admin       │ admin            │ Password@123          ║
 * ║  Individual  │ testindividual   │ password              ║
 * ║  Academy     │ testingacademy   │ password              ║
 * ║  Coach       │ testingcoach     │ password              ║
 * ║  Individual  │ testindividual3  │ password              ║
 * ╚══════════════════════════════════════════════════════════╝
 * 
 * Admin login is hardcoded in LoginScreen.js (no seed needed).
 * Individual/Coach/Academy accounts are seeded into local
 * storage on app startup via seedTestAccounts().
 */

const TEST_ACCOUNTS = [
  {
    id: 'testindividual',
    name: 'Test Individual',
    username: 'testindividual',
    email: 'testindividual@acetrack.test',
    phone: '+91 9000000001',
    password: 'password',
    role: 'user',
    isEmailVerified: true,
    isPhoneVerified: true,
    preferredSports: ['Tennis'],
    credits: 5000,
    avatar: 'https://ui-avatars.com/api/?name=Test+Individual&background=3B82F6&color=fff'
  },
  {
    id: 'testingacademy',
    name: 'Test Academy',
    username: 'testingacademy',
    email: 'testingacademy@acetrack.test',
    phone: '+91 9000000002',
    password: 'password',
    role: 'academy',
    isEmailVerified: true,
    isPhoneVerified: true,
    academyName: 'AceTrack Test Academy',
    credits: 5000,
    avatar: 'https://ui-avatars.com/api/?name=Test+Academy&background=10B981&color=fff'
  },
  {
    id: 'testingcoach',
    name: 'Test Coach',
    username: 'testingcoach',
    email: 'testingcoach@acetrack.test',
    phone: '+91 9000000003',
    password: 'password',
    role: 'coach',
    isEmailVerified: true,
    isPhoneVerified: true,
    isApprovedCoach: true,
    coachStatus: 'approved',
    preferredSports: ['Tennis'],
    credits: 5000,
    avatar: 'https://ui-avatars.com/api/?name=Test+Coach&background=6366F1&color=fff'
  },
  {
    id: 'testindividual2',
    name: 'Test Player Two',
    username: 'testindividual2',
    email: 'testindividual2@acetrack.test',
    phone: '+91 9000000004',
    password: 'password',
    role: 'user',
    isEmailVerified: true,
    isPhoneVerified: true,
    preferredSports: ['Tennis'],
    credits: 5000,
    avatar: 'https://ui-avatars.com/api/?name=Test+Player+Two&background=F59E0B&color=fff'
  },
  {
    id: 'testindividual3',
    name: 'Test Player Three',
    username: 'testindividual3',
    email: 'testindividual3@acetrack.test',
    phone: '+91 9000000005',
    password: 'password',
    role: 'user',
    isEmailVerified: true,
    isPhoneVerified: true,
    preferredSports: ['Tennis'],
    credits: 5000,
    avatar: 'https://ui-avatars.com/api/?name=Test+Player+Three&background=EC4899&color=fff'
  }
];

if (__DEV__ || process.env.TESTING) {
  /**
   * Seeds test accounts into local storage so Detox can
   * perform login flows without requiring a backend connection.
   */
  const seedTestAccounts = async () => {
    try {
      const existingPlayers = (await storage.getItem('players')) || [];
      const testIds = new Set(TEST_ACCOUNTS.map(a => a.id));
      
      // Remove any stale test accounts and re-seed fresh ones
      const nonTestPlayers = existingPlayers.filter(p => !testIds.has(p.id));
      const mergedPlayers = [...nonTestPlayers, ...TEST_ACCOUNTS];
      
      await storage.setItem('players', mergedPlayers);
      console.log(`🧪 [TEST_API] Seeded ${TEST_ACCOUNTS.length} test accounts. Total players: ${mergedPlayers.length}`);
    } catch (e) {
      console.error('🧪 [TEST_API] Failed to seed test accounts:', e.message);
    }
  };

  // Auto-seed on module load
  seedTestAccounts();

  global.TEST_API = {
    /**
     * Resets the application to a clean state.
     */
    resetAppState: async () => {
      console.log('🧪 [TEST_API] Resetting App State');
      const keysToClear = [
        'currentUser', 'players', 'tournaments', 'matchmaking', 
        'matchVideos', 'evaluations', 'supportTickets', 'auditLogs', 
        'sessionCustomAvatar', 'isUsingCloud'
      ];
      for (const key of keysToClear) {
        await storage.removeItem(key);
      }
      // Re-seed test accounts after clearing
      await seedTestAccounts();
      // Re-init sync manager with guest
      await syncManager.init('guest_test');
    },

    /**
     * Explicitly seed test accounts (callable from tests if needed).
     */
    seedTestAccounts,

    /**
     * Injects a specific set of mock data.
     */
    seedData: async (entity, data) => {
      console.log(`🧪 [TEST_API] Seeding ${entity}`);
      await storage.setItem(entity, data);
      eventBus.emitEntityUpdate(entity, null, 'update', 'internal');
    },

    /**
     * Toggles the connectivity state.
     */
    simulateOffline: (isOffline) => {
      console.log(`🧪 [TEST_API] Simulating ${isOffline ? 'OFFLINE' : 'ONLINE'}`);
      if (connectivityService.setForceOffline) {
        connectivityService.setForceOffline(isOffline);
      }
    },

    /**
     * Injects a specific set of mock data into the Sync loop.
     */
    injectSyncEvent: async (key, data) => {
      console.log(`🧪 [TEST_API] Injecting sync event for ${key}`);
      await syncManager.syncAndSaveData({ [key]: data }, false, true);
    },

    /**
     * Specifically simulates a malicious identity hijack attempt.
     */
    injectMaliciousUpdate: async (fakeId, fakeName) => {
      console.log(`🧪 [TEST_API] Attempting Malicious Update: ${fakeId}`);
      await syncManager.syncAndSaveData({ 
        currentUser: { id: fakeId, name: fakeName, role: 'admin' } 
      }, false, true);
    },

    /**
     * Seeds the app with expired matchmaking requests.
     */
    injectExpiredData: async (userId) => {
      console.log(`🧪 [TEST_API] Seeding expired matchmaking for ${userId}`);
      const oldDate = new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0]; // 2 days ago
      const expiredMatches = [
        { id: 'exp_1', senderId: 'saboteur', receiverId: userId, proposedDate: oldDate, proposedTime: '10:00 AM', sport: 'Tennis', status: 'Pending' },
        { id: 'exp_2', senderId: userId, receiverId: 'saboteur', proposedDate: oldDate, proposedTime: '02:00 PM', sport: 'Badminton', status: 'Countered' }
      ];
      await storage.setItem('matchmaking', expiredMatches);
      await syncManager.loadData(); // Reload memory state
    },

    /**
     * Injects a stale version into an entity to prepare for a conflict.
     */
    injectConflict: async (entityType, entityId) => {
      console.log(`🧪 [TEST_API] Injecting conflict for ${entityType}:${entityId}`);
      if (syncManager.injectStaleData) {
        await syncManager.injectStaleData(entityType, entityId);
      }
    }
  };
}
