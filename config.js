import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Configure the Base API URL.
 * In production/real device tests, you should use your machine's local IP or a public URL.
 * 'localhost' won't work on Android Emulators or Physical Devices.
 */
const API_BASE_URL = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.apiUrl) 
  ? Constants.expoConfig.extra.apiUrl 
  : 'https://acetrack-api-q39m.onrender.com';
const GROQ_API_KEY = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.groqApiKey)
  ? Constants.expoConfig.extra.groqApiKey
  : (process.env.EXPO_PUBLIC_GROQ_API_KEY || '');
const ACE_API_KEY = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.aceApiKey)
  ? Constants.expoConfig.extra.aceApiKey
  : (process.env.EXPO_PUBLIC_ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=');

export default {
  API_BASE_URL,
  GROQ_API_KEY,
  ACE_API_KEY,
  IS_ANDROID: Platform.OS === 'android',
  IS_IOS: Platform.OS === 'ios',
};
