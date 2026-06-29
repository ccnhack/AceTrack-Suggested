import { getISTDate } from '../helpers/utils.mjs';
import { errorResponse } from '../utils/apiResponse.mjs';
import { AppError } from '../utils/AppError.mjs';

/**
 * ═══════════════════════════════════════════════════════════════
 * 🛡️ Error Handling Middleware
 * Standardized API response format for all server errors.
 * ═══════════════════════════════════════════════════════════════
 */

// 404 Not Found Handler
export const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next(new AppError(`Resource not found: ${req.method} ${req.originalUrl}`, 404));
  } else {
    next();
  }
};

// Global Centralized Error Handler
export const globalErrorHandler = (logServerEvent, APP_VERSION) => (err, req, res, next) => {
  let error = err;
  
  if (!(error instanceof AppError)) {
    const statusCode = error.status || 500;
    const message = error.message || 'Internal Server Error';
    error = new AppError(message, statusCode);
    error.isOperational = false;
  }

  if (error.statusCode >= 500) {
    console.error(`❌ [SERVER_ERROR] ${req.method} ${req.url}:`, err.stack);
    if (logServerEvent) {
      logServerEvent('CRITICAL_ERROR', { url: req.url, error: error.message }).catch(e => console.error('Failed to log server event:', e));
    }
  } else if (error.statusCode === 413) {
    console.warn(`⚠️ [PAYLOAD_TOO_LARGE] ${req.method} ${req.url}: ${err.message}`);
    if (logServerEvent) {
      logServerEvent('PAYLOAD_TOO_LARGE', { url: req.url, error: error.message }).catch(e => {});
    }
  }

  // Handle Mongoose/MongoDB specific errors
  if (err.name === 'ValidationError') {
    return errorResponse(res, 'Database validation failed', 400, err.message);
  }
  if (err.code === 11000) {
    return errorResponse(res, 'Duplicate entry conflict', 409);
  }

  res.status(error.statusCode).json({ 
    success: false, 
    error: error.message, 
    version: APP_VERSION || 'unknown', 
    timestamp: getISTDate() 
  });
};
