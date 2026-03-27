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
  let messages = [];
  for (let pushToken of tokens) {
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
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
  (async () => {
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('Push ticket chunk sent successfully');
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }
  })();

  // In a production app, you would later check the tickets for errors.
  return tickets;
}
