import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { eventBus } from '../services/EventBus';
import { useApp } from './AppContext';
import logger from '../utils/logger';
import config from '../config';

const AdminContext = createContext(null);

export const useAdmin = () => useContext(AdminContext);

export const AdminProvider = ({ children }) => {
  const [seenAdminActionIds, setSeenAdminActionIds] = useState(new Set());
  const [auditLogs, setAuditLogs] = useState([]);
  const [visitedAdminSubTabs, setVisitedAdminSubTabs] = useState(new Set());
  const [isUploadingLogs, setIsUploadingLogs] = useState(false);
  const { syncAndSaveData } = useSync();
  const { pushStatus } = useApp();

  useEffect(() => {
    const hydrate = async () => {
      const ids = await syncManager.getSystemFlag('seenAdminActionIds');
      const logs = await syncManager.getSystemFlag('auditLogs');
      const tabs = await syncManager.getSystemFlag('visitedAdminSubTabs');
      if (ids) setSeenAdminActionIds(new Set(ids));
      if (logs) setAuditLogs(logs);
      if (tabs) setVisitedAdminSubTabs(new Set(tabs));
    };
    hydrate();
  }, []);

  // Entity Listener
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (source === 'socket' || source === 'api') {
        if (entity === 'auditLogs') {
          const logs = await syncManager.getSystemFlag('auditLogs');
          if (logs) setAuditLogs(logs);
        } else if (entity === 'seenAdminActionIds') {
          const ids = await syncManager.getSystemFlag('seenAdminActionIds');
          if (ids) setSeenAdminActionIds(new Set(ids));
        }
      }
    });
    return unsub;
  }, []);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Log failed OTP attempts to tournament
  const onLogFailedOtp = useCallback((tid, coachId, otp) => {
    const operation = async () => {
      const tournaments = await syncManager.getSystemFlag('tournaments');
      if (!tournaments) return;
      const updated = tournaments.map(t => 
        t.id === tid 
          ? { ...t, failedOtps: [...(t.failedOtps || []), { coachId, otp, timestamp: new Date().toISOString() }] } 
          : t
      );
      await syncManager.syncAndSaveData({ tournaments: updated });
    };
    operation();
  }, []);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Upload diagnostic logs
  const onUploadLogs = useCallback(async () => {
    setIsUploadingLogs(true);
    try {
      const logs = logger.getLogs();
      const currentUser = await syncManager.getSystemFlag('currentUser');
      const hardwareId = await syncManager.getSystemFlag('acetrack_device_id');
      const response = await fetch(`${config.API_BASE_URL}/api/diagnostics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID,
        },
        body: JSON.stringify({
          username: currentUser?.name || 'unknown',
          logs,
          prefix: 'manual_upload',
          deviceId: hardwareId
        }),
      });
      if (!response.ok) throw new Error('Upload failed');
      Alert.alert('Success', 'Logs uploaded successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to upload logs: ' + e.message);
    } finally {
      setIsUploadingLogs(false);
    }
  }, []);

  const value = {
    seenAdminActionIds,
    setSeenAdminActionIds,
    auditLogs,
    setAuditLogs,
    visitedAdminSubTabs,
    setVisitedAdminSubTabs,
    // 🛡️ [MIGRATION FIX] (v2.6.121) Missing handlers
    onLogFailedOtp,
    onUploadLogs,
    isUploadingLogs,
    pushStatus
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};
