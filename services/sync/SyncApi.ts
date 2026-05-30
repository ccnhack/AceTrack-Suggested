import { Platform } from 'react-native';
import config from '../../config';
import { eventBus } from '../EventBus';
import { telemetryService } from './TelemetryService';

class SyncApi {
  public async pushToApi(
    updates: Record<string, any>, 
    syncVersion: number,
    userId: string | null,
    userToken: string | null,
    isAuthMuted: boolean,
    isInternal: boolean
  ): Promise<{ success: boolean | 'RETRY_RATE_LIMIT' | 'RETRY_CONFLICT', status?: number, newServerVersion?: number }> {
    const cloudUrl = config.API_BASE_URL;
    telemetryService.trackMetric('pushAttemptCount');

    const actorId = String(userId || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId === 'null' || actorId === 'undefined' || actorId.startsWith('device_') || isAuthMuted) {
       console.log(`[SyncApi] 🛡️ Push Suppressed: Identity is ${userId || 'missing'}${isAuthMuted ? ' (Auth Muted)' : ''}. Skipping Cloud Sync.`);
       return { success: false, status: 403 };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      if (updates.supportTickets && Array.isArray(updates.supportTickets)) {
        updates.supportTickets = updates.supportTickets.map((t: any) => {
          if (!t?.messages) return t;
          const promotedMsgs = t.messages.map((m: any) => m.status === 'pending' ? { ...m, status: 'sent' } : m);
          return { ...t, messages: promotedMsgs };
        });
      }

      console.log(`[SyncApi] [${new Date().toISOString()}] Pushing to API: ${Object.keys(updates).join(', ')} [v:${syncVersion}]`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.ACE_API_KEY,
        'x-user-id': userId || 'guest'
      };
      if (userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${userToken}`;

      const response = await fetch(`${cloudUrl}${config.getEndpoint('DATA_SAVE')}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...updates,
          version: syncVersion,
          isInternal,
          atomicKeys: [...(updates.atomicKeys || [])]
        }),
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.warn(`[SyncApi] 🛑 Terminal Auth Failure (${response.status}). Muting sync.`);
          eventBus.emit('AUTH_FAILURE', { status: response.status, endpoint: `${cloudUrl}${config.getEndpoint('DATA_SAVE')}` });
          return { success: false, status: response.status };
        }
        if (response.status === 429) {
          console.warn('[SyncApi] Rate limited by server');
          telemetryService.trackMetric('rateLimitCount');
          telemetryService.trackIncident('reliability', 'HTTP 429: Rate limited by cloud server. Automatic backoff engaged.');
          return { success: 'RETRY_RATE_LIMIT', status: 429 };
        } else if (response.status === 409) {
          console.warn('[SyncApi] OCC conflict detected (409). Will re-pull.');
          telemetryService.trackMetric('conflictCount');
          telemetryService.trackIncident('reliability', 'HTTP 409: Version conflict. Cloud has newer state.');
          let newServerVersion;
          try {
            const conflictData = await response.json();
            if (conflictData.serverVersion) newServerVersion = conflictData.serverVersion;
          } catch (e) { /* ignore parse failure */ }
          return { success: 'RETRY_CONFLICT', status: 409, newServerVersion };
        }
        return { success: false, status: response.status };
      }

      await response.json();
      return { success: true, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[SyncApi] API Push failed:', error);
      throw error; 
    }
  }

  public async pullFromApi(
    userId: string | null,
    userToken: string | null,
    isAuthMuted: boolean,
    since?: string | null
  ): Promise<{ success: boolean, data?: any, status?: number, serverTimestamp?: string }> {
    const cloudUrl = config.API_BASE_URL;
    telemetryService.trackMetric('pullAttemptCount');

    if (isAuthMuted) return { success: false, status: 401 };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const headers: Record<string, string> = {
        'x-ace-api-key': config.ACE_API_KEY,
        'x-user-id': userId || 'guest'
      };
      if (userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${userToken}`;

      // 📡 [DELTA SYNC] (v2.6.431): Append since param for incremental pulls
      const syncContext = since ? 'delta_refresh' : 'full_hydrate';
      const sinceQuery = since ? `&since=${encodeURIComponent(since)}` : '';
      const pullUrl = `${cloudUrl}${config.getEndpoint('DATA_SYNC')}?syncContext=${syncContext}${sinceQuery}`;

      console.log(`[SyncApi] [PULL] Initiating ${since ? 'DELTA' : 'FULL'} pull from ${pullUrl}`);
      const response = await fetch(pullUrl, {
        headers,
        credentials: 'include',
        signal: controller.signal
      });

      console.log(`[SyncApi] [PULL] Server responded with status ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[SyncApi] [PULL] Data received. isDelta: ${data.isDelta || false}, Cloud Version: ${data.version || '0'}`);
        return { success: true, data, status: response.status, serverTimestamp: data.serverTimestamp };
      }

      clearTimeout(timeoutId);
      return { success: false, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[SyncApi] API Pull failed:', error);
      return { success: false };
    }
  }

  public async reportEmergencyStatus(userId: string, hardwareId: string | null, userToken: string | null, error: string) {
    try {
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
          username: userId,
          logs: [{ 
            timestamp: new Date().toISOString(), 
            level: 'ERROR', 
            type: 'SYNC_FATAL', 
            message: `SYNC_INIT_CRASH: ${error}`
          }],
          prefix: 'crash_report',
          deviceId: hardwareId || 'unknown'
        })
      });
    } catch (e) {
      // Last resort failed
    }
  }
}

export const syncApi = new SyncApi();
