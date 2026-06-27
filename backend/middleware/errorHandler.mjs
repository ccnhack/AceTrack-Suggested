import { getISTDate } from '../helpers/utils.mjs';

/**
 * ═══════════════════════════════════════════════════════════════
 * 🛡️ Error Handling Middleware
 * Standardized API response format for all server errors.
 * ═══════════════════════════════════════════════════════════════
 */

// 404 Not Found Handler
export const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, error: `Resource not found: ${req.method} ${req.originalUrl}` });
  } else {
    next();
  }
};

// Global Centralized Error Handler
export const globalErrorHandler = (logServerEvent, APP_VERSION) => (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  if (status >= 500) {
    console.error(`❌ [SERVER_ERROR] ${req.method} ${req.url}:`, err.stack);
    if (logServerEvent) {
      logServerEvent('CRITICAL_ERROR', { url: req.url, error: message }).catch(e => console.error('Failed to log server event:', e));
    }
  }

  // Handle Mongoose/MongoDB specific errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: 'Database validation failed', details: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, error: 'Duplicate entry conflict' });
  }

  res.status(status).json({ 
    success: false, 
    error: message, 
    version: APP_VERSION || 'unknown', 
    timestamp: getISTDate() 
  });
};
