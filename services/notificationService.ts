import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import config from '../config';
import logger from '../utils/logger';

/**
 * Configure how notifications should be handled when the app is in the foreground.
 */
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Notification handler could not be set:', e.message);
  }
}

/**
 * Request permissions and register for push notifications.
 * Returns the Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token;
  
  logger.logAction('PUSH_TOKEN_REQUEST_INITIATED');

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    } catch (error) {
      console.warn('Android notification channel could not be set:', error.message);
    }
  }

  if (Device.isDevice) {
    let finalStatus;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      console.log(`✅ [NOTIFY_DEBUG] Existing permission status: ${existingStatus}`);
      
      if (existingStatus !== 'granted') {
        console.log('⚠️ [NOTIFY_DEBUG] Permissions not granted, requesting...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log(`✅ [NOTIFY_DEBUG] Requested permission status: ${status}`);
      }
    } catch (error) {
      console.warn('❌ [NOTIFY_DEBUG] Notification permissions check failed:', error.message);
      logger.logAction('PUSH_PERMISSIONS_EXCEPTION', { error: error.message });
      return null;
    }
    
    if (finalStatus !== 'granted') {
      console.log('❌ [NOTIFY_DEBUG] Failed to get push token: permission denied');
      logger.logAction('PUSH_PERMISSIONS_DENIED', { finalStatus });
      return null;
    }

    // Use the EAS project ID from constants
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) {
      console.log('Project ID not found in Constants. Ensure EAS is configured.');
      return null;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log(`✅ [NOTIFY_DEBUG] Expo Push Token: ${token}`);
      logger.logAction('PUSH_TOKEN_GENERATED', { token, projectId });
    } catch (e) {
      console.warn('❌ [NOTIFY_DEBUG] Error getting push token:', e.message);
      logger.logAction('PUSH_TOKEN_GENERATION_ERROR', { error: e.message });
      return null;
    }
  } else {
    console.log('Must use physical device for Push Notifications');
    return null;
  }

  return token;
}

/**
 * Send the generated push token to the backend to associate it with the current player.
 */
export async function sendTokenToBackend(userId: string, token: string) {
  try {
    const response = await fetch(`${config.API_BASE_URL}/api/register-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID,
      },
      credentials: 'include',
      body: JSON.stringify({ userId, pushToken: token }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'No JSON body' }));
      console.log(`❌ [NOTIFY_DEBUG] Failed to register token on backend (${response.status}):`, errorData.message);
      logger.logAction('PUSH_TOKEN_BACKEND_SYNC_FAIL', { status: response.status, error: errorData.message, userId });
    } else {
      console.log(`✅ [NOTIFY_DEBUG] Push token successfully registered for ${userId}`);
      logger.logAction('PUSH_TOKEN_BACKEND_SYNC_SUCCESS', { userId });
    }
  } catch (error) {
    console.log('❌ [NOTIFY_DEBUG] Exception sending push token to backend:', error.message);
    logger.logAction('PUSH_TOKEN_BACKEND_SYNC_EXCEPTION', { error: error.message, userId });
  }
}
