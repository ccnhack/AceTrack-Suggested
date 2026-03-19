import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let logs = [];
const MAX_LOG_COUNT = 1000; 

let originalLog = console.log;
let originalWarn = console.warn;
let originalError = console.error;
let originalFetch = global.fetch;
let isInterceptionEnabled = false;

const formatTime = function(date) {
  try {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  } catch (e) {
    return 'Unknown Time';
  }
};

const addLog = function(level, type, message) {
  try {
    const now = new Date();
    const timestamp = formatTime(now);
    const logEntry = {
      timestamp: timestamp,
      unix: now.getTime(),
      level: level,
      type: type,
      message: typeof message === 'object' ? '[Object]' : String(message),
    };
    
    logs.push(logEntry);
    if (logs.length > MAX_LOG_COUNT) {
      logs = logs.slice(-MAX_LOG_COUNT);
    }
  } catch (e) {
    // Silent fail to avoid recursion
  }
};

const logger = {
  getLogs: function() {
    return logs;
  },
  
  logAction: function(action, details) {
    addLog('info', 'action', action + (details ? ': ' + JSON.stringify(details) : ''));
  },

  enableInterception: function() {
    if (isInterceptionEnabled) return;
    isInterceptionEnabled = true;

    console.log = function() {
      var args = Array.prototype.slice.call(arguments);
      originalLog.apply(console, args);
      addLog('info', 'console', args.join(' '));
    };

    console.warn = function() {
      var args = Array.prototype.slice.call(arguments);
      originalWarn.apply(console, args);
      addLog('warn', 'console', args.join(' '));
    };

    console.error = function() {
      var args = Array.prototype.slice.call(arguments);
      originalError.apply(console, args);
      addLog('error', 'console', args.join(' '));
    };

    if (global.ErrorUtils) {
      const originalHandler = global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler(function(error, isFatal) {
        addLog('error', 'crash', (isFatal ? 'FATAL: ' : '') + error.message);
        if (originalHandler) {
          originalHandler(error, isFatal);
        }
      });
    }
  },

  sendHeartbeat: async function(activeApiUrl, apiKey, label, metadata) {
    try {
      await originalFetch(activeApiUrl + '/api/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': apiKey
        },
        body: JSON.stringify({
          username: label || 'HEARTBEAT',
          logs: [{
            timestamp: formatTime(new Date()),
            level: 'info',
            type: 'heartbeat',
            message: 'App is alive' + (metadata ? ' [' + JSON.stringify(metadata) + ']' : '')
          }].concat(logs.slice(-5))
        })
      });
    } catch (e) {
      // Ignored
    }
  },

  checkAndUploadCrash: async function(activeApiUrl, apiKey) {
    try {
      const saved = await AsyncStorage.getItem('last_crash_log');
      if (saved) {
        const crashDetails = JSON.parse(saved);
        const response = await originalFetch(activeApiUrl + '/api/diagnostics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': apiKey
          },
          body: JSON.stringify({
            username: 'CRASH_RECOV_' + Platform.OS,
            logs: [{
              timestamp: crashDetails.timestamp,
              level: 'error',
              type: 'crash',
              message: 'RECOVERY: ' + (crashDetails.message || 'Unknown Error')
            }].concat(logs.slice(-10))
          })
        });
        if (response.ok) {
          await AsyncStorage.removeItem('last_crash_log');
        }
      }
    } catch (e) {}
  },

  initialize: async function() {
    addLog('system', 'init', 'Lazy Logger Ready');
  }
};

export default logger;
