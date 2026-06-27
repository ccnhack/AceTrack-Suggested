/**
 * apiResponse — Standardized API Response Helpers for AceTrack Backend
 * Phase 4C: Production Hardening (v2.6.345)
 *
 * Usage:
 *   import { success, error, paginated } from '../utils/apiResponse.mjs';
 *   return success(res, { user }, 'Login successful');
 *   return error(res, 400, 'Invalid email format');
 */

/**
 * Send a standardized success response
 * @param {object} res - Express response object
 * @param {*} data - Response payload
 * @param {string} message - Human-readable success message
 * @param {number} statusCode - HTTP status code (default 200)
 */
export const success = (res, data = null, message = 'OK', statusCode = 200) => {
  const body = { success: true, message };
  if (data !== null && data !== undefined) body.data = data;
  body.timestamp = new Date().toISOString();
  return res.status(statusCode).json(body);
};

/**
 * Send a standardized error response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Human-readable error message
 * @param {*} details - Optional error details (field-level errors, context)
 */
export const error = (res, statusCode = 500, message = 'Internal server error', details = null) => {
  const body = {
    success: false,
    error: { message }
  };
  if (details) body.error.details = details;
  body.timestamp = new Date().toISOString();
  return res.status(statusCode).json(body);
};

/**
 * Send a paginated success response
 * @param {object} res - Express response object
 * @param {Array} items - Array of items for this page
 * @param {number} total - Total count of all items
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Items per page
 */
export const paginated = (res, items, total, page = 1, limit = 20) => {
  return res.status(200).json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    },
    timestamp: new Date().toISOString()
  });
};
