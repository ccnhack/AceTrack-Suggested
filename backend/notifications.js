import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
let expo = new Expo();

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
      console.error(`🛑 Push token ${pushToken} is not valid.`);
      continue;
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
    });
  }

  // The Expo push notification service accepts batches of notifications.
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  
  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('❌ Expo Push Error:', error);
    }
  }

  if (tickets.length > 0) {
    console.log(`✅ Push Dispatch: Sent ${messages.length} messages, received ${tickets.length} tickets.`);
  }

  // In a production app, you would later check the tickets for errors.
  return tickets;
}
