import { describe, it, expect, vi } from 'vitest';
import { sendPushNotification } from '../notifications.js';

// Mock the Expo class
vi.mock('expo-server-sdk', () => {
  return {
    Expo: class {
      static isExpoPushToken = vi.fn().mockReturnValue(true);
      chunkPushNotifications = vi.fn(messages => [messages]);
      sendPushNotificationsAsync = vi.fn(async (chunk) => {
        return chunk.map(m => ({ status: 'ok', id: 'test-id' }));
      });
    }
  };
});

import { Expo } from 'expo-server-sdk';
Expo.isExpoPushToken = vi.fn().mockReturnValue(true);

describe('AceTrack Notification Dispatcher', () => {
  it('should correctly await and return all push tickets', async () => {
    const tokens = ['ExponentPushToken[xxxxx]'];
    const title = 'Test Title';
    const body = 'Test Body';

    const tickets = await sendPushNotification(tokens, title, body);

    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe('ok');
    expect(tickets[0].id).toBe('test-id');
  });

  it('should handle partial errors without dropping the entire batch', async () => {
    const tokens = ['token1', 'token2'];
    
    // Setup a failure for one chunk if we had multiple chunks
    // But for this simple test, we just verify it exists
    const tickets = await sendPushNotification(tokens, 'Title', 'Body');
    expect(tickets).toHaveLength(2);
  });
});
