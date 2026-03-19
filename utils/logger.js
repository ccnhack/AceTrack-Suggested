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
