import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
let expo = new Expo();

// 🛡️ [NOTIFY_DEBUG] v2.6.96: Expo Project ID is required for Android FCM delivery in production
const EXPO_PROJECT_ID = "636e8270-95c8-44e0-bf6f-bb544a857002";

/**
 * Send a push notification to a list of Expo push tokens.
 * @param {string[]} tokens - Array of strings (Expo push tokens)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Optional data payload
 */
export async function sendPushNotification(tokens, title, body, data = {}) {
  const uniqueTokens = [...new Set(tokens)];
  let messages = [];
  
  for (let pushToken of uniqueTokens) {
    if (!pushToken) continue;
    
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`🛑 [NOTIFY_DEBUG] Push token ${pushToken} is not valid.`);
      continue;
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      projectId: EXPO_PROJECT_ID, // 🛡️ CRITICAL: Required for Android FCM (v2.6.96)
    });
  }

  if (messages.length === 0) {
    console.log('⚠️ [NOTIFY_DEBUG] No valid tokens provided. Skipping dispatch.');
    return [];
  }

  // The Expo push notification service accepts batches of notifications.
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  
  for (let chunk of chunks) {
    try {
      console.log(`📡 [NOTIFY_DEBUG] Dispatching chunk of ${chunk.length} to Expo...`);
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('❌ [NOTIFY_DEBUG] Expo API Critical Error:', error);
    }
  }

  if (tickets.length > 0) {
    console.log(`✅ [NOTIFY_DEBUG] Batch Results: Received ${tickets.length} tickets from Expo.`);
    tickets.forEach((t, i) => {
      if (t.status === 'error') {
        console.error(`❌ [NOTIFY_DEBUG] Ticket ${i} (${uniqueTokens[i]}) Error: ${t.message} - ${t.details?.error || 'No details'}`);
      } else {
        console.log(`🎫 [NOTIFY_DEBUG] Ticket ${i} Success: ${t.id} (Status: ${t.status})`);
      }
    });
  }

  return tickets;
}
