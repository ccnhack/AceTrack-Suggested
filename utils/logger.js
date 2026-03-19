import { Platform } from 'react-native';
import storage from './storage';
import config from '../config';

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
    const formatter = new Intl.DateTimeFormat('en-IN', IST_OPTIONS);
    const parts = formatter.formatToParts(date);
    const d = parts.find(p => p.type === 'day').value;
    const m = parts.find(p => p.type === 'month').value;
    const y = parts.find(p => p.type === 'year').value;
    const h = parts.find(p => p.type === 'hour').value;
    const min = parts.find(p => p.type === 'minute').value;
    const s = parts.find(p => p.type === 'second').value;
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  } catch (e) {
    return date.toISOString(); // Fallback
  }
};

let logs = [];
const MAX_LOG_COUNT = 1000; 

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalFetch = global.fetch;

let isInterceptionEnabled = false;

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
  if (logs.length > MAX_LOG_COUNT) {
    logs = logs.slice(-MAX_LOG_COUNT);
  }
};

const logger = {
  getLogs: () => {
    return logs;
  },

  enableInterception: () => {
    if (isInterceptionEnabled) return;
    isInterceptionEnabled = true;

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

    if (global.ErrorUtils) {
      const originalHandler = global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        addLog('error', 'crash', `${isFatal ? 'FATAL: ' : ''}${error.message}\n${error.stack}`);
        // Save crash for recovery upload
        storage.setItem('last_crash_log', {
            timestamp: formatIST(new Date()),
            message: error.message,
            stack: error.stack
        });
        if (originalHandler) {
          originalHandler(error, isFatal);
        }
      });
    }
  },

  sendHeartbeat: async (activeApiUrl, apiKey, label) => {
    try {
      await originalFetch(`${activeApiUrl}/api/diagnostics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': apiKey
        },
        body: JSON.stringify({
          username: `${label || 'UNKNOWN'}_v5`, // Matches user's expected tag
          uploadedAt: new Date().toISOString(),
          logs: [{
            timestamp: formatIST(new Date()),
            level: 'info',
            type: 'heartbeat',
            message: `App is alive [v:5] - Sync Engine: Hardened`
          }].concat(logs.slice(-10))
        })
      });
    } catch (e) {
      originalError("Heartbeat failed:", e.message);
    }
  },

  checkAndUploadCrash: async (activeApiUrl, apiKey) => {
    try {
      const saved = await storage.getItem('last_crash_log');
      if (saved) {
        await originalFetch(`${activeApiUrl}/api/diagnostics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': apiKey
          },
          body: JSON.stringify({
            username: `CRASH_RECOV_${Platform.OS}`,
            logs: [{
              timestamp: saved.timestamp,
              level: 'error',
              type: 'crash',
              message: `RECOVERY: ${saved.message}`
            }].concat(logs.slice(-20))
          })
        });
        await storage.removeItem('last_crash_log');
      }
    } catch (e) {}
  },

  logAction: (action, details) => {
    addLog('info', 'action', `${action}${details ? ': ' + JSON.stringify(details) : ''}`);
  },

  logError: (msg, err) => {
    addLog('error', 'exception', `${msg}${err ? ': ' + err.message : ''}`);
  },

  initialize: async () => {
    addLog('system', 'init', `Diagnostics Logger v5 Ready [Platform: ${Platform.OS}]`);
  }
};

export default logger;
