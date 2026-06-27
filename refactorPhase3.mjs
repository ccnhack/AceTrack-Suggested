import fs from 'fs';
import path from 'path';

const storeContent = `import { create } from 'zustand';
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
      if (token) headers['Authorization'] = \`Bearer \${token}\`;

      const response = await fetch(\`\${config.API_BASE_URL}\${config.getEndpoint('DIAGNOSTICS')}\`, {
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
`;

fs.mkdirSync(path.join(process.cwd(), 'stores'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'stores', 'useAdminStore.js'), storeContent);

const filesToUpdate = [
  'components/AdminProfileModals.js',
  'components/admin/AdminShiftManagementPanel.js',
  'components/admin/AdminSupportTeamPanel.js',
  'components/admin/AdminAssignmentPanel.js',
  'screens/ProfileScreen.js',
  'screens/OrgChatScreen.js',
  'screens/MatchesScreen.js',
  'screens/AdminHubScreen.js'
];

filesToUpdate.forEach(file => {
  const p = path.join(process.cwd(), file);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    // Replace import
    content = content.replace(
      /import { useAdmin } from '..\/context\/AdminContext';/g,
      "import { useAdminStore as useAdmin } from '../stores/useAdminStore';"
    );
    content = content.replace(
      /import { useAdmin } from '..\/..\/context\/AdminContext';/g,
      "import { useAdminStore as useAdmin } from '../../stores/useAdminStore';"
    );
    
    // Since useAdmin() becomes useAdminStore() and it returns the state directly, 
    // the alias `useAdminStore as useAdmin` works perfectly! 
    // Zustand's hook returns the whole store state when called with no arguments.
    // e.g., const { seenAdminActionIds } = useAdmin(); works identically in Zustand.
    
    fs.writeFileSync(p, content);
  }
});

// Lastly, we need to call hydrate() when the app starts.
// We'll inject it into App.js or AdminHubScreen.js
const appJsPath = path.join(process.cwd(), 'App.js');
let appJsContent = fs.readFileSync(appJsPath, 'utf8');
if (!appJsContent.includes('useAdminStore.getState().hydrate()')) {
  appJsContent = appJsContent.replace(
    "import { syncOrchestrator } from './services/sync/SyncOrchestrator';",
    "import { syncOrchestrator } from './services/sync/SyncOrchestrator';\nimport { useAdminStore } from './stores/useAdminStore';"
  );
  appJsContent = appJsContent.replace(
    "syncOrchestrator.initialize();",
    "syncOrchestrator.initialize();\n      useAdminStore.getState().hydrate();"
  );
  fs.writeFileSync(appJsPath, appJsContent);
}

console.log('Phase 3 - Zustand Migration Complete');
