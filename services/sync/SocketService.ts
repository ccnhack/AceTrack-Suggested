import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import config from '../../config';
import { eventBus } from '../EventBus';
import logger from '../../utils/logger';
import storage from '../../utils/storage';

class SocketService {
  private socket: Socket | null = null;

  public getSocket(): Socket | null {
    return this.socket;
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
      this.socket.on('connect', () => {
        console.log(`[SocketService] Connected! ID: ${this.socket?.id}`);
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: true, source: 'socket' });
      });

      this.socket.on('disconnect', (reason) => {
        console.warn(`[SocketService] Disconnected. Reason: ${reason}`);
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: false, source: 'socket' });
      });

      this.socket.on('connect_error', (err: any) => {
        console.error(`[SocketService] Connection Error: ${err.message}`);
        console.log('[SocketService] Query Params:', this.socket?.io.opts.query);
      });

      this.socket.on('data_updated', async (data) => {
        try {
          console.log(`[SocketService] [DATA_UPDATED] Received keys: ${Object.keys(data?.updates || {}).join(', ')}`);
          if (data?.lastSocketId && this.socket?.id && data.lastSocketId === this.socket.id) {
            console.log('[SocketService] [DATA_UPDATED] Skipping self-originated update.');
            return;
          }
          await onRemoteUpdate(data.updates);
        } catch (e: any) {
          console.error('[SocketService] socket:data_updated error:', e);
        }
      });

      this.socket.on('admin_ping_device_relay', async (data: any) => {
        try {
          if (data.targetUserId === userId && this.socket) {
            console.log('[SocketService] Received Admin Ping — Replying with Pong');
            const deviceId = hardwareId || await storage.getItem('acetrack_device_id') || Constants.sessionId || 'mobile_client';
            this.socket.emit('device_pong', {
              targetUserId: userId,
              deviceId,
              deviceName: Constants.deviceName || Platform.OS,
              appVersion: Constants.expoConfig?.version || config.APP_VERSION || '2.6.258',
              timestamp: Date.now()
            });
          }
        } catch (e: any) {
          console.error('[SocketService] socket:admin_ping error:', e);
        }
      });

      this.socket.on('force_upload_diagnostics', async (data: any) => {
        try {
          if (data.targetUserId === userId) {
             console.log('[SocketService] Received Force Upload Request');
             logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', {
               adminId: data.adminId,
               targetUserId: data.targetUserId,
               myId: userId,
               targetDeviceId: data.targetDeviceId,
               myDeviceId: hardwareId
             });
             
             const user = await storage.getItem('currentUser');
             const label = userId || user?.name || 'Guest';
             const deviceId = hardwareId || await storage.getItem('acetrack_device_id') || 'unknown';
             const allLogs = logger.getLogs();
             const headers: Record<string, string> = {
               'Content-Type': 'application/json',
               'x-ace-api-key': config.ACE_API_KEY
             };
             if (userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${userToken}`;

             await fetch(`${config.API_BASE_URL}${config.getEndpoint('DIAGNOSTICS')}`, {
               method: 'POST',
               headers,
               credentials: 'include',
               body: JSON.stringify({
                 username: label,
                 logs: allLogs,
                 prefix: 'admin_requested',
                 deviceId
               })
             });
             logger.logAction('ADMIN_DIAGNOSTICS_PULL_SUCCESS', { count: allLogs.length });
          }
        } catch (e: any) {
          console.error('[SocketService] Remote diagnostic upload failed:', e);
          logger.logAction('ADMIN_DIAGNOSTICS_PULL_FAILED', { error: e.message });
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
