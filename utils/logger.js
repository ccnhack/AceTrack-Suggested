import { Platform } from 'react-native';
import storage from './storage';

// IST Formatting Options
const IST_OPTIONS = {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

const formatIST = (date) => {
  try {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  } catch (e) {
    return 'Unknown Time';
  }
};

let logs = [];
const MAX_LOG_AGE_MS = 10 * 60 * 1000; // 10 minutes
const MAX_LOG_COUNT = 1000; 

let threshold = 500;
let onThresholdReached = null;
let thresholdTriggeredInSession = false;

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalFetch = global.fetch;

const addLog = (level, type, message) => {
  const now = new Date();
  const timestamp = formatIST(now);
  const logEntry = {
    timestamp,
    unix: now.getTime(),
    level,
    type,
    message: typeof message === 'object' ? JSON.stringify(message) : String(message),
  };
  
  logs.push(logEntry);
  
  // 1. Clean logs older than 5 minutes
  const cutoff = Date.now() - MAX_LOG_AGE_MS;
  if (logs.length > 0 && logs[0].unix < cutoff) {
    logs = logs.filter(log => log.unix >= cutoff);
  }

  // 2. Enforce MAX_LOG_COUNT (keep most recent)
  if (logs.length > MAX_LOG_COUNT) {
    logs = logs.slice(logs.length - MAX_LOG_COUNT);
  }

  // 3. Check for threshold (once per session/until reset)
  if (onThresholdReached && logs.length >= threshold && !thresholdTriggeredInSession) {
    thresholdTriggeredInSession = true;
    onThresholdReached();
  }
};

// Intercept console calls
console.log = (...args) => {
  originalLog.apply(console, args);
  addLog('info', 'console', args.join(' '));
};

console.warn = (...args) => {
  originalWarn.apply(console, args);
  addLog('warn', 'console', args.join(' '));
};

console.error = (...args) => {
  originalError.apply(console, args);
  addLog('error', 'console', args.join(' '));
};

// Intercept Global Errors (for crashes that don't reach console.error)
if (global.ErrorUtils) {
  const originalHandler = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler(async (error, isFatal) => {
    const crashMsg = `${isFatal ? 'FATAL: ' : ''}${error.message}\n${error.stack}`;
    addLog('error', 'crash', crashMsg);
    
    // PERSIST CRASH FOR AUTO-RECOVERY
    try {
      const crashLog = {
        timestamp: formatIST(new Date()),
        message: error.message,
        stack: error.stack,
        isFatal
      };
      // We use raw AsyncStorage here to avoid any issues with our own storage wrapper
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('last_crash_log', JSON.stringify(crashLog));
    } catch (e) {
      originalLog('Failed to persist crash log:', e);
    }

    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Intercept fetch calls
global.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'Unknown URL';
  const options = args[1] || {};
  const method = options.method || 'GET';
  
  addLog('network', 'request', `${method} ${url}`);
  
  try {
    const response = await originalFetch.apply(global, args);
    addLog('network', 'response', `${method} ${url} [${response.status}]`);
    return response;
  } catch (error) {
    addLog('network', 'error', `${method} ${url} - ${error.message}`);
    throw error;
  }
};

const logger = {
  getLogs: () => {
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    return logs.filter(log => log.unix >= cutoff);
  },
  formatIST,
  logAction: (action, details) => {
    addLog('info', 'action', `${action}${details ? ': ' + JSON.stringify(details) : ''}`);
  },
  logError: (msg, err) => {
    addLog('error', 'exception', `${msg}${err ? ': ' + err.message : ''}`);
  },
  checkAndUploadCrash: async (activeApiUrl, apiKey) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const saved = await AsyncStorage.getItem('last_crash_log');
      if (saved) {
        const crashDetails = JSON.parse(saved);
        console.log("🛠️ Found previous crash log. Attempting auto-upload...");
        
        const response = await originalFetch(`${activeApiUrl}/api/diagnostics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': apiKey
          },
          body: JSON.stringify({
            username: `CRASH_RECOVERY_${Platform.OS}`,
            logs: [{
              timestamp: crashDetails.timestamp,
              level: 'error',
              type: 'crash',
              message: `RECOVERY LOG: ${crashDetails.message}\nSTACK: ${crashDetails.stack}`
            }, ...logs.slice(-10)] // include last 10 logs for context
          })
        });

        if (response.ok) {
          console.log("✅ Previous crash log uploaded successfully.");
          await AsyncStorage.removeItem('last_crash_log');
        }
      }
    } catch (e) {
      originalLog('Crash recovery upload failed:', e);
    }
  },
  setThresholdCallback: (limit, callback) => {
    threshold = limit;
    onThresholdReached = callback;
    thresholdTriggeredInSession = false; // Reset for new session/callback
  },
  initialize: async () => {
    addLog('system', 'init', `Diagnostics Logger Initialized [Platform: ${Platform.OS}]`);
  }
};

export default logger;
