import { Platform } from 'react-native';
import storage from './storage';
import config from '../config';

// IST Formatting Manual Implementation (Hermes lacks full Intl.DateTimeFormat support)
const formatIST = (date) => {
  try {
    // IST is UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffset);
    
    const y = istDate.getUTCFullYear();
    const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(istDate.getUTCDate()).padStart(2, '0');
    const h = String(istDate.getUTCHours()).padStart(2, '0');
    const min = String(istDate.getUTCMinutes()).padStart(2, '0');
    const s = String(istDate.getUTCSeconds()).padStart(2, '0');
    
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  } catch (e) {
    return date.toISOString(); // Fallback
  }
};

let logs = [];
const MAX_LOG_COUNT = 2000;
const MAX_STORAGE_ENTRIES = 1000;
const MAX_STORAGE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB — safely under Android CursorWindow 2MB limit

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalFetch = global.fetch;

let autoFlushConfig = null;
const QUEUE_KEY = 'offline_diagnostics_queue';

const processOfflineQueue = async () => {
  if (!autoFlushConfig || !autoFlushConfig.url || !autoFlushConfig.key) return;
  try {
    let queue = await storage.getItem(QUEUE_KEY);
    if (!queue) return;
    if (typeof queue === 'string') {
      try { queue = JSON.parse(queue); } catch(e) { queue = []; }
    }
    if (!Array.isArray(queue) || queue.length === 0) return;

    const remainingQueue = [...queue];
    for (const item of queue) {
      try {
        // CRITICAL: Use originalFetch to bypass interception and prevent recursion
        const res = await originalFetch(`${autoFlushConfig.url}/api/diagnostics/auto-flush`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ace-api-key': autoFlushConfig.key },
          body: JSON.stringify({
            username: autoFlushConfig.user || 'UNKNOWN',
            deviceId: autoFlushConfig.device || 'UNKNOWN',
            logs: item.data
          })
        });
        if (res.ok) {
          const idx = remainingQueue.findIndex(q => q.id === item.id);
          if (idx > -1) remainingQueue.splice(idx, 1);
        }
      } catch (e) {
        break; // Stop processing queue if network is still down
      }
    }
    await storage.setItem(QUEUE_KEY, remainingQueue);
  } catch(e) {}
};

const triggerAutoFlush = async (payload) => {
  if (!autoFlushConfig || !autoFlushConfig.url || !autoFlushConfig.key) return;
  try {
    // CRITICAL: Use originalFetch to bypass interception and prevent recursion
    const res = await originalFetch(`${autoFlushConfig.url}/api/diagnostics/auto-flush`, {
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
    if (!res.ok) throw new Error('Network response was not ok');
    
    // Attempt to flush offline queue since we confirmed network is back
    processOfflineQueue();
  } catch (e) {
    // Autonomously fail silently and safely queue the payload locally!
    try {
      let queue = await storage.getItem(QUEUE_KEY);
      if (typeof queue === 'string') {
        try { queue = JSON.parse(queue); } catch(err) { queue = []; }
      }
      if (!Array.isArray(queue)) queue = [];
      
      queue.push({ id: `q_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`, data: payload });
      if (queue.length > 5) queue.shift(); // Hard cap at 5 offline payloads
      await storage.setItem(QUEUE_KEY, queue);
    } catch(storageErr) {}
  }
};

let isInterceptionEnabled = false;

let saveTimeout = null;
const DEBOUNCE_DELAY = 5000; // Increased to 5s to reduce bridge saturation

const saveLogsToStorage = async () => {
    try {
        // Only persist the most recent entries to stay under CursorWindow limit
        const toSave = logs.slice(-MAX_STORAGE_ENTRIES);
        const jsonStr = JSON.stringify(toSave);
        
        // 🛡️ SIZE GUARD: Skip write if payload exceeds safe limit
        if (jsonStr.length > MAX_STORAGE_BYTES) {
            originalWarn(`[Logger] persistent_logs size ${(jsonStr.length / 1024 / 1024).toFixed(2)}MB exceeds limit. Truncating.`);
            const truncated = toSave.slice(-Math.floor(MAX_STORAGE_ENTRIES / 2));
            await storage.setItem('persistent_logs', truncated);
            return;
        }
        
        await storage.setItem('persistent_logs', toSave);
    } catch (e) {
        // If write fails (SQLITE_FULL / disk full), clear the key to recover
        if (e.message && (e.message.includes('disk is full') || e.message.includes('SQLITE_FULL'))) {
            originalWarn('[Logger] Storage full — clearing persistent_logs to recover.');
            try { await storage.removeItem('persistent_logs'); } catch (_) {}
        }
        originalError("Failed to persist logs:", e.message);
    }
};

const maskPII = (val) => {
  if (typeof val === 'string') {
    // Mask Email: s***@example.com
    let masked = val.replace(/([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]{2,})@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, 
      (match, p1, p2, p3) => `${p1}${'*'.repeat(p2.length)}@${p3}`);
    // Mask Phone: +91******4321
    masked = masked.replace(/(\+?\d{1,3}[- ]?)?\d{10}/g, (match) => {
      return match.replace(/\d{6}(?=\d{4}$)/, '******');
    });
    return masked;
  }
  if (typeof val === 'object' && val !== null) {
    const masked = Array.isArray(val) ? [] : {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        const lowerKey = key.toLowerCase();
        if (['password', 'otp', 'token', 'secret', 'cvv', 'creditcard', 'pin', 'authorization', 'key', 'address', 'city', 'location'].some(s => lowerKey.includes(s))) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = maskPII(val[key]);
        }
      }
    }
    return masked;
  }
  return val;
};

