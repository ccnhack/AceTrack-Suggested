import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * 🔐 PRODUCTION-GRADE WEB SECURITY POLICY (v2.6.155)
 * Defines where specific data types are allowed to be stored on Web.
 * Native (iOS/Android) continues to use encrypted AsyncStorage (provided by OS).
 */
const SECURITY_POLICY: Record<string, 'MEMORY' | 'SESSION' | 'PERSISTENT'> = {
  // Highly Sensitive: Never hit disk (cleared on refresh)
  'players': 'MEMORY',
  'supportTickets': 'MEMORY',
  'auditLogs': 'MEMORY',
  'matchmaking': 'MEMORY',
  'persistent_logs': 'MEMORY',
  
  // Semi-Sensitive: Session storage (cleared on tab close)
  'currentUser': 'SESSION',
  'authToken': 'SESSION',
  'acetrack_device_id': 'SESSION',
  'version': 'SESSION',
  
  // Non-Sensitive: Local storage (truly persistent)
  'app_theme': 'PERSISTENT',
  'last_visited_tab': 'PERSISTENT'
};

// 🔐 SESSION-ONLY MEMORY CACHE
// On Web, this stores RAW objects to avoid redundant JSON.stringify overhead.
const webMemoryCache: Record<string, any> = {};

/**
 * 🔐 WEB CRYPTO LAYER (AES-GCM)
 * Production-grade encryption using hardware-accelerated Web Crypto API.
 * Uses a page-load-specific master key so disk data is useless after refresh.
 */
let sessionKey: CryptoKey | null = null;
let sessionKeyPromise: Promise<CryptoKey | null> | null = null;

const getSessionKey = async () => {
  if (!isWeb || typeof window === 'undefined') return null;
  if (sessionKey) return sessionKey;
  
  // 🛡️ CONCURRENCY GUARD: If a key is already being generated, wait for that promise
  if (sessionKeyPromise) return sessionKeyPromise;
  
  sessionKeyPromise = (async () => {
    try {
      // Generate a page-load specific AES-256 key
      sessionKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      return sessionKey;
    } catch (e) {
      console.error('[WebCrypto] Key generation failed:', e);
      return null;
    } finally {
      sessionKeyPromise = null;
    }
  })();
  
  return sessionKeyPromise;
};

/**
 * 🚀 HIGH-PERFORMANCE BINARY UTILITIES (v2.6.157)
 * Replaces slow spread-operator and .split().map() patterns which caused 30s main-thread hangs.
 */
const binaryToBase64 = (uint8: Uint8Array): string => {
  const CHUNK_SIZE = 8192; // 8KB chunks to prevent "Maximum call stack size"
  let binary = '';
  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK_SIZE));
  }
  return window.btoa(binary);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = window.atob(base64);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return uint8;
};

const encrypt = async (str: string) => {
  if (!isWeb || typeof window === 'undefined') return str;
  try {
    const key = await getSessionKey();
    if (!key) return str;
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(str);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    
    // Package IV + Ciphertext for storage
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    // 🚀 STACK-SAFE BASE64 (v2.6.157)
    return 'AES:' + binaryToBase64(combined);
  } catch(e) { 
    console.error('[WebCrypto] Encrypt failed:', e);
    return str; 
  }
};

