/**
 * 🛡️ MOCK STORAGE (Node Bridge)
 * In-memory implementation of AsyncStorage to support terminal regression testing.
 */
let store = new Map();
let storageQueue = Promise.resolve();
let activeCount = 0;

const storage = {
  getItem: async (key: string) => {
    return store.get(key) || null;
  },
  
  setItem: async (key: string, value: any) => {
    const action = async () => {
      store.set(key, value);
    };
    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  removeItem: async (key: string) => {
    const action = async () => {
      store.delete(key);
    };
    storageQueue = storageQueue.then(action).catch(action);
    return storageQueue;
  },

  runAtomic: async (action: () => Promise<any>) => {
    storageQueue = storageQueue.then(action).catch((e) => {
      console.error('[MockStorage] Atomic operation failed:', e);
      return null;
    });
    return storageQueue;
  },

  getSystemFlag: async (key: string) => {
    return store.get(`flag_${key}`) || null;
  },

  setSystemFlag: async (key: string, value: any) => {
    store.set(`flag_${key}`, value);
    return Promise.resolve();
  },

  getQueueLength: () => activeCount,

  // Test helper: Clear the store
  clear: () => store.clear()
};

export default storage;
export const thinPlayer = (p) => p;
export const thinPlayers = (p) => p;
export const capPlayerDetail = (p) => p;
