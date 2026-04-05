import AsyncStorage from '@react-native-async-storage/async-storage';

// 🛡️ SEQUENTIAL STORAGE QUEUE: Ensures that rapid persistence calls (e.g. from sync loop)
// are executed in strict order to prevent native bridge race conditions.
let storageQueue: Promise<any> = Promise.resolve();

const storage = {
  getItem: async (key: string) => {
    try {
      const value = await AsyncStorage.getItem(key);
      if (!value || value === 'undefined') return null;
      try {
        return JSON.parse(value);
      } catch (parseError) {
        console.error(`Error parsing JSON for key "${key}":`, parseError);
        return null;
      }
    } catch (e: any) {
      // 🛡️ CursorWindow Recovery: Auto-delete the key that's too large to read
      if (e.message && (e.message.includes('Row too big') || e.message.includes('CursorWindow'))) {
        console.warn(`[Storage] CursorWindow overflow for key "${key}" — auto-clearing to recover.`);
        try { await AsyncStorage.removeItem(key); } catch (_) {}
      }
      console.error('Error reading value from AsyncStorage:', e);
      return null;
    }
  },
  
  setItem: async (key: string, value: any) => {
    // Append to the global queue to ensure sequential execution
    const action = async () => {
      try {
        if (value === undefined) {
          await AsyncStorage.removeItem(key);
          return;
        }
        const jsonValue = JSON.stringify(value);
        await AsyncStorage.setItem(key, jsonValue);
      } catch (e) {
        console.error(`Error writing value to AsyncStorage for key "${key}":`, e);
      }
    };

    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  removeItem: async (key: string) => {
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

  // 🛡️ Helper for critical waits
  waitForQueue: async () => {
    return storageQueue;
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
    referralCode
  } = p;
  
  return { 
    id, name, avatar, rating, trueSkillRating, role, 
    matchesPlayed, wins, losses, skillLevel, city, sport,
    isApprovedCoach, coachStatus, preferredFormat, mostPlayedVenue,
    referralCode,
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
