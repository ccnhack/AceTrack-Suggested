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
    } catch (e) {
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

export default storage;
