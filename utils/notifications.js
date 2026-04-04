/**
 * 🔔 Push Notification Service
 * v2.6.3 Production Hardened
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and get the device token
 * @returns {Promise<string|null>} Push token
 */
export const registerForPushNotifications = async () => {
  if (Platform.OS === 'web') return null;
  
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // 🛡️ Get Token with Fallback
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('📱 Push token registered:', token);
    return token;
  } catch (error) {
    console.error('❌ Failed to get push token:', error);
    return null;
  }
};

/**
 * Send a local notification (Immediate)
 * @param {string} title
 * @param {string} body
 * @param {Object} data - Additional data payload
 */
export const sendLocalNotification = async (title, body, data = {}) => {
  console.log(`🔔 Local notification: ${title} — ${body}`);
  
  try {
    await Notifications.scheduleNotificationAsync({
      content: { 
        title, 
        body, 
        data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Immediate
    });
  } catch (err) {
    console.error("❌ Send Notification Error:", err);
  }
};

/**
 * Notification types for the app
 */
export const NOTIFICATION_TYPES = {
  TOURNAMENT_REMINDER: 'tournament_reminder',
  MATCH_ASSIGNED: 'match_assigned',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  SUPPORT_REPLY: 'support_reply',
  WAITLIST_PROMOTED: 'waitlist_promoted',
  TOURNAMENT_RESULT: 'tournament_result',
  COACH_EVALUATION: 'coach_evaluation',
  WARM_UP_COMPLETE: 'warm_up_complete',
  ANNOUNCEMENT: 'announcement',
  REFERRAL_REWARD: 'referral_reward',
};

/**
 * Schedule a tournament reminder (24h before)
 * @param {Object} tournament
 */
export const scheduleTournamentReminder = async (tournament) => {
  if (!tournament || !tournament.date) return;

  const tournamentDate = new Date(tournament.date);
  const reminderDate = new Date(tournamentDate.getTime() - 24 * 60 * 60 * 1000);
  
  if (reminderDate > new Date()) {
    console.log(`⏰ Tournament reminder scheduled for ${reminderDate.toISOString()}`);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🏆 Tournament Tomorrow!`,
          body: `${tournament.title} starts tomorrow at ${tournament.time || 'TBD'}`,
          data: { type: NOTIFICATION_TYPES.TOURNAMENT_REMINDER, tournamentId: tournament.id },
          sound: true,
        },
        trigger: reminderDate,
      });
    } catch (err) {
      console.error("❌ Schedule Notification Error:", err);
    }
  }
};

/**
 * Create an announcement notification for all tournament players
 * @param {string} message
 * @param {string} tournamentId
 * @param {Array} playerIds
 * @returns {Object} Notification payload
 */
export const createAnnouncementPayload = (message, tournamentId, playerIds) => {
  return {
    type: NOTIFICATION_TYPES.ANNOUNCEMENT,
    message,
    tournamentId,
    targetPlayerIds: playerIds,
    timestamp: new Date().toISOString(),
  };
};

export default {
  registerForPushNotifications,
  sendLocalNotification,
  scheduleTournamentReminder,
  createAnnouncementPayload,
  NOTIFICATION_TYPES,
};

