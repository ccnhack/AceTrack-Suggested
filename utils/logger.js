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
const MAX_LOG_COUNT = 5000; 

let autoFlushConfig = null;

const triggerAutoFlush = async (payload) => {
  if (!autoFlushConfig || !autoFlushConfig.url || !autoFlushConfig.key) return;
  try {
    await (global.fetch || fetch)(`${autoFlushConfig.url}/api/diagnostics/auto-flush`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ace-api-key': autoFlushConfig.key
      },
      body: JSON.stringify({
        username: autoFlushConfig.user || 'UNKNOWN',
        deviceId: autoFlushConfig.device || 'UNKNOWN',
        logs: payload
      })
    });
  } catch (e) {
    // Autonomously fail silently so app doesn't crash on network drop
  }
};

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
  
  if (logs.length >= MAX_LOG_COUNT) {
    // Auto-flush trigger: copy payload, reset logs, save empty array, send payload.
    const payload = [...logs];
    logs = [];
    storage.setItem('persistent_logs', logs).catch(() => {});
    triggerAutoFlush(payload);
  } else {
    // Persist to storage (async non-blocking) normally
    storage.setItem('persistent_logs', logs).catch(() => {});
  }
};

const logger = {
  initAutoFlush: (url, key, user, device) => {
    autoFlushConfig = { url, key, user, device };
  },
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

    // Intercept Fetch API for Networking Logs
    if (!global.fetch.isIntercepted) {
      global.fetch = async (...args) => {
        const [resource, config] = args;
        const method = config?.method || 'GET';
        const urlStr = typeof resource === 'string' ? resource : (resource?.url || 'unknown-url');
        
        // Log Outgoing Request
        addLog('info', 'network_req', `[${method}] ${urlStr}`);
        
        try {
          const startTime = Date.now();
          const response = await originalFetch.apply(global, args);
          const duration = Date.now() - startTime;
          
          // Clone the response so we don't consume the body stream if we wanted to log it,
          // but for now, logging Status, URL, and Duration is safe and robust.
          addLog(
            response.ok ? 'info' : 'warn', 
            'network_res', 
            `[${response.status}] ${urlStr} (${duration}ms)`
          );
          
          return response;
        } catch (error) {
          addLog('error', 'network_err', `[${method}] ${urlStr} - ${error.message}`);
          throw error;
        }
      };
      global.fetch.isIntercepted = true;
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
          username: `${label || 'UNKNOWN'}_v5`,
          uploadedAt: new Date().toISOString(),
          logs: [{
            timestamp: formatIST(new Date()),
            level: 'info',
            type: 'heartbeat',
            message: `App is alive [v:5] - Sync Engine: Hardened`
          }].concat(logs.slice(-100))
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
    try {
      const saved = await storage.getItem('persistent_logs');
      if (saved && Array.isArray(saved)) {
        // Restore logs. No 5-minute TTL limit. Keep all until 15k limit.
        if (saved.length > 0) {
          logs = saved.slice(-MAX_LOG_COUNT);
          addLog('system', 'init', `Restored ${logs.length} persistent logs from previous session`);
        }
      }
    } catch (e) {
      originalError("Failed to hydrate persistent logs:", e.message);
    }
    addLog('system', 'init', `Diagnostics Logger v5 Ready [Platform: ${Platform.OS}]`);
  }
};

export default logger;
