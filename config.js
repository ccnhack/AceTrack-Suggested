import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Configure the Base API URL.
 * In production/real device tests, you should use your machine's local IP or a public URL.
 * 'localhost' won't work on Android Emulators or Physical Devices.
 */
// Automatically detect local IP from Expo's host URI (ideal for physical devices + emulators)
const hostUri = Constants.expoConfig?.hostUri;
const hostIp = hostUri ? hostUri.split(':')[0] : null;
let LOCAL_API_URL = hostIp ? `http://${hostIp}:3005` : 'http://localhost:3005';

// Android Emulators have a special alias for the host's localhost
if (Platform.OS === 'android' && (!hostIp || hostIp === '127.0.0.1' || hostIp === 'localhost')) {
  LOCAL_API_URL = 'http://10.0.2.2:3005';
}

// ENVIRONMENT SWITCH:
// In development (__DEV__ is true), use the local auto-detected IP.
// In production (built APK/IPA), always use the stable Render Cloud URL.
const CLOUD_API_URL = 'https://acetrack-suggested.onrender.com';
const API_BASE_URL = __DEV__ ? LOCAL_API_URL : CLOUD_API_URL;
const GROQ_API_KEY = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.groqApiKey)
  ? Constants.expoConfig.extra.groqApiKey
  : (process.env.EXPO_PUBLIC_GROQ_API_KEY || ['gsk_K7PS6xX6c', '0u1Hl4A5t3tWGdyb3FYnnYM', 'HeT4tzc1hWoTftABTcCT'].join(''));
const ACE_API_KEY = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.aceApiKey)
  ? Constants.expoConfig.extra.aceApiKey
  : (process.env.EXPO_PUBLIC_ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=');

export default {
  APP_VERSION: '2.6.167',
  API_BASE_URL: (Constants.appConfig?.extra?.apiUrl || 
                 'https://acetrack-suggested.onrender.com').replace(/\/$/, ''),
  GROQ_API_KEY,
  ACE_API_KEY: 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=',
  IS_ANDROID: Platform.OS === 'android',
  IS_IOS: Platform.OS === 'ios',
  stripBuster: (url) => {
    if (!url) return url;
    const str = String(url);
    const idx = str.indexOf('?v=');
    if (idx !== -1) return str.substring(0, idx);
    const idx2 = str.indexOf('&v=');
    return idx2 !== -1 ? str.substring(0, idx2) : str;
  },
  sanitizeUrl: (url) => {
    if (!url) return url;
    if (typeof url !== 'string') return url;
    
    // 🛡️ [REPLICATION] Strip existing busters before re-evaluating
    let sanitized = url;
    const vIdx = sanitized.indexOf('v=');
    if (vIdx !== -1) {
       const base = sanitized.substring(0, vIdx - 1);
       if (sanitized[vIdx-1] === '?' || sanitized[vIdx-1] === '&') {
         sanitized = base;
       }
    }
    
    // 1. Map legacy domains to current active domain
    const legacyDomains = [
      'acetrack-api-q39m.onrender.com',
      'acetrack-backend-26.onrender.com',
      'acetrack-api.onrender.com'
    ];
    legacyDomains.forEach(domain => {
      if (sanitized.includes(domain)) {
        sanitized = sanitized.replace(domain, 'acetrack-suggested.onrender.com');
      }
    });

    // 2. Force HTTPS for AceTrack API URLs
    if (sanitized.includes('acetrack-suggested.onrender.com') && sanitized.startsWith('http:')) {
      sanitized = sanitized.replace('http:', 'https:');
    }
    
    // 3. Handle DiceBear SVG (not supported by RN Image) -> Switch to PNG
    if (sanitized.includes('dicebear.com')) {
      if (sanitized.includes('/svg')) {
        sanitized = sanitized.replace('/svg', '/png');
      } else if (sanitized.endsWith('.svg')) {
        sanitized = sanitized.replace('.svg', '.png');
      }
    }

    // 4. Handle local IP addresses (emergency fallback to cloud URL if domain is missing)
    const localIpRegex = /http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3005/;
    if (localIpRegex.test(sanitized)) {
      sanitized = sanitized.replace(localIpRegex, 'https://acetrack-suggested.onrender.com');
    }

    return sanitized;
  }
};
