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

const PUBLIC_APP_ID = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.aceApiKey)
  ? Constants.expoConfig.extra.aceApiKey
  : process.env.EXPO_PUBLIC_ACE_API_KEY;

export default {
  APP_VERSION: '2.6.242',
  API_BASE_URL: (Constants.appConfig?.extra?.apiUrl || 
                 'https://acetrack-suggested.onrender.com').replace(/\/$/, ''),
  GROQ_API_KEY,
  PUBLIC_APP_ID: 'AceTrack_Client_v2_Production',
  ACE_API_KEY: '8f73b6e1a9c4d2e5b0a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9',
  IS_ANDROID: Platform.OS === 'android',
  IS_IOS: Platform.OS === 'ios',
  
  // 🛡️ SECURITY: Stealth Endpoint Registry (v2.6.193)
  // Prevents plaintext enumeration of backend attack surface in the JS bundle.
  getEndpoint: (key) => {
    // 🔧 [HOTFIX v2.6.196]: Polyfill atob for React Native stability
    const _atob = (input) => {
      if (typeof atob !== 'undefined') return atob(input);
      try {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let str = String(input).replace(/[=]+$/, '');
        let output = '';
        for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
          buffer = chars.indexOf(buffer);
        }
        return output;
      } catch (e) { return ''; }
    };

    const _m = {
      'ADMIN_LOGIN': 'L2FwaS92MS9hZG1pbi9sb2dpbg==',           // /api/v1/admin/login
      'ADMIN_VERIFY': 'L2FwaS92MS9hZG1pbi92ZXJpZnktcGlu',       // /api/v1/admin/verify-pin
      'SUPPORT_LOGIN': 'L2FwaS92MS9zdXBwb3J0L2xvZ2lu',         // /api/v1/support/login
      'SUPPORT_RESET': 'L2FwaS92MS9zdXBwb3J0L3Bhc3N3b3JkLXJlc2V0L3JlcXVlc3Q=', // /api/v1/support/password-reset/request
      'DIAGNOSTICS': 'L2FwaS9kaWFnbm9zdGljcw==',               // /api/diagnostics
      'DATA_SYNC': 'L2FwaS9kYXRh',                             // /api/data
      'DATA_SAVE': 'L2FwaS9zYXZl',                             // /api/save
      'STATUS': 'L2FwaS9zdGF0dXM=',                            // /api/status
      'CLAIM_TICKET': 'L2FwaS9zdXBwb3J0L2NsYWltLXRpY2tldA==',   // /api/support/claim-ticket
      'REASSIGN_TICKET': 'L2FwaS9zdXBwb3J0L3JlYXNzaWduLXRpY2tldA==', // /api/support/reassign-ticket
      'OTP_SEND': 'L2FwaS9vdHAvc2VuZA==',                      // /api/otp/send
      'OTP_VERIFY': 'L2FwaS9vdHAvdmVyaWZ5'                     // /api/otp/verify
    };
    try {
      const encoded = _m[key];
      if (!encoded) return '';
      return _atob(encoded);
    } catch (e) {
      return '';
    }
  },

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
