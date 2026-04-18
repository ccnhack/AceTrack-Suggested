import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, 
  ActivityIndicator, Alert, Platform, Share, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { usePlayers } from '../../context/PlayerContext';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import SafeAvatar from '../SafeAvatar';
import config from '../../config';
import logger from '../../utils/logger';

const AdminDiagnosticsPanel = memo(({ autoSelectUser }) => {
  const { players } = usePlayers();
  const { socketRef, isUsingCloud, isCloudOnline, activeApiUrl, metrics, refreshMetrics } = useSync();
  const { currentUser } = useAuth();
  
  // Real-time metrics polling
  useEffect(() => {
    const timer = setInterval(() => {
      refreshMetrics();
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshMetrics]);

  // Derived Metrics
  const healthScore = useMemo(() => {
    if (!metrics) return 100;
    const total = metrics.pushAttemptCount || 0;
    const failed = metrics.pushFailureCount || 0;
    const anomalies = metrics.anomalyDetectedCount || 0;
    const stale = metrics.staleUpdateCount || 0;
    
    if (total === 0) return 100;
    
    // Weighted penalty logic
    const baseScore = ((total - failed) / total) * 100;
    const penalty = (anomalies * 5) + (Math.floor(stale / 10));
    return Math.max(0, Math.min(100, Math.floor(baseScore - penalty)));
  }, [metrics]);
  
  // States
  const [diagUserSearch, setDiagUserSearch] = useState('');
  const [selectedDiagUser, setSelectedDiagUser] = useState(null);
  const [isFetchingDiags, setIsFetchingDiags] = useState(false);
  const [userDiagFiles, setUserDiagFiles] = useState([]);
  const [selectedDiagFile, setSelectedDiagFile] = useState(null);
  const [diagContent, setDiagContent] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSearchingFilenames, setIsSearchingFilenames] = useState(false);
  const [cloudMatchFiles, setCloudMatchFiles] = useState([]);
  const [onlineDevices, setOnlineDevices] = useState({});
  const [pullingDeviceIds, setPullingDeviceIds] = useState({});
  const pongBufferRef = useRef({});

  // 🛠️ Pong Handling Logic
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const handlePong = (data) => {
      // 🛡️ [REPLICATION] Use numerical timestamp from current time to ensure snappy expiry
      const statusObj = { 
        online: true, 
        version: data.appVersion, 
        timestamp: Date.now(), 
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        targetUserId: data.targetUserId
      };
      
      // Coalesce by Device ID and User ID
      if (data.deviceId) pongBufferRef.current[data.deviceId] = statusObj;
      if (data.targetUserId) pongBufferRef.current[data.targetUserId] = statusObj;
    };

    socket.on('device_pong_relay', handlePong);
    
    // Flush buffer to state every 500ms
    const flushTimer = setInterval(() => {
      if (Object.keys(pongBufferRef.current).length > 0) {
        setOnlineDevices(prev => ({ ...prev, ...pongBufferRef.current }));
        pongBufferRef.current = {};
      }
    }, 500);

    return () => {
      clearInterval(flushTimer);
      socket.off('device_pong_relay', handlePong);
    };
  }, [socketRef?.current]);

  // Deep-Link Auto-Selection
  useEffect(() => {
    if (autoSelectUser && players && players.length > 0) {
      const player = players.find(p => p.id === autoSelectUser);
      if (player) {
         setDiagUserSearch(autoSelectUser);
         handleSelectDiagPlayer(player);
      }
    }
  }, [autoSelectUser, players]);

  // 🛡️ Proactive Ping when subtab is ready
  useEffect(() => {
    if (socketRef?.current?.connected) {
      // 🛡️ [FIX v2.6.121] Ping ALL users, not just those with pre-existing devices.
      // The enhanced SyncManager may not have stamped devices yet.
      players?.forEach(p => {
        socketRef.current.emit('admin_ping_device', { targetUserId: p.id });
      });
    }
  }, [socketRef?.current?.connected, players?.length]);

  const handleDiagSearchChange = (txt) => {
    setDiagUserSearch(txt);
    setCloudMatchFiles([]);
    if (selectedDiagUser) {
      setSelectedDiagUser(null);
      setUserDiagFiles([]);
      setDiagContent(null);
    }
  };

  const handleCloudFilenameSearch = async () => {
    if (!diagUserSearch.trim()) return;
    setIsSearchingFilenames(true);
    setCloudMatchFiles([]);
    
    try {
      const res = await fetch(`${activeApiUrl}/api/diagnostics`, { 
        headers: { 'x-ace-api-key': config.ACE_API_KEY } 
      });
      if (res.ok) {
        const data = await res.json();
        const searchLow = diagUserSearch.toLowerCase().trim();
        const matches = (data?.files || []).filter(f => f.toLowerCase().includes(searchLow));
        setCloudMatchFiles(matches.slice(0, 10));
        if (matches.length === 0) {
          Alert.alert("No Cloud Logs", `No files matching "${diagUserSearch}" were found.`);
        }
      }
    } catch (e) {
      Alert.alert("Error", "Cloud search failed.");
    } finally {
      setIsSearchingFilenames(false);
    }
  };

  const handleSelectDiagPlayer = async (p) => {
    if (!p) return;
    setSelectedDiagUser(p);
    setUserDiagFiles([]);
    setSelectedDiagFile(null);
    setDiagContent(null);
    setIsFetchingDiags(true);
    
    // 🛡️ [REPLICATION] Clear stale online status for this user before pinging
    setOnlineDevices(prev => {
      const next = { ...prev };
      delete next[p.id];
      if (p.devices && Array.isArray(p.devices)) {
        p.devices.forEach(d => { if (d && d.id) delete next[d.id]; });
      }
      return next;
    });

    // Trigger Ping
    if (socketRef?.current?.connected) {
      socketRef.current.emit('admin_ping_device', { targetUserId: p.id });
      // Multiple pings for reliability
      setTimeout(() => socketRef.current?.emit('admin_ping_device', { targetUserId: p.id }), 1000);
    }
    
    try {
      // Add cache-buster and ensure strict User ID passing
      const res = await fetch(`${activeApiUrl}/api/diagnostics?userId=${p.id}&_t=${Date.now()}`, { 
        headers: { 'x-ace-api-key': config.ACE_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        const pNameRaw = (p.name || '').toLowerCase();
        const firstName = pNameRaw.split(' ')[0];
        const safeName = pNameRaw.replace(/[^a-z0-9]/gi, '_');
        
        const safeId = p.id.toLowerCase();
        
        const filterFiles = (files) => {
          return (files || []).filter(f => {
            const lf = f.toLowerCase();
            // Strict match: starts with ID_, ID-, or contains requested_ID_
            return lf.startsWith(safeId + '_') || 
                   lf.startsWith(safeId + '-') || 
                   lf.includes('_requested_' + safeId + '_');
          }).sort((a, b) => {
            const getTs = (str) => {
              const m = str.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})|(\d{8}_\d{6})/);
              return m ? m[0].replace(/[-_]/g, '') : str;
            };
            return getTs(b).localeCompare(getTs(a));
          });
        };

        const fs = filterFiles(data.files);
        setUserDiagFiles(fs);
      }
    } catch (e) {
      console.warn("Failed to fetch diagnostics:", e);
    } finally {
      setIsFetchingDiags(false);
    }
  };

  const handlePullLogs = async (deviceId) => {
    const targetId = deviceId || selectedDiagUser?.id;
    if (!targetId) return;

    if (!socketRef?.current?.connected) {
      Alert.alert("Error", "No Cloud Connection");
      return;
    }
    
    // 1. WebSocket Ping
    socketRef.current.emit('admin_pull_diagnostics', { 
      targetUserId: selectedDiagUser.id,
      targetDeviceId: deviceId,
      adminId: currentUser?.id 
    });
    
    // 2. Setup Polling for Persistence
    const initialFiles = new Set(userDiagFiles);
    setPullingDeviceIds(prev => ({ ...prev, [targetId]: true }));
    let attempts = 0;
    
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 5) {
        clearInterval(interval);
        setPullingDeviceIds(prev => { const next = {...prev}; delete next[targetId]; return next; });
        return;
      }
      
      try {
        const safeId = selectedDiagUser.id.toLowerCase();
        const res = await fetch(`${activeApiUrl}/api/diagnostics?userId=${selectedDiagUser.id}&_t=${Date.now()}`, { 
          headers: { 'x-ace-api-key': config.ACE_API_KEY } 
        });
        
        if (res.ok) {
          const data = await res.json();
          const filteredFs = (data.files || []).filter(f => {
            const lf = f.toLowerCase();
            return lf.startsWith(safeId + '_') || 
                   lf.startsWith(safeId + '-') || 
                   lf.includes('_requested_' + safeId + '_');
          }).sort((a, b) => b.localeCompare(a));
          
          // 🛡️ [Diff Detection] Detect brand new filenames explicitly
          const hasNewFile = filteredFs.some(f => !initialFiles.has(f));
          if (hasNewFile) {
            clearInterval(interval);
            setUserDiagFiles(filteredFs);
            setPullingDeviceIds(prev => { 
                const next = { ...prev }; 
                delete next[targetId]; 
                return next; 
            });
          }
        }
      } catch (e) {
        console.error('[AdminDiagnostics] Polling error:', e);
      }
    }, 3000);
  };

  const handleViewLog = async (file) => {
    setSelectedDiagFile(file);
    setDiagContent(null);
    setIsDownloading(true);
    try {
      const res = await fetch(`${activeApiUrl}/api/diagnostics/${file}`, { 
        headers: { 'x-ace-api-key': config.ACE_API_KEY } 
      });
      if (res.ok) {
        const text = await res.text();
        setDiagContent(text);
      }
    } catch (e) {
      Alert.alert("Error", "Failed to fetch log content.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadDiagnostic = async () => {
    if (!diagContent || isDownloading) return;
    setIsDownloading(true);
    try {
      const fileName = `Log_${Date.now()}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([diagContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      await FileSystem.writeAsStringAsync(fileUri, diagContent, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        await Share.share({ title: fileName, message: diagContent });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to prepare report.");
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredPlayers = (players || []).filter(p => {
    const s = diagUserSearch.toLowerCase().trim();
    if (!s) return true;
    return p.name?.toLowerCase().includes(s) || p.id?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s);
  });

  return (
    <View style={styles.container}>
      <View style={styles.diagHeaderRow}>
        <Text style={styles.sectionTitle}>System Diagnostics</Text>
        <TouchableOpacity 
          onPress={() => handleSelectDiagPlayer(selectedDiagUser)}
          style={styles.diagSyncBtn}
          disabled={!selectedDiagUser}
        >
          <Ionicons name="refresh-circle" size={16} color="#FFFFFF" />
          <Text style={styles.diagSyncBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* 🚀 System Health Overview (New Dashboard) */}
      <View style={styles.healthDashboard}>
        <View style={styles.healthRow}>
          <View style={[styles.healthCard, { borderLeftColor: healthScore > 90 ? '#10B981' : (healthScore > 70 ? '#F59E0B' : '#EF4444') }]}>
             <Text style={styles.healthLabel}>HEALTH SCORE</Text>
             <Text style={[styles.healthValue, { color: healthScore > 90 ? '#10B981' : (healthScore > 70 ? '#D97706' : '#EF4444') }]}>{healthScore}%</Text>
             <Ionicons name="heart-half" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </View>
          <View style={[styles.healthCard, { borderLeftColor: '#6366F1' }]}>
             <Text style={styles.healthLabel}>PUSH RELIABILITY</Text>
             <Text style={styles.healthValue}>{((metrics?.pushAttemptCount - metrics?.pushFailureCount) / (metrics?.pushAttemptCount || 1) * 100).toFixed(0)}%</Text>
             <Text style={styles.healthSubValue}>{metrics?.pushAttemptCount || 0} attempts</Text>
             <Ionicons name="cloud-upload-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </View>
        </View>
        <View style={styles.healthRow}>
          <View style={[styles.healthCard, { borderLeftColor: metrics?.queueLength > 20 ? '#EF4444' : '#10B981' }]}>
             <Text style={styles.healthLabel}>BACKPRESSURE</Text>
             <Text style={styles.healthValue}>{metrics?.queueLength || 0}</Text>
             <Text style={styles.healthSubValue}>{metrics?.activeThrottles || 0} active throttles</Text>
             <Ionicons name="git-branch-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </View>
          <View style={[styles.healthCard, { borderLeftColor: (metrics?.anomalyDetectedCount || 0) > 0 ? '#EF4444' : '#CBD5E1' }]}>
             <Text style={styles.healthLabel}>ANOMALIES</Text>
             <Text style={[styles.healthValue, { color: (metrics?.anomalyDetectedCount || 0) > 0 ? '#EF4444' : '#1E293B' }]}>{metrics?.anomalyDetectedCount || 0}</Text>
             <Text style={styles.healthSubValue}>{metrics?.staleUpdateCount || 0} stale blocked</Text>
             <Ionicons name="warning-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </View>
        </View>
      </View>

      <View style={styles.diagSearchBox}>
        <Ionicons name="people-outline" size={16} color="#64748B" />
        <TextInput 
          placeholder="Search user..."
          value={diagUserSearch}
          onChangeText={handleDiagSearchChange}
          style={styles.diagSearchInput}
        />
      </View>

      <View style={styles.userListScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredPlayers.map(p => (
            <TouchableOpacity 
              key={p.id} 
              onPress={() => handleSelectDiagPlayer(p)}
              style={[styles.miniUserCard, selectedDiagUser?.id === p.id && styles.miniUserCardActive]}
            >
              <SafeAvatar 
                uri={p.avatar} 
                name={p.name} 
                role={p.role}
                size={44}
                borderRadius={14}
                style={styles.miniAvatar} 
              />
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={[styles.miniUserName, selectedDiagUser?.id === p.id && styles.miniUserNameActive]} numberOfLines={1}>
                  {(p.name || 'User').split(' ')[0]}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <View style={[styles.statusDot, { backgroundColor: onlineDevices[p.id] ? '#10B981' : '#CBD5E1' }]} />
                  <Text style={[styles.miniUserId, { color: selectedDiagUser?.id === p.id ? '#FFFFFF' : '#94A3B8' }]} numberOfLines={1}>
                    {p.id}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          {filteredPlayers.length === 0 && (
            <TouchableOpacity onPress={handleCloudFilenameSearch} style={styles.cloudSearchHint}>
              <Ionicons name="cloud-search-outline" size={20} color="#6366F1" />
              <Text style={styles.cloudSearchText}>Search Cloud for "{diagUserSearch}"</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {cloudMatchFiles.length > 0 && !selectedDiagUser && (
        <View style={styles.cloudResults}>
          <Text style={styles.cloudResultsTitle}>Matching Cloud Logs:</Text>
          {cloudMatchFiles.map(f => (
            <TouchableOpacity key={f} onPress={() => handleViewLog(f)} style={styles.cloudFileItem}>
              <Ionicons name="document-text-outline" size={14} color="#6366F1" />
              <Text style={styles.cloudFileName}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {selectedDiagUser && (() => {
        // Compute Live Sessions (Ponging now but no historical logs in .devices)
        const liveSessions = Object.values(onlineDevices)
          .filter(status => 
            status.targetUserId === selectedDiagUser.id && 
            !selectedDiagUser.devices?.some(d => d.id === status.deviceId)
          )
          // Deduplicate by deviceId
          .filter((session, index, self) => 
            index === self.findIndex((s) => s.deviceId === session.deviceId)
          );

        // Deduplicate Registered Devices
        const registeredDevices = (selectedDiagUser.devices || [])
          .filter((dev, index, self) => 
            index === self.findIndex((d) => d.id === dev.id)
          );

        return (
          <View style={styles.diagFileSection}>
            {liveSessions.length > 0 && (
              <View style={styles.liveSessionsContainer}>
                <Text style={[styles.diagSectionLabel, { color: '#6366F1' }]}>Live Active Sessions (New)</Text>
                {liveSessions.map(session => (
                  <View key={session.deviceId} style={[styles.deviceItem, styles.liveDeviceItem]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>{session.deviceName || 'New Simulator/Device'}</Text>
                      <View style={styles.deviceMeta}>
                        <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                        <Text style={[styles.statusText, { color: '#10B981' }]}>LIVE NOW</Text>
                        <Text style={styles.deviceAppVersion}>v{session.version}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                       onPress={() => handlePullLogs(session.deviceId)}
                       style={styles.pullBtn}
                    >
                      <Ionicons name="flash-outline" size={14} color="#FFF" />
                      <Text style={styles.pullBtnText}>PULL LIVE</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.divider} />
              </View>
            )}

            <Text style={styles.diagSectionLabel}>Registered History Devices</Text>
            {registeredDevices.length > 0 ? (
              registeredDevices.map(d => (
              <View key={d.id} style={styles.deviceItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                    <View style={styles.deviceMeta}>
                      <View style={[
                        styles.statusDot, 
                        { backgroundColor: onlineDevices[d.id] ? '#10B981' : '#EF4444' }
                      ]} />
                      <Text style={[
                        styles.statusText, 
                        { color: onlineDevices[d.id] ? '#10B981' : '#EF4444' }
                      ]}>
                        {onlineDevices[d.id] ? 'ONLINE' : 'OFFLINE'}
                      </Text>
                      <Text style={styles.deviceAppVersion}>
                        v{(onlineDevices[d.id]?.version || d.appVersion || '???')}
                      </Text>
                    </View>
                </View>
                <TouchableOpacity 
                   disabled={pullingDeviceIds[d.id] || !onlineDevices[d.id]}
                   onPress={() => handlePullLogs(d.id)}
                   style={[styles.pullBtn, (!onlineDevices[d.id] || pullingDeviceIds[d.id]) && styles.pullBtnDisabled]}
                >
                  {pullingDeviceIds[d.id] ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="cloud-download-outline" size={14} color="#FFF" />}
                  <Text style={styles.pullBtnText}>{pullingDeviceIds[d.id] ? 'PULLING...' : 'PULL'}</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.noDevicesBox}>
              <Text style={styles.noDevicesText}>No registered devices found.</Text>
              <TouchableOpacity 
                disabled={pullingDeviceIds[selectedDiagUser.id]}
                onPress={() => handlePullLogs()}
                style={styles.livePullBtn}
              >
                <Ionicons name="pulse" size={18} color="#FFF" />
                <Text style={styles.livePullBtnText}>Global Remote Pull</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.diagSectionLabel, { marginTop: 24 }]}>Cloud Storage Logs ({userDiagFiles.length})</Text>
          <View style={styles.fileList}>
            {isFetchingDiags ? (
              <ActivityIndicator style={{ margin: 20 }} color="#6366F1" />
            ) : userDiagFiles.length > 0 ? (
              userDiagFiles.map(f => (
                <TouchableOpacity key={f} onPress={() => handleViewLog(f)} style={[styles.fileItem, selectedDiagFile === f && styles.fileItemActive]}>
                  <Ionicons name="document-outline" size={16} color={selectedDiagFile === f ? "#FFF" : "#64748B"} />
                  <Text style={[styles.fileName, selectedDiagFile === f && styles.fileNameActive]} numberOfLines={1}>{f}</Text>
                  <Ionicons name="chevron-forward" size={12} color={selectedDiagFile === f ? "#FFF" : "#CBD5E1"} />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyFilesText}>No logs found on cluster.</Text>
            )}
          </View>
        </View>
      );
    })()}

      {diagContent && (
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>Log Content Viewer</Text>
            <TouchableOpacity onPress={handleDownloadDiagnostic} style={styles.downloadBtn}>
              <Ionicons name="share-outline" size={16} color="#6366F1" />
              <Text style={styles.downloadBtnText}>Export</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.viewerContent}>
            <Text style={styles.viewerText}>{diagContent}</Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  diagHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  healthDashboard: { marginBottom: 24, gap: 10 },
  healthRow: { flexDirection: 'row', gap: 10 },
  healthCard: { 
    flex: 1, 
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16, 
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 }
    }),
    position: 'relative',
    overflow: 'hidden'
  },
  healthLabel: { fontSize: 8, fontWeight: '900', color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  healthValue: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  healthSubValue: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  cardIcon: { position: 'absolute', right: -6, bottom: -6, opacity: 0.15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  diagSyncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  diagSyncBtnText: { fontSize: 10, fontWeight: 'bold', color: '#FFF', marginLeft: 4 },
  diagSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  diagSearchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B' },
  userListScroll: { marginBottom: 20 },
  miniUserCard: { width: 80, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniUserCardActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  miniAvatar: { backgroundColor: '#F8FAFC' },
  miniUserName: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  miniUserNameActive: { color: '#FFF' },
  miniUserId: { fontSize: 8, color: '#94A3B8' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cloudSearchHint: { width: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE', padding: 10 },
  cloudSearchText: { fontSize: 10, fontWeight: 'bold', color: '#6366F1', textAlign: 'center', marginTop: 4 },
  cloudResults: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 20 },
  cloudResultsTitle: { fontSize: 12, fontWeight: 'bold', color: '#1E293B', marginBottom: 8 },
  cloudFileItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  cloudFileName: { fontSize: 11, color: '#6366F1', marginLeft: 8 },
  liveSessionsContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  liveDeviceItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#6366F1',
    elevation: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  diagFileSection: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  diagSectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: 12 },
  deviceItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  deviceName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  deviceMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  statusText: { fontSize: 9, fontWeight: 'bold' },
  deviceAppVersion: { fontSize: 9, color: '#94A3B8' },
  pullBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
  pullBtnDisabled: { backgroundColor: '#CBD5E1' },
  pullBtnText: { fontSize: 10, fontWeight: 'bold', color: '#FFF' },
  noDevicesBox: { alignItems: 'center', padding: 20, backgroundColor: '#F8FAFC', borderRadius: 16 },
  noDevicesText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 12 },
  livePullBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  livePullBtnText: { fontSize: 12, fontWeight: 'bold', color: '#6366F1' },
  fileList: { gap: 4 },
  fileItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F8FAFC' },
  fileItemActive: { backgroundColor: '#64748B' },
  fileName: { flex: 1, fontSize: 11, color: '#475569', marginLeft: 8 },
  fileNameActive: { color: '#FFF' },
  emptyFilesText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 20 },
  viewerContainer: { marginTop: 20, backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  viewerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  viewerTitle: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  downloadBtnText: { fontSize: 12, fontWeight: 'bold', color: '#6366F1' },
  viewerContent: { maxHeight: 400, backgroundColor: '#1E293B', borderRadius: 12, padding: 12 },
  viewerText: { color: '#ADB5BD', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }
});

export default AdminDiagnosticsPanel;