const decrypt = async (str: string, policy?: string) => {
  if (!isWeb || typeof window === 'undefined' || !str) return str;
  
  // 🛡️ PERFORMANCE BYPASS: Memory-tier data is stored as raw JSON strings (prefixed with MEM:)
  if (str.startsWith('MEM:')) {
    return str.substring(4);
  }

  if (!str.startsWith('AES:')) {
    // Fallback for legacy 'ENC:' (Base64) data to prevent session loss during migration
    if (str.startsWith('ENC:')) {
       try { return decodeURIComponent(escape(window.atob(str.substring(4)))); } catch(_) {}
    }
    return str;
  }

  try {
    const key = await getSessionKey();
    if (!key) return str;
    
    // 🚀 HIGH-EFFICIENCY DECODING (v2.6.157)
    const binary = base64ToUint8Array(str.substring(4));
    const iv = binary.slice(0, 12);
    const ciphertext = binary.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch(e) { 
    return str; 
  }
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
      let storedValue: string | null = null;
      
      if (isWeb) {
        const policy = SECURITY_POLICY[key] || 'SESSION';
        if (policy === 'MEMORY') {
          storedValue = webMemoryCache[key] || null;
          // 🚀 PERFORMANCE: If it's already an object (from our new memory tier), return immediately.
          if (storedValue && typeof storedValue !== 'string') return storedValue;
        } else if (policy === 'SESSION') {
          storedValue = window.sessionStorage.getItem(key);
        } else {
          storedValue = await AsyncStorage.getItem(key);
        }
      } else {
        storedValue = await AsyncStorage.getItem(key);
      }

      if (!storedValue || storedValue === 'undefined') return null;
      
      // If we got a string but it's not encrypted, try to parse it (handled by decrypt)
      const value = await decrypt(storedValue);
      
      try {
        return JSON.parse(value);
      } catch (parseError) {
        return value;
      }
    } catch (e: any) {
      console.error(`Error reading value for key "${key}":`, e);
      return null;
    }
  },
  
  // Internal raw setter
  _setItemRaw: async (key: string, value: any) => {
    try {
      if (value === undefined) {
        await storage.removeItem(key);
        return;
      }
      
      if (isWeb) {
        const policy = SECURITY_POLICY[key] || 'SESSION';
        if (policy === 'MEMORY') {
          // 🚀 ZERO-STRINGIFY: Do NOT stringify memory-only data.
          // This saves massive CPU time for large lists (Players/Tickets).
          webMemoryCache[key] = value;
          return;
        } 
        
        const jsonValue = JSON.stringify(value);
        if (policy === 'SESSION') {
          const encrypted = await encrypt(jsonValue);
          window.sessionStorage.setItem(key, encrypted);
        } else {
          const encrypted = await encrypt(jsonValue);
          await AsyncStorage.setItem(key, encrypted);
        }
      } else {
        const jsonValue = JSON.stringify(value);
        await AsyncStorage.setItem(key, jsonValue); // Native uses OS-level encryption for AsyncStorage
      }
    } catch (e) {
      console.error(`Error writing value for key "${key}":`, e);
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

  /**
   * 🚀 MULTI-SET OPTIMIZATION (v2.6.240)
   * Efficiently persists multiple keys in a single queue block.
   * On Native, this uses AsyncStorage.multiSet for a single bridge trip.
   */
  multiSet: async (updates: Record<string, any>) => {
    if (isExecutingQueue) {
       for (const key in updates) {
         await storage._setItemRaw(key, updates[key]);
       }
       return;
    }

    const action = async () => {
      isExecutingQueue = true;
      try {
        if (isWeb) {
          for (const key in updates) {
            await storage._setItemRaw(key, updates[key]);
          }
        } else {
          const pairs: [string, string][] = [];
          for (const key in updates) {
            if (updates[key] === undefined) {
               await AsyncStorage.removeItem(key);
            } else {
               pairs.push([key, JSON.stringify(updates[key])]);
            }
          }
          if (pairs.length > 0) {
            await AsyncStorage.multiSet(pairs);
          }
        }
      } catch (e) {
        console.error('[Storage] multiSet failed:', e);
      } finally {
        isExecutingQueue = false;
      }
    };

    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  removeItem: async (key: string) => {
    if (isExecutingQueue) {
      if (isWeb) {
        delete webMemoryCache[key];
        window.sessionStorage.removeItem(key);
      }
      try { await AsyncStorage.removeItem(key); } catch (_) {}
      return;
    }

    const action = async () => {
      try {
        if (isWeb) {
          delete webMemoryCache[key];
          window.sessionStorage.removeItem(key);
        }
        await AsyncStorage.removeItem(key);
      } catch (e) {
        console.error(`Error removing value for key "${key}":`, e);
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
