import { styles } from './styles/DiagnosticsStyles';
import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {  
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, 
  ActivityIndicator, Alert, Platform, Share, Dimensions, Modal 
 } from 'react-native';
import { apiFetch } from '../../utils/apiFetch';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { usePlayersStore } from '../../stores';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import SafeAvatar from '../SafeAvatar';
import config from '../../config';
import storage from '../../utils/storage';
import logger from '../../utils/logger';

const AdminDiagnosticsPanel = memo(({ autoSelectUser, onConsumeAutoSelect }) => {
  const { players } = usePlayersStore();
  const { socketRef, isUsingCloud, isCloudOnline, onToggleCloud, activeApiUrl, metrics, refreshMetrics, loadData } = useSync();
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
  const [diagDetailType, setDiagDetailType] = useState(null); // 'health' | 'push' | 'backpressure' | 'anomalies'
  const [isAnomaliesExpanded, setIsAnomaliesExpanded] = useState(false);
  const pongBufferRef = useRef({});

  // 🛡️ [URL_PERSISTENCE] (v2.6.652)
  const [selectedDiagUserIdFromUrl, setSelectedDiagUserIdFromUrl] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('diagUserId');
    }
    return null;
  });
  
  const [selectedDiagFileFromUrl, setSelectedDiagFileFromUrl] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('diagFile');
    }
    return null;
  });

  // Sync selectedDiagUser and selectedDiagFile TO the URL
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      let changed = false;
      
      if (selectedDiagUser) {
        if (currentUrl.searchParams.get('diagUserId') !== selectedDiagUser.id) {
          currentUrl.searchParams.set('diagUserId', selectedDiagUser.id);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('diagUserId')) {
        currentUrl.searchParams.delete('diagUserId');
        changed = true;
      }

      if (selectedDiagFile) {
        if (currentUrl.searchParams.get('diagFile') !== selectedDiagFile) {
          currentUrl.searchParams.set('diagFile', selectedDiagFile);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('diagFile')) {
        currentUrl.searchParams.delete('diagFile');
        changed = true;
      }

      if (changed) {
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [selectedDiagUser, selectedDiagFile]);

  // 🛡️ Pong Handling Logic
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
        targetUserId: data.targetUserId,
        ipAddress: data.ipAddress,
        location: data.location
      };
      
      // Coalesce by Device ID only to support multiple devices per user
      if (data.deviceId) pongBufferRef.current[data.deviceId] = statusObj;
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
  }, [socketRef?.current, isCloudOnline]);

  // Real-time Cloud Logs refresh when a user manually sends diagnostics
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;
    const handleDiagUpload = (data) => {
      if (selectedDiagUser && data.targetUserId === selectedDiagUser.id.toLowerCase()) {
         handleSelectDiagPlayer(selectedDiagUser);
      }
    };
    socket.on('diagnostics_uploaded', handleDiagUpload);
    return () => socket.off('diagnostics_uploaded', handleDiagUpload);
  }, [socketRef?.current, selectedDiagUser]);

  // Deep-Link Auto-Selection
  useEffect(() => {
    if (autoSelectUser && players && players.length > 0) {
      const player = players.find(p => p.id === autoSelectUser);
      if (player) {
         setDiagUserSearch(autoSelectUser);
         handleSelectDiagPlayer(player);
         onConsumeAutoSelect?.(); // 🛡️ Consume immediately to prevent sticky refresh
      }
    }
  }, [autoSelectUser, players, onConsumeAutoSelect]);

  // URL Auto-Selection
  useEffect(() => {
    if (selectedDiagUserIdFromUrl && players && players.length > 0) {
      const player = players.find(p => p.id === selectedDiagUserIdFromUrl);
      if (player && !selectedDiagUser) {
        handleSelectDiagPlayer(player);
        setSelectedDiagUserIdFromUrl(null); // Consume
      }
    }
  }, [selectedDiagUserIdFromUrl, players, selectedDiagUser]);

  useEffect(() => {
    if (selectedDiagFileFromUrl && userDiagFiles && userDiagFiles.includes(selectedDiagFileFromUrl)) {
      handleViewLog(selectedDiagFileFromUrl);
      setSelectedDiagFileFromUrl(null); // Consume
    }
  }, [selectedDiagFileFromUrl, userDiagFiles]);

  // 🛡️ Proactive Ping when subtab is ready
  useEffect(() => {
    if (socketRef?.current?.connected) {
      // 🛡️ [FIX v2.6.121] Ping ALL users, not just those with pre-existing devices.
      // The enhanced SyncManager may not have stamped devices yet.
      players?.forEach(p => {
        socketRef.current.emit('admin_ping_device', { targetUserId: p.id });
      });
    }
  }, [socketRef?.current?.connected, players?.length, isCloudOnline]);

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
    if (!diagUserSearch?.trim()) return;
    setIsSearchingFilenames(true);
    setCloudMatchFiles([]);
    
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-ace-api-key': config.ACE_API_KEY,
        'x-user-id': 'admin'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${activeApiUrl}/api/diagnostics`, { 
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const searchLow = diagUserSearch?.toLowerCase().trim() || '';
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
    
    // 🛡️ [REPLICATION] Only clear STALE entries (>30s old) to avoid race conditions
    // where the UI renders 'OFFLINE' before the pong arrives
    setOnlineDevices(prev => {
      const next = { ...prev };
      const staleThreshold = Date.now() - 30000;
      Object.keys(next).forEach(key => {
        const entry = next[key];
        if (entry?.targetUserId === p.id && entry?.timestamp && entry.timestamp < staleThreshold) {
          delete next[key];
        }
      });
      return next;
    });

    // Trigger Ping (3 attempts for reliability, especially for web clients)
    if (socketRef?.current?.connected) {
      socketRef.current.emit('admin_ping_device', { targetUserId: p.id });
      setTimeout(() => socketRef.current?.emit('admin_ping_device', { targetUserId: p.id }), 1000);
      setTimeout(() => socketRef.current?.emit('admin_ping_device', { targetUserId: p.id }), 2000);
    }
    
    try {
      // Add cache-buster and ensure strict User ID passing
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-ace-api-key': config.ACE_API_KEY,
        'x-user-id': 'admin'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${activeApiUrl}/api/diagnostics?userId=${p.id}&_t=${Date.now()}`, { 
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const safeId = p.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        const filterFiles = (files) => {
          return (files || []).filter(f => {
            const lf = f.toLowerCase();
            if (lf.startsWith('admin_requested_')) {
              return lf.startsWith(`admin_requested_${safeId}_`);
            }
            return lf.startsWith(safeId + '_') || lf.startsWith(safeId + '-');
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

      // 🛡️ [REST_SESSION_FALLBACK] (v2.6.270): For support users, also check via REST API
      // The socket ping/pong is unreliable when admin is on mobile and support is on web
      const isSupportUserRole = ['support', 'admin', 'system_admin'].includes(p.role);
      if (isSupportUserRole) {
        try {
          const headers = { 
            'x-ace-api-key': config.PUBLIC_APP_ID
          };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const sessionRes = await apiFetch(`${activeApiUrl}/api/v1/support/session-status/${p.id}`, {
            headers,
            credentials: 'include'
          });
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            if (sessionData.isOnline && sessionData.sessions?.length > 0) {
              // Inject REST-discovered sessions into onlineDevices state
              const restSessions = {};
              sessionData.sessions.forEach((s, idx) => {
                const key = `rest_${p.id}_${s.socketId || idx}`;
                restSessions[key] = {
                  online: true,
                  version: config.APP_VERSION,
                  timestamp: Date.now(),
                  deviceId: `browser_${s.socketId || idx}`,
                  deviceName: s.browserName || s.deviceName || 'Browser',
                  userAgent: s.userAgent || '',
                  ipAddress: s.ipAddress || '',
                  targetUserId: p.id
                };
              });
              setOnlineDevices(prev => ({ ...prev, ...restSessions }));
              console.log(`[DiagPanel] REST fallback found ${sessionData.sessions.length} active session(s) for ${p.id}`);
            }
          }
        } catch (restErr) {
          console.warn('[DiagPanel] REST session check failed:', restErr.message);
        }
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
    
    // 🛡️ [OFFLINE LOGIC FIX]: Abort if device is not currently online
    if (deviceId && !onlineDevices[deviceId]) {
      Alert.alert(
        "Device Offline",
        "This device is currently offline. Diagnostic logs are stored locally on the physical device and cannot be pulled until it reconnects."
      );
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
        const safeId = selectedDiagUser.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const token = await storage.getItem('userToken');
        const headers = { 
          'x-ace-api-key': config.ACE_API_KEY,
          'x-user-id': 'admin'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await apiFetch(`${activeApiUrl}/api/diagnostics?userId=${selectedDiagUser.id}&_t=${Date.now()}`, { 
          headers,
          credentials: 'include'
        });
        
        if (res.ok) {
          const data = await res.json();
          const filteredFs = (data.files || []).filter(f => {
            const lf = f.toLowerCase();
            if (lf.startsWith('admin_requested_')) {
              return lf.startsWith(`admin_requested_${safeId}_`);
            }
            return lf.startsWith(safeId + '_') || lf.startsWith(safeId + '-');
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
      const token = await storage.getItem('userToken');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${activeApiUrl}/api/diagnostics/${file}`, { 
        headers,
        credentials: 'include'
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
    const s = diagUserSearch?.toLowerCase().trim() || '';
    if (!s) return true;
    return p.name?.toLowerCase().includes(s) || p.id?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s);
  });

  const renderDetailModal = () => (
    <Modal visible={!!diagDetailType} transparent animationType="fade" onRequestClose={() => setDiagDetailType(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.glassModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {diagDetailType === 'health' ? 'System Health Insights' : 
               diagDetailType === 'push' ? 'Cloud Push Analysis' : 
               diagDetailType === 'backpressure' ? 'Resource Backpressure' : 'Anomaly Trace'}
            </Text>
            <TouchableOpacity onPress={() => setDiagDetailType(null)} style={styles.modalCloseBtn}>
              <Ionicons name="close-circle" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {diagDetailType === 'health' && (
              <View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Current Health Score</Text>
                  <Text style={[styles.scoreValue, { color: healthScore > 90 ? '#10B981' : (healthScore > 70 ? '#D97706' : '#EF4444') }]}>{healthScore}%</Text>
                </View>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>Calculation Breakdown</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Base Reliability</Text>
                    <Text style={styles.breakdownValue}>{((metrics?.pushAttemptCount - metrics?.pushFailureCount) / (metrics?.pushAttemptCount || 1) * 100).toFixed(1)}%</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: '#EF4444' }]}>Anomaly Penalties</Text>
                    <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>-{(metrics?.anomalyDetectedCount || 0) * 5}%</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: '#D97706' }]}>Stale Penalties</Text>
                    <Text style={[styles.breakdownValue, { color: '#D97706' }]}>-{(Math.floor((metrics?.staleUpdateCount || 0) / 10))}%</Text>
                  </View>
                </View>
                <Text style={styles.modalHelperText}>Score reflects system stability over the current session. Higher scores indicate reliable cloud sync and zero security alarms.</Text>
              </View>
            )}

            {diagDetailType === 'push' && (
              <View>
                <View style={[styles.detailCard, { borderLeftColor: '#6366F1' }]}>
                   <Text style={styles.detailCardTitle}>Network Performance</Text>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Success Rate</Text>
                      <Text style={styles.breakdownValue}>{((metrics?.pushAttemptCount - metrics?.pushFailureCount) / (metrics?.pushAttemptCount || 1) * 100).toFixed(1)}%</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Total Attempts</Text>
                      <Text style={styles.breakdownValue}>{metrics?.pushAttemptCount || 0}</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Last Success</Text>
                      <Text style={[styles.breakdownValue, { fontSize: 9 }]}>{metrics?.lastSyncSuccess ? new Date(metrics.lastSyncSuccess).toLocaleTimeString() : 'Never'}</Text>
                   </View>
                </View>

                {/* 🛡️ Actionable Incident Log */}
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>Recent Reliability Incidents</Text>
                  {(metrics?.incidentHistory || []).filter(i => i.type === 'reliability').slice(0, 5).map((incident, idx) => (
                    <View key={idx} style={styles.incidentItem}>
                      <View style={styles.incidentDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.incidentTime}>{new Date(incident.timestamp).toLocaleTimeString()}</Text>
                        <Text style={styles.incidentMsg}>{incident.message}</Text>
                      </View>
                    </View>
                  ))}
                  {!(metrics?.incidentHistory || []).some(i => i.type === 'reliability') && (
                    <Text style={styles.emptyIncidentsText}>No reliability incidents recorded.</Text>
                  )}
                </View>

                <View style={styles.detailCard}>
                   <Text style={styles.detailCardTitle}>HTTP Error Breakdown</Text>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Rate Limits (429)</Text>
                      <Text style={styles.breakdownValue}>{metrics?.rateLimitCount || 0}</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Version Conflicts (409)</Text>
                      <Text style={styles.breakdownValue}>{metrics?.conflictCount || 0}</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Other Failures</Text>
                      <Text style={styles.breakdownValue}>{(metrics?.pushFailureCount || 0) - (metrics?.rateLimitCount || 0) - (metrics?.conflictCount || 0)}</Text>
                   </View>
                </View>
              </View>
            )}

            {diagDetailType === 'backpressure' && (
              <View>
                <View style={styles.detailCard}>
                   <Text style={styles.detailCardTitle}>Persistence Queue</Text>
                   <View style={styles.backpressureVisual}>
                      <View style={[styles.backpressureBar, { width: `${Math.min(100, (metrics?.queueLength || 0) * 5)}%` }]} />
                   </View>
                   <Text style={[styles.healthValue, { textAlign: 'center', marginTop: 8 }]}>{metrics?.queueLength || 0} Pending Items</Text>
                </View>

                {/* 🛡️ Actionable Incident Log */}
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>Throttled Entities ({metrics?.activeThrottles || 0})</Text>
                  {(metrics?.incidentHistory || []).filter(i => i.type === 'backpressure').slice(0, 5).map((incident, idx) => (
                    <View key={idx} style={styles.incidentItem}>
                      <View style={[styles.incidentDot, { backgroundColor: '#F59E0B' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.incidentTime}>{new Date(incident.timestamp).toLocaleTimeString()}</Text>
                        <Text style={styles.incidentMsg}>{incident.message}</Text>
                      </View>
                    </View>
                  ))}
                  {!(metrics?.incidentHistory || []).some(i => i.type === 'backpressure') && (
                    <Text style={styles.emptyIncidentsText}>No active backpressure throttles.</Text>
                  )}
                </View>
              </View>
            )}

            {diagDetailType === 'anomalies' && (
              <View>
                <View style={[styles.detailCard, { borderLeftColor: '#EF4444' }]}>
                   <Text style={styles.detailCardTitle}>Security Triggers</Text>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Identity Hijack Blocks</Text>
                      <Text style={styles.breakdownValue}>{metrics?.anomalyDetectedCount || 0}</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Data Tamper Detected</Text>
                      <Text style={styles.breakdownValue}>{metrics?.tamperDetectedCount || 0}</Text>
                   </View>
                   <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Stale State Rejections</Text>
                      <Text style={styles.breakdownValue}>{metrics?.staleUpdateCount || 0}</Text>
                   </View>
                </View>

                {/* 🛡️ Actionable Incident Log */}
                <View style={[styles.detailCard, { borderLeftColor: '#EF4444' }]}>
                  <Text style={styles.detailCardTitle}>Security Incident Log</Text>
                  {(metrics?.incidentHistory || []).filter(i => i.type === 'anomalies').slice(0, 5).map((incident, idx) => (
                    <View key={idx} style={styles.incidentItem}>
                      <View style={[styles.incidentDot, { backgroundColor: '#EF4444' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.incidentTime}>{new Date(incident.timestamp).toLocaleTimeString()}</Text>
                        <Text style={styles.incidentMsg}>{incident.message}</Text>
                      </View>
                    </View>
                  ))}
                  {!(metrics?.incidentHistory || []).some(i => i.type === 'anomalies') && (
                    <Text style={styles.emptyIncidentsText}>No security anomalies detected.</Text>
                  )}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={() => setDiagDetailType(null)} style={styles.modalFooterBtn}>
             <Text style={styles.modalFooterBtnText}>DISMISS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {renderDetailModal()}
      <View style={styles.diagHeaderRow}>
        <Text style={styles.sectionTitle}>System Diagnostics</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* ☁️ Cloud Toggle (v2.6.467) */}
          <TouchableOpacity 
            onPress={onToggleCloud}
            style={[styles.diagSyncBtn, isUsingCloud ? styles.modeCloud : styles.modeLocal]}
          >
            <Ionicons name={isUsingCloud ? "cloud" : "laptop"} size={14} color="#FFFFFF" />
            <Text style={styles.diagSyncBtnText}>{isUsingCloud ? "Cloud" : "Local"}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => {
              loadData?.(true);
              if (selectedDiagUser) {
                handleSelectDiagPlayer(selectedDiagUser);
              }
            }}
            style={styles.diagSyncBtn}
          >
            <Ionicons name="refresh-circle" size={16} color="#FFFFFF" />
            <Text style={styles.diagSyncBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🚀 System Health Overview (New Dashboard) */}
      <View style={styles.healthDashboard}>
        <View style={styles.healthRow}>
          <TouchableOpacity 
            onPress={() => setDiagDetailType('health')}
            style={[styles.healthCard, { borderLeftColor: healthScore > 90 ? '#10B981' : (healthScore > 70 ? '#F59E0B' : '#EF4444') }]}
          >
             <Text style={styles.healthLabel}>HEALTH SCORE</Text>
             <Text style={[styles.healthValue, { color: healthScore > 90 ? '#10B981' : (healthScore > 70 ? '#D97706' : '#EF4444') }]}>{healthScore}%</Text>
             <Ionicons name="heart-half" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setDiagDetailType('push')}
            style={[styles.healthCard, { borderLeftColor: '#6366F1' }]}
          >
             <Text style={styles.healthLabel}>PUSH RELIABILITY</Text>
             <Text style={styles.healthValue}>{((metrics?.pushAttemptCount - metrics?.pushFailureCount) / (metrics?.pushAttemptCount || 1) * 100).toFixed(0)}%</Text>
             <Text style={styles.healthSubValue}>{metrics?.pushAttemptCount || 0} attempts</Text>
             <Ionicons name="cloud-upload-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </TouchableOpacity>
        </View>
        <View style={styles.healthRow}>
          <TouchableOpacity 
            onPress={() => setDiagDetailType('backpressure')}
            style={[styles.healthCard, { borderLeftColor: metrics?.queueLength > 20 ? '#EF4444' : '#10B981' }]}
          >
             <Text style={styles.healthLabel}>BACKPRESSURE</Text>
             <Text style={styles.healthValue}>{metrics?.queueLength || 0}</Text>
             <Text style={styles.healthSubValue}>{metrics?.activeThrottles || 0} active throttles</Text>
             <Ionicons name="git-branch-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setDiagDetailType('anomalies')}
            style={[styles.healthCard, { borderLeftColor: (metrics?.anomalyDetectedCount || 0) > 0 ? '#EF4444' : '#CBD5E1' }]}
          >
             <Text style={styles.healthLabel}>ANOMALIES</Text>
             <Text style={[styles.healthValue, { color: (metrics?.anomalyDetectedCount || 0) > 0 ? '#EF4444' : '#1E293B' }]}>{metrics?.anomalyDetectedCount || 0}</Text>
             <Text style={styles.healthSubValue}>{metrics?.staleUpdateCount || 0} stale blocked</Text>
             <Ionicons name="warning-outline" size={24} color="#E2E8F0" style={styles.cardIcon} />
          </TouchableOpacity>
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
                  <View style={[
                    styles.statusDot, 
                    { backgroundColor: Object.values(onlineDevices).some(d => d.targetUserId === p.id) ? '#10B981' : '#CBD5E1' }
                  ]} />
                  <Text style={[styles.miniUserId, { color: selectedDiagUser?.id === p.id ? '#FFFFFF' : '#94A3B8' }]} numberOfLines={1}>
                    {p.id}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          {filteredPlayers.length === 0 && (
            <TouchableOpacity onPress={handleCloudFilenameSearch} style={styles.cloudSearchHint}>
              <Ionicons name="search-outline" size={20} color="#6366F1" />
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
        const isSupportUser = ['support', 'admin', 'system_admin'].includes(selectedDiagUser.role);
        
        // For support users: show ALL ponging devices as live (they only use browsers)
        // For other users: show ponging devices NOT in .devices as live
        const allUserSessions = Object.values(onlineDevices)
          .filter(status => status.targetUserId === selectedDiagUser.id)
          .filter((session, index, self) => 
            index === self.findIndex((s) => s.deviceId === session.deviceId)
          );
        
        const liveSessions = isSupportUser 
          ? allUserSessions  // Support users: show ALL as live browser sessions
          : allUserSessions.filter(status => 
              !selectedDiagUser.devices?.some(d => d.id === status.deviceId)
            );

        // Deduplicate and cap Registered Devices
        const registeredDevices = (selectedDiagUser.devices || [])
          .filter((dev, index, self) => 
            index === self.findIndex((d) => d.id === dev.id)
          )
          .sort((a, b) => (b.lastActive || b.timestamp || 0) - (a.lastActive || a.timestamp || 0))
          .slice(0, 3);

        return (
          <View style={styles.diagFileSection}>
            {liveSessions.length > 0 && (
              <View style={styles.liveSessionsContainer}>
                <Text style={[styles.diagSectionLabel, { color: '#6366F1' }]}>
                  {isSupportUser ? 'Active Browser Sessions' : 'Live Active Sessions (New)'}
                </Text>
                {liveSessions.map(session => (
                  <View key={session.deviceId} style={[styles.deviceItem, styles.liveDeviceItem]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>
                        {isSupportUser ? ("🌐 " + (session.deviceName || 'Browser')) : (session.deviceName || 'New Simulator/Device')}
                      </Text>
                      {session.userAgent ? (
                        <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }} numberOfLines={1}>
                          {session.userAgent.length > 70 ? session.userAgent.substring(0, 70) + '...' : session.userAgent}
                        </Text>
                      ) : null}
                      {session.ipAddress ? (
                        <Text style={{ fontSize: 9, color: '#6366F1', marginTop: 2, fontWeight: 'bold' }}>
                          IP: {String(session.ipAddress)} {(session.location && String(session.location) !== 'Unknown Location') ? `| ${String(session.location)}` : ''}
                        </Text>
                      ) : null}
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
                      <Text style={styles.pullBtnText}>PULL LOGS</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.divider} />
              </View>
            )}

            {/* For support users with no live sessions, show a helpful empty state */}
            {isSupportUser && liveSessions.length === 0 && (
              <View style={styles.noDevicesBox}>
                <Ionicons name="desktop-outline" size={24} color="#CBD5E1" />
                <Text style={styles.noDevicesText}>No active browser session detected.</Text>
                <Text style={[styles.noDevicesText, { fontSize: 10, marginTop: 4 }]}>Employee must be logged into the web dashboard.</Text>
              </View>
            )}

            {/* Only show registered devices section for non-support users */}
            {!isSupportUser && (() => {
              const activeDevices = registeredDevices.filter(d => onlineDevices[d.id] && onlineDevices[d.id].targetUserId === selectedDiagUser.id);
              const offlineDevices = registeredDevices.filter(d => !onlineDevices[d.id] || onlineDevices[d.id].targetUserId !== selectedDiagUser.id);

              return (
                <>
                  {/* Active Devices Section */}
                  {activeDevices.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                        <Text style={[styles.diagSectionLabel, { color: '#059669', marginBottom: 0 }]}>
                          Active Devices ({activeDevices.length})
                        </Text>
                      </View>
                      {activeDevices.map(d => (
                        <View key={d.id} style={[styles.deviceItem, { borderColor: '#10B981', borderWidth: 1, backgroundColor: '#F0FDF4' }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                            {(onlineDevices[d.id]?.ipAddress || d.ipAddress) ? (
                              <Text style={{ fontSize: 9, color: '#6366F1', marginTop: 2, fontWeight: 'bold' }}>
                                IP: {String(onlineDevices[d.id]?.ipAddress || d.ipAddress)} {((onlineDevices[d.id]?.location || d.location) && String(onlineDevices[d.id]?.location || d.location) !== 'Unknown Location') ? `| ${String(onlineDevices[d.id]?.location || d.location)}` : ''}
                              </Text>
                            ) : null}
                            <View style={styles.deviceMeta}>
                              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                              <Text style={[styles.statusText, { color: '#10B981' }]}>ONLINE</Text>
                              <Text style={styles.deviceAppVersion}>
                                v{(onlineDevices[d.id]?.version || d.appVersion || '???')}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity 
                            disabled={pullingDeviceIds[d.id]}
                            onPress={() => handlePullLogs(d.id)}
                            style={[styles.pullBtn, pullingDeviceIds[d.id] && styles.pullBtnDisabled]}
                          >
                            {pullingDeviceIds[d.id] ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="cloud-download-outline" size={14} color="#FFF" />}
                            <Text style={styles.pullBtnText}>{pullingDeviceIds[d.id] ? 'PULLING LOGS...' : 'PULL LOGS'}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Registered History Devices */}
                  {(() => {
                    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
                    const now = Date.now();
                    const recentOfflineDevices = [];
                    const archivedDevices = [];

                    offlineDevices.forEach(d => {
                      if (d.timestamp && now - d.timestamp > TEN_DAYS_MS) {
                        archivedDevices.push(d);
                      } else {
                        recentOfflineDevices.push(d);
                      }
                    });

                    return (
                      <>
                        <Text style={styles.diagSectionLabel}>Registered History Devices ({recentOfflineDevices.length})</Text>
                        {recentOfflineDevices.length > 0 ? (
                          recentOfflineDevices.map(d => (
                            <View key={d.id} style={styles.deviceItem}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                                <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>
                                  Last Login: {new Date(d.lastActive || d.timestamp || Date.now()).toLocaleString()}
                                </Text>
                                {d.ipAddress ? (
                                  <Text style={{ fontSize: 9, color: '#6366F1', marginTop: 2, fontWeight: 'bold' }}>
                                    IP: {String(d.ipAddress)} {(d.location && String(d.location) !== 'Unknown Location') ? `| ${String(d.location)}` : ''}
                                  </Text>
                                ) : null}
                                <View style={styles.deviceMeta}>
                                  <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                                  <Text style={[styles.statusText, { color: '#EF4444' }]}>OFFLINE</Text>
                                  <Text style={styles.deviceAppVersion}>
                                    v{(onlineDevices[d.id]?.version || d.appVersion || '???')}
                                  </Text>
                                </View>
                              </View>
                              {/* 🛡️ [MIGRATION FIX] (v2.6.802): Restored disabled={true} for offline devices.
                                  Was removed during IP-geolocation migration, causing red PULL LOGS buttons
                                  to appear on offline devices that can't respond to socket pings. */}
                              <TouchableOpacity
                                disabled={true}
                                onPress={() => handlePullLogs(d.id)}
                                style={[styles.pullBtn, styles.pullBtnDisabled]}
                              >
                                <Ionicons name="cloud-download-outline" size={14} color="#FFF" />
                                <Text style={styles.pullBtnText}>PULL LOGS</Text>
                              </TouchableOpacity>
                            </View>
                          ))
                        ) : (
                          <View style={styles.noDevicesBox}>
                            <Text style={styles.noDevicesText}>All active devices are online.</Text>
                          </View>
                        )}

                        {archivedDevices.length > 0 && (
                          <View style={{ marginTop: 16 }}>
                            <Text style={[styles.diagSectionLabel, { color: '#64748B' }]}>Archived Devices ({archivedDevices.length})</Text>
                            {archivedDevices.map(d => (
                              <View key={d.id} style={[styles.deviceItem, { opacity: 0.6 }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                                  <View style={styles.deviceMeta}>
                                    <View style={[styles.statusDot, { backgroundColor: '#94A3B8' }]} />
                                    <Text style={[styles.statusText, { color: '#64748B' }]}>INACTIVE &gt; 10 DAYS</Text>
                                    <Text style={styles.deviceAppVersion}>
                                      v{(onlineDevices[d.id]?.version || d.appVersion || '???')}
                                    </Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  disabled={true}
                                  onPress={() => handlePullLogs(d.id)}
                                  style={[styles.pullBtn, styles.pullBtnDisabled]}
                                >
                                  <Ionicons name="cloud-download-outline" size={14} color="#FFF" />
                                  <Text style={styles.pullBtnText}>PULL LOGS</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    );
                  })()}
                </>
              );
            })()}

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
          <ScrollView style={styles.viewerContent} nestedScrollEnabled={true}>
            {(() => {
              try {
                const parsed = JSON.parse(diagContent);
                const userName = selectedDiagUser ? `${selectedDiagUser.name || 'Unknown'} (${parsed.username})` : parsed.username;
                
                let deviceName = parsed.deviceId;
                let deviceVersion = 'Unknown';
                if (selectedDiagUser) {
                  const match = (selectedDiagUser.devices || []).find(d => 
                     parsed.deviceId.includes((d.name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()) ||
                     parsed.deviceId.includes((d.deviceId || d.id || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
                  );
                  if (match) {
                     deviceName = match.name || match.deviceName || parsed.deviceId;
                     deviceVersion = onlineDevices[match.id]?.version || match.appVersion || 'Unknown';
                  } else {
                     const parts = parsed.deviceId.split('_');
                     if (parts.length >= 2 && isNaN(parts[0])) {
                         deviceName = `${parts[0]} ${parts[1]}`;
                     }
                  }
                }

                const logLines = Array.isArray(parsed.logs) ? parsed.logs.length : 0;
                
                // Extract Android/iOS version from the most recent init log if possible
                let osVersion = 'Unknown';
                if (Array.isArray(parsed.logs)) {
                   // Search backwards to get the latest init log (avoids old session init logs)
                   const initLog = [...parsed.logs].reverse().find(l => l.type === 'init' && l.message && l.message.includes('[Platform:'));
                   if (initLog) {
                      const match = initLog.message.match(/\[Platform:\s*([^\]]+)\]/i);
                      if (match) osVersion = match[1];
                   }
                }

                const estSize = (diagContent.length / 1024).toFixed(2);
                let requestedAt = 'Unknown';
                try {
                  requestedAt = parsed.uploadedAt ? new Date(parsed.uploadedAt).toLocaleString() : 'Unknown';
                } catch(e) {}

                return (
                  <Text style={styles.viewerText}>
                    {`User:- ${userName}\nDevice:- ${deviceName}\nAndroid/IoS Version:- ${osVersion}\nAPP version:- ${deviceVersion}\nRequested At:- ${requestedAt}\nLog Lines :- ${logLines}\nEst. Size: ${estSize} KB\n\n-----------------------------------------------------------\n\n${JSON.stringify(parsed.logs, null, 2)}`}
                  </Text>
                );
              } catch (e) {
                return <Text style={styles.viewerText}>{diagContent}</Text>;
              }
            })()}
          </ScrollView>
        </View>
      )}
    </View>
  );
});


export default AdminDiagnosticsPanel;
