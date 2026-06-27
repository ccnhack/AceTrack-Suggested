/**
 * AppError — Custom Error Classification for AceTrack Backend
 * Phase 4A: Production Hardening (v2.6.345)
 *
 * Usage:
 *   throw new AppError('User not found', 404, 'NOT_FOUND');
 *   throw AppError.validation('Email is required');
 *   throw AppError.auth('Invalid credentials');
 */

export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} type - Error classification type
   * @param {boolean} isOperational - If true, this is an expected/handled error (not a bug)
   * @param {object} details - Optional structured details (field errors, context)
   */
  constructor(message, statusCode = 500, type = 'INTERNAL_ERROR', isOperational = true, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.type = type;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory Methods ──────────────────────────────────────────

  static validation(message, details = null) {
    return new AppError(message, 400, 'VALIDATION_ERROR', true, details);
  }

  static auth(message = 'Authentication required') {
    return new AppError(message, 401, 'AUTH_ERROR', true);
  }

  static forbidden(message = 'Access denied') {
    return new AppError(message, 403, 'FORBIDDEN', true);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND', true);
  }

  static conflict(message = 'Resource conflict') {
    return new AppError(message, 409, 'CONFLICT', true);
  }

  static rateLimit(message = 'Too many requests') {
    return new AppError(message, 429, 'RATE_LIMIT', true);
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR', false);
  }

  toJSON() {
    return {
      success: false,
      error: {
        type: this.type,
        message: this.message,
        ...(this.details ? { details: this.details } : {})
      }
    };
  }
}
