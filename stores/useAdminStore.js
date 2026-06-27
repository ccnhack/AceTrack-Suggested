import { create } from 'zustand';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import { eventBus } from '../services/EventBus';
import logger from '../utils/logger';
import config from '../config';
import storage from '../utils/storage';
import { Alert } from 'react-native';

export const useAdminStore = create((set, get) => ({
  seenAdminActionIds: new Set(),
  auditLogs: [],
  visitedAdminSubTabs: new Set(),
  isUploadingLogs: false,

  setSeenAdminActionIds: (ids) => set({ seenAdminActionIds: ids }),
  setAuditLogs: (logs) => set({ auditLogs: logs }),
  setVisitedAdminSubTabs: (tabs) => set({ visitedAdminSubTabs: tabs }),
  setIsUploadingLogs: (val) => set({ isUploadingLogs: val }),

  hydrate: async () => {
    const ids = await syncOrchestrator.getSystemFlag('seenAdminActionIds');
    const logs = await syncOrchestrator.getSystemFlag('auditLogs');
    const tabs = await syncOrchestrator.getSystemFlag('visitedAdminSubTabs');
    set({
      seenAdminActionIds: ids ? new Set(ids) : new Set(),
      auditLogs: logs || [],
      visitedAdminSubTabs: tabs ? new Set(tabs) : new Set()
    });
  },

  onLogFailedOtp: async (tid, coachId, otp) => {
    const tournaments = await syncOrchestrator.getSystemFlag('tournaments');
    if (!tournaments) return;
    const updated = tournaments.map(t => 
      t.id === tid 
        ? { ...t, failedOtps: [...(t.failedOtps || []), { coachId, otp, timestamp: new Date().toISOString() }] } 
        : t
    );
    await syncOrchestrator.syncAndSaveData({ tournaments: updated });
  },

  onUploadLogs: async () => {
    set({ isUploadingLogs: true });
    try {
      const logs = logger.getLogs();
      const currentUser = await syncOrchestrator.getSystemFlag('currentUser');
      const hardwareId = await syncOrchestrator.getSystemFlag('acetrack_device_id');
      const token = await storage.getItem('userToken');
      const headers = {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${config.API_BASE_URL}${config.getEndpoint('DIAGNOSTICS')}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          username: currentUser?.id || 'unknown',
          logs,
          prefix: 'manual_upload_',
          deviceId: hardwareId
        }),
      });
      if (!response.ok) throw new Error('Upload failed');
      Alert.alert('Success', 'Logs uploaded successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to upload logs: ' + e.message);
    } finally {
      set({ isUploadingLogs: false });
    }
  }
}));

// Background Event Listeners
eventBus.subscribe('ENTITY_UPDATED', async (e) => {
  const { entity, source } = e.payload;
  if (source === 'socket' || source === 'api') {
    if (entity === 'auditLogs') {
      const logs = await syncOrchestrator.getSystemFlag('auditLogs');
      if (logs) useAdminStore.getState().setAuditLogs(logs);
    } else if (entity === 'seenAdminActionIds') {
      const ids = await syncOrchestrator.getSystemFlag('seenAdminActionIds');
      if (ids) useAdminStore.getState().setSeenAdminActionIds(new Set(ids));
    }
  }
});

// Auto-sync persistence
useAdminStore.subscribe((state, prevState) => {
  if (state.seenAdminActionIds !== prevState.seenAdminActionIds || state.visitedAdminSubTabs !== prevState.visitedAdminSubTabs) {
    const currentIds = Array.from(state.seenAdminActionIds);
    const currentTabs = Array.from(state.visitedAdminSubTabs);
    
    // We only trigger syncAndSaveData, orchestrator handles debouncing/deduping
    syncOrchestrator.syncAndSaveData({ 
      seenAdminActionIds: currentIds,
      visitedAdminSubTabs: currentTabs
    });
  }
});
