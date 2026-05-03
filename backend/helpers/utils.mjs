/**
 * HELPERS: Utility Functions
 * Extracted from server.mjs (v2.6.315 Phase 1 Modularization)
 * 
 * Pure utility functions with no side effects.
 */

// 🕓 Utility: Get current IST timestamp for filenames (v2.6.84)
export const getISTTimestamp = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');
};

// 🕓 Utility: Get current IST date (v2.6.89)
export const getISTDate = () => {
  const now = new Date();
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000)).toISOString();
};

// 🛡️ Helper: Persistent In-App Notifications (v2.6.89)
export const addInAppNotification = (player, title, message, data = {}) => {
  if (!player) return;
  if (!player.notifications) player.notifications = [];
  player.notifications.unshift({
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title,
    message,
    date: getISTDate(),
    read: false,
    ...data
  });
  if (player.notifications.length > 50) player.notifications = player.notifications.slice(0, 50);
};

// 🛡️ Express async handler wrapper (prevents unhandled promise rejections)
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
