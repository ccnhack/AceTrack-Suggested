import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import config from '../../config';
import { eventBus } from '../EventBus';
import logger from '../../utils/logger';
import storage from '../../utils/storage';
import { useCommsStore } from '../../stores/useCommsStore'; // 🛡️ [PATH_FIXED] (v2.6.405)
import { useAdminCoreStore } from '../../stores/useAdminCoreStore';

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
    onRemoteUpdate: (updates: Record<string, any>) => Promise<void>,
    lastSyncTimestamp: string | null = null  // 📡 [CATCH_UP] (v2.6.618)
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
      transports: ['polling', 'websocket'], // 🛡️ Stability: Prioritize HTTP polling handshake to bypass firewalls, then upgrade
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: { 
        userId, 
        role: role || 'user', 
        deviceName: getDeviceName(),
        // 📡 [CATCH_UP] (v2.6.618): Send last sync timestamp so backend can replay missed events
        ...(lastSyncTimestamp ? { lastSyncTimestamp: String(new Date(lastSyncTimestamp).getTime()) } : {})
      },
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

      // 📡 [PRESENCE] (v2.6.638)
      this.socket.on('user_presence_changed', ({ userId, isLive, lastActive }) => {
        useAdminCoreStore.getState().updatePresence(userId, isLive, lastActive);
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

      // 🛡️ [DIAGNOSTICS] ADMIN PING RESPONDER (v2.6.435)
      this.socket.on('admin_ping_device_relay', async (data: any) => {
        try {
          if (data.targetUserId === String(userId).toLowerCase() && this.socket) {
            console.log('[SocketService] Received Admin Ping — Replying with Pong');
            this.socket.emit('device_pong', {
              targetUserId: String(userId).toLowerCase(),
              deviceId: hardwareId || Constants.sessionId || 'mobile_client',
              deviceName: Constants.deviceName || getDeviceName(),
              appVersion: Constants.expoConfig?.version || config.APP_VERSION || '2.6.435',
              timestamp: Date.now()
            });
          }
        } catch (e: any) {
          console.error('[SocketService] socket:admin_ping error:', e);
        }
      });

      // 🛡️ [DIAGNOSTICS] FORCE UPLOAD RESPONDER
      this.socket.on('force_upload_diagnostics', async (data: any) => {
        try {
          // If a specific device is targeted, verify it matches
          if (data.targetDeviceId && hardwareId && data.targetDeviceId !== hardwareId) {
             return;
          }
          if (data.targetUserId === String(userId).toLowerCase()) {
             console.log('[SocketService] Received Force Upload Request');
             logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', {
               adminId: data.adminId,
               targetUserId: data.targetUserId,
               myId: userId,
               targetDeviceId: data.targetDeviceId,
               myDeviceId: hardwareId
             });
             
             const userStr = await storage.getItem('currentUser');
             let user = null;
             try { user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr; } catch (e) {}
             const label = user?.name || 'Guest';
             const deviceId = hardwareId || await storage.getItem('acetrack_device_id') || 'unknown';
             const allLogs = logger.getLogs();
             await fetch(`${config.API_BASE_URL}${config.getEndpoint('DIAGNOSTICS')}`, {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'x-ace-api-key': config.ACE_API_KEY,
                 ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
               },
               credentials: 'include',
               body: JSON.stringify({
                 username: String(userId).toLowerCase(), // 🛡️ [HOTFIX] Must be user ID for cloud matching
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

      this.socket.on('data_updated', async (data) => {
        try {
          if (data?.lastSocketId && this.socket?.id && data.lastSocketId === this.socket.id) {
            return;
          }
          await onRemoteUpdate(data);
        } catch (e: any) {
          console.error('[SocketService] socket:data_updated error:', e);
        }
      });

      // 🛡️ [ENTITY_BRIDGE] (v2.6.620): Bridge entity_updated events to the sync pipeline
      // The backend emits 'entity_updated' from REST endpoints (tournaments, evaluations,
      // support operations, media) with payload { entity, data, deletedId, source, timestamp }.
      // Previously these 33+ emitters were broadcasting into the void because the frontend
      // only listened for 'data_updated'. This listener translates the granular payload and
      // triggers a sync pull so clients see real-time updates from REST mutations.
      this.socket.on('entity_updated', async (data: any) => {
        try {
          if (!data?.entity) return;
          console.log(`📡 [SocketService] Received entity_updated: ${data.entity}${data.deletedId ? ' (delete)' : ''}`);
          
          // Translate to data_updated-compatible format and trigger sync pull
          // The onRemoteUpdate handler will see the 'keys' array and know which
          // entities to re-fetch from the server.
          await onRemoteUpdate({
            keys: [data.entity],
            timestamp: data.timestamp || Date.now(),
            source: 'entity_updated'
          });
        } catch (e: any) {
          console.error('[SocketService] socket:entity_updated error:', e);
        }
      });

      // 📡 [CATCH_UP] (v2.6.618): Handle missed events replayed by backend on reconnect
      // The server sends { supportTickets, tournaments, timestamp } for entities changed
      // since lastSyncTimestamp. Route through the same merge pipeline as data_updated.
      this.socket.on('catch_up', async (data: any) => {
        try {
          const totalKeys = Object.keys(data).filter(k => k !== 'timestamp').length;
          console.log(`📡 [SocketService] Received catch_up with ${totalKeys} entity types`);
          if (totalKeys > 0) {
            await onRemoteUpdate(data);
          }
        } catch (e: any) {
          console.error('[SocketService] socket:catch_up error:', e);
        }
      });

      // 🛡️ [SECURITY_SYNC] (v2.6.562): Force logout when backend suspends/terminates user
      this.socket.on('auth_invalidated', (data) => {
        if (data && data.userId && String(data.userId).toLowerCase() === String(userId).toLowerCase()) {
          console.warn(`🛑 [SocketService] Received auth_invalidated: ${data?.reason}`);
          eventBus.emit('AUTH_FAILURE', { status: 401, endpoint: 'socket:auth_invalidated' });
          this.disconnect();
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
