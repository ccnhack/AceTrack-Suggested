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

  setSeenAdminActionIds: (ids) => set((state) => {
    // 🛡️ [SET_COERCION] (v2.6.789): Support functional updates and always coerce to Set
    const resolved = typeof ids === 'function' ? ids(state.seenAdminActionIds) : ids;
    return { seenAdminActionIds: resolved instanceof Set ? resolved : new Set(resolved || []) };
  }),
  setAuditLogs: (logs) => set({ auditLogs: logs }),
  setVisitedAdminSubTabs: (tabs) => set((state) => {
    // 🛡️ [SET_COERCION] (v2.6.789): Support functional updates and always coerce to Set
    const resolved = typeof tabs === 'function' ? tabs(state.visitedAdminSubTabs) : tabs;
    return { visitedAdminSubTabs: resolved instanceof Set ? resolved : new Set(resolved || []) };
  }),
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
    // 🛡️ [DEFENSIVE_COERCE] (v2.6.789): Ensure we always serialize from a Set, not a function/object
    const safeIds = state.seenAdminActionIds instanceof Set ? state.seenAdminActionIds : new Set();
    const safeTabs = state.visitedAdminSubTabs instanceof Set ? state.visitedAdminSubTabs : new Set();
    const currentIds = Array.from(safeIds);
    const currentTabs = Array.from(safeTabs);
    
    // We only trigger syncAndSaveData, orchestrator handles debouncing/deduping
    syncOrchestrator.syncAndSaveData({ 
      seenAdminActionIds: currentIds,
      visitedAdminSubTabs: currentTabs
    });
  }
});
