import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// 🛡️ WEB OBFUSCATION (v2.6.155)
// Masks structured plain-text from casual inspectors via Web Local Storage. Uses Base64+URI abstraction to handle all emojis and unicode securely.
const obfuscate = (str: string) => {
  if (!isWeb || typeof window === 'undefined') return str;
  try {
    return 'ENC:' + window.btoa(unescape(encodeURIComponent(str)));
  } catch(e) { return str; }
};

const deobfuscate = (str: string) => {
  if (!isWeb || typeof window === 'undefined' || !str || !str.startsWith('ENC:')) return str;
  try {
    return decodeURIComponent(escape(window.atob(str.substring(4))));
  } catch(e) { return str; }
};

// 🛡️ SEQUENTIAL STORAGE QUEUE: Ensures that rapid persistence calls (e.g. from sync loop)
// are executed in strict order to prevent native bridge race conditions.
let storageQueue: Promise<any> = Promise.resolve();

// 🛡️ RE-ENTRANCY GUARD: Tracks if the current execution stack is already holding the storage queue.
// This prevents deadlocks when an atomic operation (runAtomic) calls setItem/removeItem.
let isExecutingQueue = false;

const storage = {
  getItem: async (key: string) => {
    try {
      const storedValue = await AsyncStorage.getItem(key);
      if (!storedValue || storedValue === 'undefined') return null;
      
      const value = deobfuscate(storedValue);
      
      try {
        return JSON.parse(value);
      } catch (parseError) {
        console.warn(`[Storage] JSON parse failed for key "${key}", falling back to raw string value.`);
        return value;
      }
    } catch (e: any) {
      if (e.message && (e.message.includes('Row too big') || e.message.includes('CursorWindow'))) {
        console.warn(`[Storage] CursorWindow overflow for key "${key}" — auto-clearing to recover.`);
        try { await AsyncStorage.removeItem(key); } catch (_) {}
      }
      console.error('Error reading value from AsyncStorage:', e);
      return null;
    }
  },
  
  // Internal raw setter
  _setItemRaw: async (key: string, value: any) => {
    try {
      if (value === undefined) {
        await AsyncStorage.removeItem(key);
        return;
      }
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, obfuscate(jsonValue));
    } catch (e) {
      console.error(`Error writing raw value to AsyncStorage for key "${key}":`, e);
    }
  },

  setItem: async (key: string, value: any) => {
    // 🛡️ [DEADLOCK PREVENTION] 
    // If we are already executing a task in the queue, do NOT append and await.
    // Instead, execute immediately to satisfy the parent task's wait.
    if (isExecutingQueue) {
      return storage._setItemRaw(key, value);
    }

    const action = async () => {
      return storage._setItemRaw(key, value);
    };

    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  removeItem: async (key: string) => {
    if (isExecutingQueue) {
      try { await AsyncStorage.removeItem(key); } catch (_) {}
      return;
    }

    const action = async () => {
      try {
        await AsyncStorage.removeItem(key);
      } catch (e) {
        console.error(`Error removing value from AsyncStorage for key "${key}":`, e);
      }
    };
    
    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  waitForQueue: async () => {
    return storageQueue;
  },

  runAtomic: async (action: () => Promise<any>) => {
    const atomicTask = async () => {
      isExecutingQueue = true;
      try {
        return await action();
      } catch (e) {
        console.error('[Storage] Atomic operation inner error:', e);
        return null;
      } finally {
        isExecutingQueue = false;
      }
    };

    storageQueue = storageQueue.then(atomicTask).catch((e) => {
      console.error('[Storage] Atomic operation queue error:', e);
      return null;
    });
    return storageQueue;
  },

  getQueueLength: () => {
    return activeCount;
  }
};

let activeCount = 0;
const originalSetItem = storage.setItem;
const originalRemoveItem = storage.removeItem;

storage.setItem = async (key: string, value: any) => {
  activeCount++;
  try {
    return await originalSetItem(key, value);
  } finally {
    activeCount--;
  }
};

storage.removeItem = async (key: string) => {
  activeCount++;
  try {
    return await originalRemoveItem(key);
  } finally {
    activeCount--;
  }
};


/**
 * 🛡️ STORAGE OPTIMIZATION (v2.6.7)
 * Strips non-essential, high-growth fields from player objects before persistence.
 * This prevents the global 'players' list from exceeding the 2MB Android CursorWindow limit.
 */
export const thinPlayer = (p: any) => {
  if (!p) return p;
  // Keep only essential UI and ranking fields
  const { 
    id, name, avatar, rating, trueSkillRating, role, 
    matchesPlayed, wins, losses, skillLevel, city, sport,
    isApprovedCoach, coachStatus, preferredFormat, mostPlayedVenue,
    referralCode, devices, phone,
    // 🛡️ [IDENTITY_GUARD] (v2.6.121) 
    // Always preserve verification and login identifiers in the thinned list
    email, username, isEmailVerified, isPhoneVerified
  } = p;
  
  return { 
    id, name, avatar, rating, trueSkillRating, role, 
    matchesPlayed, wins, losses, skillLevel, city, sport,
    isApprovedCoach, coachStatus, preferredFormat, mostPlayedVenue,
    referralCode, devices, phone,
    email, username, isEmailVerified, isPhoneVerified,
    _thinned: true // Meta-flag for diagnostics
  };
};


export const thinPlayers = (players: any[]) => {
  if (!Array.isArray(players)) return players;
  return players.map(thinPlayer);
};

/**
 * 🛡️ PERSONAL STORAGE CAP (v2.6.7)
 * Caps a player's history and notifications to the 50 most recent entries.
 * This ensures that even the 'currentUser' key stays safely within the 2MB threshold.
 */
export const capPlayerDetail = (p: any) => {
  if (!p) return p;
  const history = Array.isArray(p.trueSkillHistory) ? p.trueSkillHistory.slice(-50) : p.trueSkillHistory;
  const notifications = Array.isArray(p.notifications) ? p.notifications.slice(0, 50) : p.notifications;
  const wallet = Array.isArray(p.walletHistory) ? p.walletHistory.slice(0, 50) : p.walletHistory;
  
  return {
    ...p,
    trueSkillHistory: history,
    notifications: notifications,
    walletHistory: wallet
  };
};

export default storage;