const addLog = (level, type, message) => {
  const now = new Date();
  const timestamp = formatIST(now);
  
  let processedMessage = message;
  try {
    processedMessage = maskPII(message);
  } catch (e) {
    // Fallback if masking fails
    processedMessage = "[Masking Error] " + String(message);
  }

  const logEntry = {
    timestamp,
    unix: now.getTime(),
    level,
    type,
    message: typeof processedMessage === 'object' ? JSON.stringify(processedMessage) : String(processedMessage),
  };
  
  logs.push(logEntry);
  
  if (logs.length >= MAX_LOG_COUNT) {
    const payload = [...logs];
    logs = [];
    if (saveTimeout) clearTimeout(saveTimeout);
    saveLogsToStorage();
    triggerAutoFlush(payload);
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveLogsToStorage, DEBOUNCE_DELAY);
  }
};

const logger = {
  addLog,
  initAutoFlush: (url, key, user, device) => {
    autoFlushConfig = { url, key, user, device };
    // Immediately attempt to process any historically pending offline payloads
    processOfflineQueue();
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

  logTrace: (message, context, id, details) => {
    addLog('info', 'trace', `[${context || 'global'}:${id || 'anon'}] ${message}${details ? ' - ' + JSON.stringify(details) : ''}`);
  },

  logError: (msg, err) => {
    addLog('error', 'exception', `${msg}${err ? ': ' + err.message : ''}`);
  },

  initialize: async () => {
    try {
      const saved = await storage.getItem('persistent_logs');
      if (saved && Array.isArray(saved)) {
        if (saved.length > 0) {
          logs = saved.slice(-MAX_STORAGE_ENTRIES);
          addLog('system', 'init', `Restored ${logs.length} persistent logs from previous session`);
        }
      } else if (saved === null) {
        // 🛡️ RECOVERY: getItem returned null — could be CursorWindow overflow.
        // Proactively clear the key to ensure we can write fresh data.
        try { await storage.removeItem('persistent_logs'); } catch (_) {}
        addLog('system', 'init', 'persistent_logs was null/corrupted — cleared for recovery');
      }
    } catch (e) {
      // 🛡️ CursorWindow / Row too big error — nuke the key and start fresh
      originalError("Failed to hydrate persistent logs:", e.message);
      try { await storage.removeItem('persistent_logs'); } catch (_) {}
    }
    addLog('system', 'init', `Diagnostics Logger v6 Ready [Platform: ${Platform.OS}] [MaxStore: ${MAX_STORAGE_ENTRIES}]`);
  }
};

export default logger;
