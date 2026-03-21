import AsyncStorage from '@react-native-async-storage/async-storage';

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
    try {
      if (value === undefined) {
        await AsyncStorage.removeItem(key);
        return;
      }
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (e) {
      console.error('Error writing value to AsyncStorage:', e);
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing value from AsyncStorage:', e);
    }
  }
};

export default storage;
