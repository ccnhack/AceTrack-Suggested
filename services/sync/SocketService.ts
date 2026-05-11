import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import config from '../../config';
import { eventBus } from '../EventBus';
import logger from '../../utils/logger';
import storage from '../../utils/storage';
import { useCommsStore } from '../../stores/useCommsStore'; // 🛡️ [PATH_FIXED] (v2.6.405)

class SocketService {
  private socket: Socket | null = null;

  public getSocket(): Socket | null {
    return this.socket;
  }

  // 📡 [LISTENER_DELEGATION] (v2.6.405)
  public on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public off(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  public setupSocket(
    userId: string, 
    role: string | undefined, 
    userToken: string | null,
    hardwareId: string | null,
    onRemoteUpdate: (updates: Record<string, any>) => Promise<void>
  ) {
    if (this.socket) {
        this.socket.disconnect();
    }

    const getDeviceName = () => {
      if (Platform.OS !== 'web') return Platform.OS;
      if (typeof navigator === 'undefined') return 'Browser';
      const ua = navigator.userAgent;
      if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
      if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
      if (ua.includes('Firefox')) return 'Firefox';
      if (ua.includes('Edg')) return 'Edge';
      return 'Browser';
    };

    this.socket = io(config.API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: { userId, role: role || 'user', deviceName: getDeviceName() },
      auth: { 
        token: userToken || config.PUBLIC_APP_ID,
        apiKey: config.PUBLIC_APP_ID 
      },
      withCredentials: true,
      extraHeaders: { 
        'x-ace-api-key': config.PUBLIC_APP_ID,
        ...(Platform.OS !== 'web' && userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
      }
    });

    try {
      this.socket.on('org_chat_message', (msg) => {
        useCommsStore.getState().appendMessage(msg);
      });

      // 😄 [REACTION_SYNC] (v2.6.405)
      this.socket.on('org_chat_reaction', ({ messageId, reactions }) => {
        useCommsStore.getState().updateReactions(messageId, reactions);
      });

      // 🗑️ [DELETE_SYNC] (v2.6.405)
      this.socket.on('org_chat_delete', ({ messageId }) => {
        useCommsStore.getState().removeMessage(messageId);
      });

      this.socket.on('connect', () => {
        console.log(`[SocketService] Connected! ID: ${this.socket?.id}`);
        if (userId && this.socket) {
          this.socket.emit('join', String(userId).toLowerCase());
        }
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: true, source: 'socket' });
      });

      this.socket.on('disconnect', (reason) => {
        console.warn(`[SocketService] Disconnected. Reason: ${reason}`);
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: false, source: 'socket' });
      });

      this.socket.on('connect_error', (err: any) => {
        console.error(`[SocketService] Connection Error: ${err.message}`);
      });

      this.socket.on('data_updated', async (data) => {
        try {
          if (data?.lastSocketId && this.socket?.id && data.lastSocketId === this.socket.id) {
            return;
          }
          await onRemoteUpdate(data.updates);
        } catch (e: any) {
          console.error('[SocketService] socket:data_updated error:', e);
        }
      });
    } catch (e: any) {
      console.error('[SocketService] setupSocket listeners failed:', e);
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
