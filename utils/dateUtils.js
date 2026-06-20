/**
 * DATE UTILITIES (v2.6.657)
 * 
 * Centralized IST date formatting functions.
 * Replaces the global Date.prototype mutations in App.js with explicit,
 * opt-in formatting that doesn't affect third-party libraries.
 */

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_LOCALE = 'en-IN';

/**
 * Format a Date to IST locale time string.
 * @param {Date} date - The date to format
 * @param {object} [options] - Additional Intl.DateTimeFormat options
 * @returns {string} Formatted time string with IST suffix
 */
export function formatTimeIST(date, options = {}) {
  const finalOptions = { ...options, timeZone: IST_TIMEZONE };
  let str = date.toLocaleTimeString(IST_LOCALE, finalOptions);
  if (typeof str === 'string' && !str.includes('IST')) {
    str += ' IST';
  }
  return str;
}

/**
 * Format a Date to IST locale date string.
 * @param {Date} date - The date to format
 * @param {object} [options] - Additional Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDateIST(date, options = {}) {
  const finalOptions = { ...options, timeZone: IST_TIMEZONE };
  return date.toLocaleDateString(IST_LOCALE, finalOptions);
}

/**
 * Format a Date to IST locale date+time string.
 * @param {Date} date - The date to format
 * @param {object} [options] - Additional Intl.DateTimeFormat options
 * @returns {string} Formatted date+time string with IST suffix
 */
export function formatDateTimeIST(date, options = {}) {
  const finalOptions = { ...options, timeZone: IST_TIMEZONE };
  let str = date.toLocaleString(IST_LOCALE, finalOptions);
  if (typeof str === 'string' && !str.includes('IST')) {
    str += ' IST';
  }
  return str;
}

export default { formatTimeIST, formatDateIST, formatDateTimeIST };
