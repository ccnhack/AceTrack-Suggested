import fs from 'fs';
import path from 'path';

const p = path.join(process.cwd(), 'screens/AdminHubScreen.js');
let content = fs.readFileSync(p, 'utf8');

// 1. State
content = content.replace(
  `const [isPullingLive, setIsPullingLive] = useState(false);`,
  `const [pullingDeviceIds, setPullingDeviceIds] = useState({});`
);

// 2. Force Sync Cloud
const oldForceSync = `               <TouchableOpacity 
                 onPress={() => {
                   logger.logAction('ADMIN_MANUAL_SYNC_TRIGGER');
                   onManualSync?.();
                 }}
                 style={styles.diagSyncBtn}
               >`;
const newForceSync = `               <TouchableOpacity 
                 onPress={async () => {
                   logger.logAction('ADMIN_MANUAL_SYNC_TRIGGER');
                   onManualSync?.();
                   
                   if (selectedDiagUser) {
                      setIsFetchingDiags(true);
                      setUserDiagFiles([]);
                      try {
                        const url = \`\${activeApiUrl}/api/diagnostics\`;
                        const res = await fetch(url, { headers: { 'x-ace-api-key': config.PUBLIC_APP_ID } });
                        if (res.ok) {
                            const data = await res.json();
                            const pName = (selectedDiagUser.name || '').toLowerCase();
                            const pId = String(selectedDiagUser.id || '').toLowerCase();
                            const firstName = pName.split(' ')[0];

                            const safeName = selectedDiagUser.name ? selectedDiagUser.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
                            const safeId = selectedDiagUser.id ? String(selectedDiagUser.id).replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
                            const pEmailPrefix = selectedDiagUser.email ? selectedDiagUser.email.split('@')[0] : '';
                            const safeEmail = pEmailPrefix.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                            
                            let fs = data.files.filter(f => {
                              const low = f.toLowerCase();
                              return (safeName && low.startsWith(safeName + '_')) || 
                                     (safeId && low.startsWith(safeId + '_')) ||
                                     (safeEmail && low.startsWith(safeEmail + '_')) ||
                                     (safeName && low.startsWith('admin_requested_' + safeName + '_')) ||
                                     (safeName && low.includes(\`_\${safeName}_\`)) ||
                                     (firstName.length > 3 && low.includes(firstName.toLowerCase()));
                            });
                            
                            fs = fs.sort((a, b) => b.localeCompare(a)).slice(0, 3);
                            setUserDiagFiles(fs);
                        }
                      } catch (e) {
                         console.error("Force sync auto-refetch error", e);
                      } finally {
                         setIsFetchingDiags(false);
                      }
                   }
                 }}
                 style={styles.diagSyncBtn}
               >`;

content = content.replace(oldForceSync, newForceSync);

// 3. Device specific Pull Logs (d.id)
content = content.replace(
  `disabled={isPullingLive || !onlineDevices[d.id]}`, 
  `disabled={pullingDeviceIds[d.id] || !onlineDevices[d.id]}`
);
content = content.replace(
  `setIsPullingLive(true);`, 
  `// Set specifically this device to pulling state\n                            setPullingDeviceIds(prev => ({ ...prev, [d.id]: true }));`
);
content = content.replace(
  `setIsPullingLive(false);`, 
  `setPullingDeviceIds(prev => { const next = {...prev}; delete next[d.id]; return next; });`
);
content = content.replace(
  `backgroundColor: (isPullingLive || !onlineDevices[d.id]) ? '#CBD5E1' : '#EF4444'`, 
  `backgroundColor: (pullingDeviceIds[d.id] || !onlineDevices[d.id]) ? '#CBD5E1' : '#EF4444'`
);
content = content.replace(
  `opacity: (isPullingLive || !onlineDevices[d.id]) ? 0.8 : 1`, 
  `opacity: (pullingDeviceIds[d.id] || !onlineDevices[d.id]) ? 0.8 : 1`
);
content = content.replace(
  `{isPullingLive ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={12} color="#FFFFFF" />}`, 
  `{pullingDeviceIds[d.id] ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={12} color="#FFFFFF" />}`
);
content = content.replace(
  `{isPullingLive ? 'PULLING...' : 'PULL LOGS'}`, 
  `{pullingDeviceIds[d.id] ? 'PULLING...' : 'PULL LOGS'}`
);

// 4. Global Pull Live Logs (selectedDiagUser.id)
// Note: Some of the original code still has \`isPullingLive\` for selectedDiagUser.id
content = content.replace(
  `disabled={isPullingLive || !onlineDevices[selectedDiagUser.id]}`, 
  `disabled={pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]}`
);

// If there's another setIsPullingLive(true) for the global button it gets caught here
content = content.replace(
  `setIsPullingLive(true);`, 
  `setPullingDeviceIds(prev => ({...prev, [selectedDiagUser.id]: true}));`
);

// Replace polling halt
content = content.replace(
  `setIsPullingLive(false); // Times out after`, 
  `setPullingDeviceIds(prev => { const next = {...prev}; delete next[selectedDiagUser.id]; return next; }); // Times out after`
);

content = content.replace(
  `setIsPullingLive(false);`, 
  `setPullingDeviceIds(prev => { const next = {...prev}; delete next[selectedDiagUser.id]; return next; });`
);

content = content.replace(
  `backgroundColor: (isPullingLive || !onlineDevices[selectedDiagUser.id]) ? '#94A3B8' : '#EF4444'`, 
  `backgroundColor: (pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]) ? '#94A3B8' : '#EF4444'`
);
content = content.replace(
  `opacity: (isPullingLive || !onlineDevices[selectedDiagUser.id]) ? 0.7 : 1`, 
  `opacity: (pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]) ? 0.7 : 1`
);
content = content.replace(
  `{isPullingLive ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={14} color="#FFFFFF" />}`, 
  `{pullingDeviceIds[selectedDiagUser.id] ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={14} color="#FFFFFF" />}`
);
content = content.replace(
  `{isPullingLive ? 'PULLING...' : \`PULL LIVE LOGS`, 
  `{pullingDeviceIds[selectedDiagUser.id] ? 'PULLING...' : \`PULL LIVE LOGS`
);

fs.writeFileSync(p, content, 'utf8');
console.log("Patched AdminHubScreen.js successfully");
