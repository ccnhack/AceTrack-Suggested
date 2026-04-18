import { Alert } from 'react-native';

/**
 * 🔔 Centralized Notification Utility
 * v2.6.74 Production Hardened
 * 
 * Displays success/error messages using the native Alert system.
 * Handles AceTrack result objects: { success, message, code, error }
 * 
 * @param {Object|string} res - Result object or simple message string
 */
const notify = (res) => {
  if (!res) return;

  let title = 'Notification';
  let message = '';

  if (typeof res === 'string') {
    message = res;
  } else {
    // 🛡️ Robust extraction from AceTrack result patterns
    const isSuccess = res.success === true || res.code === 'SUCCESS';
    title = isSuccess ? 'Success' : 'Error';
    message = res.message || res.error || (isSuccess ? 'Operation completed successfully' : 'Something went wrong');
  }

  Alert.alert(title, message);
};

// Supporting both default and named exports for codebase flexibility
export { notify };
export default notify;
