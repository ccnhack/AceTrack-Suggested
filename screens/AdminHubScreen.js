import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Image, TextInput, Modal, Alert, Linking, Platform, Share,
  ActivityIndicator, Dimensions, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSafeAvatar } from '../utils/imageUtils';
import PlayerDashboardView from '../components/PlayerDashboardView';
import AdminAuditLogsPanel from '../components/AdminAuditLogsPanel';
import AdminRecordingsDashboard from '../components/AdminRecordingsDashboard';
import { AdminGrievancesPanel } from '../components/AdminGrievancesPanel';
import ParticipantsModal from '../components/ParticipantsModal';
import config from '../config';
import logger from '../utils/logger';
import ProfileScreen from './ProfileScreen';
import designSystem from '../theme/designSystem';

const AdminHubScreen = ({ 
  user, players = [], tournaments = [], matchVideos, supportTickets, auditLogs = [],
  onApproveCoach, onAssignCoach, onRemoveCoach, onUpdateVideoStatus, 
  onBulkUpdateVideoStatus, onForceRefundVideo, onApproveDeleteVideo, 
  onRejectDeleteVideo, onPermanentDeleteVideo, onBulkPermanentDeleteVideos, 
  onReplyTicket, 
  onUpdateTicketStatus, onManualSync, seenAdminActionIds = new Set(),
  setSeenAdminActionIds, visitedAdminSubTabs = new Set(), setVisitedAdminSubTabs,
  isUsingCloud, onOptOut, onLogFailedOtp, onLogTrace, setPlayers, onToggleFavourite,
  isCloudOnline, lastSyncTime, onBatchUpdate, onUploadLogs, isUploadingLogs,
  onVerifyAccount, onToggleCloud, setIsProfileEditActive, appVersion, socketRef,
  navigation, ...restProps
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && windowWidth < 1024;
  const [isWebSidebarOpen, setIsWebSidebarOpen] = useState(false);

  const targetCloudUrl = 'https://acetrack-suggested.onrender.com';
  const activeApiUrl = isUsingCloud ? targetCloudUrl : config.API_BASE_URL;

  const [subTab, setSubTab] = useState('individuals');
  const today = new Date().toISOString().split('T')[0];
  const [search, setSearch] = useState('');
  const [coachSubTab, setCoachSubTab] = useState('pending');
  const [tournamentSubTab, setTournamentSubTab] = useState('upcoming');
  const [rejectType, setRejectType] = useState(null); // 'rejected' | 'addendum'
  const [rejectingCoachId, setRejectingCoachId] = useState(null);
  const [rejectComment, setRejectComment] = useState('');
  const [selectedAcademy, setSelectedAcademy] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [viewingPlayersFor, setViewingPlayersFor] = useState(null);
  const [viewingAssignmentFor, setViewingAssignmentFor] = useState(null);
  const [viewingBreakdownFor, setViewingBreakdownFor] = useState(null);
  const [viewingCoachStatusList, setViewingCoachStatusList] = useState(null); // 'Sent' | 'Declined' | 'Remaining' | 'Opted Out'
  
  // Diagnostics Dashboard States
  const [diagUserSearch, setDiagUserSearch] = useState('');
  const fetchRecentLogs = async () => {
    try {
      const res = await fetch(`${activeApiUrl}/api/diagnostics`, { 
        headers: { 'x-ace-api-key': config.ACE_API_KEY } 
      });
      if (res.ok) {
        const data = await res.json();
        // Extract system-wide recent logs from the file list
        // Typically these follow YYYY-MM-DD format in the suffix
        const files = (data?.files || [])
          .filter(f => !f.includes('server_events.json'))
          .slice(0, 10);
        setRecentLogFiles(files);
      }
    } catch (e) { console.warn("Failed to fetch recent logs:", e); }
  };

  useEffect(() => {
    if (subTab === 'diagnostics') {
      fetchRecentLogs();
    }
  }, [subTab]);

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
        setCloudMatchFiles(matches.slice(0, 10)); // Limit to top 10 matches for UI sanity
        if (matches.length === 0) {
          Alert.alert("No Cloud Logs", `No files matching "${diagUserSearch}" were found on the server.`);
        }
      } else {
        Alert.alert("Error", "Could not fetch cloud directory.");
      }
    } catch (e) {
      console.error("Cloud Search Error:", e);
      Alert.alert("Error", "Network error during cloud search.");
    } finally {
      setIsSearchingFilenames(false);
    }
  };
  const [selectedDiagUser, setSelectedDiagUser] = useState(null);
  const [userDiagFiles, setUserDiagFiles] = useState([]);
  const [selectedDiagFile, setSelectedDiagFile] = useState(null);
  const [diagContent, setDiagContent] = useState(null);
  const [diagFileSize, setDiagFileSize] = useState(0);
  const [isFetchingDiags, setIsFetchingDiags] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPullingLive, setIsPullingLive] = useState(false);
  const [onlineDevices, setOnlineDevices] = useState({});
  const [pullingDeviceIds, setPullingDeviceIds] = useState({});
  const [isSearchingFilenames, setIsSearchingFilenames] = useState(false);
  const [cloudMatchFiles, setCloudMatchFiles] = useState([]);
  const [recentLogFiles, setRecentLogFiles] = useState([]);
  const pongBufferRef = React.useRef({}); // BUFFER: Coalesce pongs to prevent UI lag

    const handlePong = (data) => {
      // Buffer the pong instead of instant state update to prevent UI locking during mass pings
      pongBufferRef.current[data.deviceId] = true;
      pongBufferRef.current[data.targetUserId] = true;
    };

    // Keep a local flag to ensure we don't double-register if screen re-renders
    const isRegistered = React.useRef(false);

    React.useEffect(() => {
      // Re-check periodically if socket not yet available, OR register immediately
      const timer = setInterval(() => {
        if (socketRef && socketRef.current && !isRegistered.current) {
          console.log("🔗 [AdminHub] Registering device_pong_relay listener");
          socketRef.current.on('device_pong_relay', handlePong);
          isRegistered.current = true;
          clearInterval(timer);
        }
      }, 1000);

      // FLUSH TIMER: Update UI state from buffer every 500ms to keep it snappy
      const flushTimer = setInterval(() => {
        if (Object.keys(pongBufferRef.current).length > 0) {
          setOnlineDevices(prev => ({ ...prev, ...pongBufferRef.current }));
          pongBufferRef.current = {};
        }
      }, 500);

      return () => {
        clearInterval(timer);
        clearInterval(flushTimer);
        if (socketRef && socketRef.current) {
          socketRef.current.off('device_pong_relay', handlePong);
          isRegistered.current = false;
        }
      };
    }, []); // Run once, but timer handles late socket arrival

  const handleDownloadDiagnostic = async () => {
    if (!diagContent || isDownloading) return;
    setIsDownloading(true);
    try {
      const safeName = (diagContent.username || 'User').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `Report_${safeName}_${Date.now()}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const content = JSON.stringify(diagContent, null, 2);
      
      // 1. If Web, use DOM download
      if (Platform.OS === 'web') {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logger.logAction('DIAGNOSTICS_DOWNLOAD_WEB', { file: fileName });
        setIsDownloading(false);
        return;
      }

      // 1. Write to local cache (Native)
      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      
      // 2. Share the file URI
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Download Diagnostic Report',
          UTI: 'public.json'
        });
      } else {
        // Fallback to legacy Share if expo-sharing is unavailable (rare)
        await Share.share({
          title: fileName,
          message: content,
        });
      }
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Error", "Failed to prepare the report for download.");
    } finally {
      setIsDownloading(false);
    }
  };

  const filterData = (data, field = 'name') => {
    if (!data) return [];
    if (!search) return data;
    return data.filter(item => 
      (item[field] || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.id || '').toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredIndividuals = useMemo(() => filterData((players || []).filter(p => !p.role || p.role === 'user')), [players, search]);
  const filteredAcademies = useMemo(() => filterData((players || []).filter(p => p.role === 'academy')), [players, search]);
  const filteredCoaches = useMemo(() => filterData((players || []).filter(p => p.role === 'coach')), [players, search]);
  const filteredTournaments = useMemo(() => {
    return (tournaments || []).filter(t => {
      const isUpcoming = t.date >= today;
      if (tournamentSubTab === 'upcoming' && !isUpcoming) return false;
      if (tournamentSubTab === 'past' && isUpcoming) return false;
      
      if (!search) return true;
      const s = search.toLowerCase();
      const academy = (players || []).find(p => p.id === t.creatorId);
      return (t.title || '').toLowerCase().includes(s) ||
             (t.id || '').toLowerCase().includes(s) ||
             (academy?.name || '').toLowerCase().includes(s);
    });
  }, [tournaments, today, tournamentSubTab, search, players]);

  const calculateAcademyTier = (uid, tournaments) => {
    const academyTs = (tournaments || []).filter(t => t.creatorId === uid);
    const hostedCount = academyTs.length;
    const liveCount = academyTs.filter(t => t.status !== 'completed').length;
    const cancellations = academyTs.filter(t => t.status === 'cancelled').length;
    
    // Simple tier logic
    let tier = 'Bronze';
    if (hostedCount > 10) tier = 'Gold';
    else if (hostedCount > 5) tier = 'Silver';

    const sportsBreakdown = {};
    academyTs.forEach(t => {
      sportsBreakdown[t.sport] = (sportsBreakdown[t.sport] || 0) + 1;
    });

    return { hostedCount, liveCount, cancellations, tier, sportsBreakdown };
  };

  const renderCoachList = () => {
    const list = filteredCoaches.filter(c => {
      const status = c.coachStatus || 'pending';
      if (coachSubTab === 'rejected_addendum') return status === 'rejected' || status === 'addendum';
      return status === coachSubTab;
    });

    if (list.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No coaches found</Text>
        </View>
      );
    }

    return list.map(c => {
      const isSelected = selectedCoachId === c.id;
      return (
        <TouchableOpacity 
          key={c.id} 
          activeOpacity={0.9}
          onPress={() => setSelectedCoachId(isSelected ? null : c.id)}
          style={[styles.adminCard, isSelected && { borderLeftColor: '#10B981', backgroundColor: '#F8FAFC' }]}
        >
          <View style={styles.cardHeader}>
            <Image 
              source={getSafeAvatar(c.avatar, c.name)} 
              style={styles.avatar} 
            />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <View style={styles.row}>
                <Ionicons name="call-outline" size={10} color="#94A3B8" />
                <Text style={[styles.cardSubtitle, { marginLeft: 4 }]}>{c.phone}</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: c.coachStatus === 'approved' ? '#DCFCE7' : c.coachStatus === 'revoked' || c.coachStatus === 'rejected' ? '#FEE2E2' : c.coachStatus === 'addendum' ? '#FEF9C3' : '#F1F5F9' }]}>
              <Text style={[styles.statusText, { color: c.coachStatus === 'approved' ? '#15803D' : c.coachStatus === 'revoked' || c.coachStatus === 'rejected' ? '#B91C1C' : c.coachStatus === 'addendum' ? '#A16207' : '#64748B' }]}>
                {(c.coachStatus || 'Pending').toUpperCase()}
              </Text>
            </View>
          </View>

          {isSelected && (
            <View style={[styles.infoBlock, { backgroundColor: '#EEF2FF', borderLeftWidth: 4, borderLeftColor: '#6366F1', marginTop: 12 }]}>
              <Text style={styles.infoLabel}>Account Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>Username</Text>
                <Text style={styles.detailValue}>{c.id}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>Email</Text>
                <Text style={styles.detailValue}>{c.email}</Text>
              </View>
            </View>
          )}

          <View style={styles.expandedContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="ribbon-outline" size={14} color="#6366F1" />
                <Text style={[styles.infoLabel, { marginLeft: 6, marginBottom: 0 }]}>Certified Sports: <Text style={styles.infoValue}>{c.certifiedSports?.join(', ')}</Text></Text>
            </View>
            
            <View style={styles.documentGrid}>
              <TouchableOpacity 
                onPress={() => c.govIdUrl ? Linking.openURL(c.govIdUrl) : Alert.alert("Not Found", "Government ID document has not been uploaded.")} 
                style={[styles.docBtn, !c.govIdUrl && { opacity: 0.5 }]}
              >
                <Ionicons name="card-outline" size={16} color={c.govIdUrl ? "#6366F1" : "#94A3B8"} />
                <Text style={[styles.docBtnText, !c.govIdUrl && { color: "#94A3B8" }]}>Gov ID</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => c.certificationUrl ? Linking.openURL(c.certificationUrl) : Alert.alert("Not Found", "Certification document has not been uploaded.")} 
                style={[styles.docBtn, !c.certificationUrl && { opacity: 0.5 }]}
              >
                <Ionicons name="medal-outline" size={16} color={c.certificationUrl ? "#6366F1" : "#94A3B8"} />
                <Text style={[styles.docBtnText, !c.certificationUrl && { color: "#94A3B8" }]}>Certificate</Text>
              </TouchableOpacity>
            </View>

            {(c.coachStatus === 'rejected' || c.coachStatus === 'addendum') && c.coachRejectReason && (
              <View style={[styles.reasonBox, { marginTop: 12 }]}>
                <Text style={styles.reasonLabel}>Decision Note:</Text>
                <Text style={styles.reasonText}>{c.coachRejectReason}</Text>
              </View>
            )}
          </View>

          {coachSubTab === 'pending' && (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => onApproveCoach(c.id, 'approved')} style={[styles.actionBtn, styles.approveBtn]}>
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRejectType('rejected'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.rejectBtn]}>
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRejectType('addendum'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.addendumBtn]}>
                <Text style={[styles.actionBtnText, { color: '#CA8A04' }]}>Addendum</Text>
              </TouchableOpacity>
            </View>
          )}
          {coachSubTab === 'approved' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'revoked')} style={styles.fullActionBtn}>
              <Ionicons name="close-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={[styles.fullActionBtnText, { color: '#EF4444' }]}>Revoke Access</Text>
            </TouchableOpacity>
          )}
          {coachSubTab === 'revoked' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'approved')} style={[styles.fullActionBtn, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={[styles.fullActionBtnText, { color: '#16A34A' }]}>Restore Access</Text>
            </TouchableOpacity>
          )}
          {coachSubTab === 'rejected_addendum' && c.coachStatus === 'addendum' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'pending')} style={[styles.fullActionBtn, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="refresh-outline" size={16} color="#6366F1" style={{ marginRight: 6 }} />
              <Text style={[styles.fullActionBtnText, { color: '#6366F1' }]}>Simulate User Response</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    });
  };

  const content = (
    <View style={styles.container}>
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.premiumHeader}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isMobileWeb && (
                  <TouchableOpacity onPress={() => setIsWebSidebarOpen(true)} style={{ marginRight: 16 }}>
                    <Ionicons name="menu" size={28} color="#FFF" />
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={styles.premiumTitle}>Admin Hub</Text>
                  <Text style={styles.premiumSubtitle}>System Overview & Management</Text>
                </View>
              </View>
              
              {/* Connection Status Badge */}
              <TouchableOpacity 
                onPress={() => {
                  logger.logAction('MANUAL_SYNC_CLICK');
                  onManualSync?.(true, true);
                }}
                style={[
                  styles.syncBadge, 
                  isCloudOnline ? styles.syncOnline : (isUsingCloud ? styles.syncOffline : styles.syncLocal)
                ]}
              >
                <Ionicons 
                  name={isCloudOnline ? "cloud-done" : (isUsingCloud ? "cloud-offline" : "server")} 
                  size={10} 
                  color={isCloudOnline ? "#16A34A" : (isUsingCloud ? "#EF4444" : "#F59E0B")} 
                />
                <Text style={[styles.syncText, { color: isCloudOnline ? "#16A34A" : (isUsingCloud ? "#EF4444" : "#F59E0B") }]}>
                  {isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
                </Text>
              </TouchableOpacity>
              {lastSyncTime && (
                <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.headerIcon}>
              <Ionicons name="shield-checkmark" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {!isWeb && (
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'individuals', label: 'Individuals', icon: 'person' },
            { id: 'academies', label: 'Academies', icon: 'business' },
            { id: 'coaches', label: 'Coaches', icon: 'school', count: (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !p.isApprovedCoach && (seenAdminActionIds?.has ? !seenAdminActionIds.has(String(p.id)) : true)).length },
            { id: 'security', label: 'Security', icon: 'lock-closed' },
            { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
            { id: 'coach_assignments', label: 'Assignments', icon: 'people', count: (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today) && (seenAdminActionIds?.has ? !seenAdminActionIds.has(String(t.id)) : true)).length },
            { id: 'recordings', label: 'Videos', icon: 'videocam', count: (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && (seenAdminActionIds?.has ? !seenAdminActionIds.has(String(v.id)) : true)).length },
            { id: 'grievances', label: 'Tickets', icon: 'chatbubbles', count: (supportTickets || []).filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && (seenAdminActionIds?.has ? !seenAdminActionIds.has(String(t.id)) : true)).length },
            { id: 'audit', label: 'Audit', icon: 'list' },
            { id: 'diagnostics', label: 'Diag', icon: 'pulse' }
          ].map(tab => {
            const isVisited = visitedAdminSubTabs.has(tab.id);
            const showBadge = tab.count > 0 && (tab.id === 'grievances' ? true : !isVisited);
            const isActive = subTab === tab.id;

            return (
              <TouchableOpacity 
                key={tab.id} 
                onPress={() => { 
                  setSubTab(tab.id); 
                  setSearch(''); 
                  if (tab.id !== 'grievances' && setVisitedAdminSubTabs) {
                    setVisitedAdminSubTabs(prev => {
                        const next = new Set(prev);
                        next.add(tab.id);
                        return next;
                    });
                  }
                  if (setSeenAdminActionIds) {
                    const newSeenIds = new Set(seenAdminActionIds);
                    let added = false;
                    if (tab.id === 'coaches') {
                      (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus)).forEach(p => {
                        const pid = String(p.id);
                        if (!newSeenIds.has(pid)) { newSeenIds.add(pid); added = true; }
                      });
                    } else if (tab.id === 'recordings') {
                      (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested').forEach(v => {
                        const vid = String(v.id);
                        if (!newSeenIds.has(vid)) { newSeenIds.add(vid); added = true; }
                      });
                    } else if (tab.id === 'coach_assignments') {
                      (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today)).forEach(t => {
                        const tid = String(t.id);
                        if (!newSeenIds.has(tid)) { newSeenIds.add(tid); added = true; }
                      });
                    } else if (tab.id === 'grievances') {
                      (supportTickets || []).filter(t => t.status === 'Open' || t.status === 'Awaiting Response').forEach(t => {
                        const sid = String(t.id);
                        if (!newSeenIds.has(sid)) { newSeenIds.add(sid); added = true; }
                      });
                    }
                    if (added) setSeenAdminActionIds(newSeenIds);
                  }
                }}
                style={[styles.premiumTab, isActive && styles.premiumTabActive]}
              >
                <Ionicons name={tab.icon} size={14} color={isActive ? '#FFF' : '#64748B'} style={{ marginRight: 6 }} />
                <Text style={[styles.premiumTabText, isActive && styles.premiumTabTextActive]}>{tab.label}</Text>
                {showBadge && <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>{tab.count}</Text></View>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      )}

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder={`Search ${subTab}...`}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {subTab === 'individuals' && (
          <PlayerDashboardView players={filteredIndividuals} tournaments={tournaments} title="Individuals" />
        )}

        {subTab === 'coaches' && (
          <View>
            <View style={styles.coachSubTabs}>
              {['pending', 'approved', 'revoked', 'rejected_addendum'].map(t => (
                <TouchableOpacity 
                  key={t} 
                  onPress={() => setCoachSubTab(t)}
                  style={[styles.coachSubTab, coachSubTab === t && styles.coachSubTabActive]}
                >
                  <Text style={[styles.coachSubTabText, coachSubTab === t && styles.coachSubTabTextActive]}>
                    {t === 'rejected_addendum' ? 'Rejected/Addendum' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderCoachList()}
          </View>
        )}

        {subTab === 'academies' && filteredAcademies.map(a => {
          const stats = calculateAcademyTier(a.id, tournaments);
          const isSelected = selectedAcademy === a.id;
          return (
            <TouchableOpacity 
              key={a.id} 
              activeOpacity={0.9}
              onPress={() => setSelectedAcademy(isSelected ? null : a.id)}
              style={[styles.adminCard, isSelected && styles.cardActive]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, styles.initialsBox]}>
                  <Text style={styles.initialsText}>{a.name[0]}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{a.name}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: stats.tier === 'Gold' ? '#FEF9C3' : stats.tier === 'Silver' ? '#F1F5F9' : '#FFEDD5' }]}>
                    <Text style={[styles.tierText, { color: stats.tier === 'Gold' ? '#A16207' : stats.tier === 'Silver' ? '#475569' : '#C2410C' }]}>
                      {stats.tier} Tier
                    </Text>
                  </View>
                </View>
                <View style={styles.statsInline}>
                  <View style={styles.inlineStat}>
                    <Text style={styles.inlineValue}>{stats.liveCount}</Text>
                    <Text style={styles.inlineLabel}>Live</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); setViewingBreakdownFor({ academy: a, stats }); }}
                    style={styles.inlineStatBtn}
                  >
                    <Text style={styles.inlineValue}>{stats.hostedCount}</Text>
                    <Text style={styles.inlineLabel}>Total</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isSelected && (
                <View style={styles.expandedContent}>
                  <View style={styles.detailsBlock}>
                    <Text style={styles.blockLabel}>Registration Details</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Username</Text>
                      <Text style={styles.detailValue}>{a.id}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Email</Text>
                      <Text style={styles.detailValue}>{a.email}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Phone</Text>
                      <Text style={styles.detailValue}>{a.phone}</Text>
                    </View>
                  </View>

                  <View style={styles.gridStats}>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Sports Coverage</Text>
                      <Text style={styles.gridStatValue}>{Object.keys(stats.sportsBreakdown).join(', ') || 'None'}</Text>
                    </View>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Reliability</Text>
                      <Text style={[styles.gridStatValue, { color: '#EF4444' }]}>{stats.cancellations} Cancellations</Text>
                    </View>
                  </View>

                  <View style={styles.tournamentList}>
                    <Text style={styles.blockLabel}>Hosted Tournaments</Text>
                    {(tournaments || []).filter(t => t.creatorId === a.id).map(t => (
                      <TouchableOpacity 
                        key={t.id} 
                        onPress={() => setViewingPlayersFor(t)}
                        style={styles.hostedTItem}
                      >
                        <View>
                           <Text style={styles.hostedTTitle}>{t.title}</Text>
                           <Text style={styles.hostedTSport}>{t.sport}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#6366F1" />
                      </TouchableOpacity>
                    ))}
                    {stats.hostedCount === 0 && <Text style={styles.emptyNote}>No events hosted</Text>}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {subTab === 'tournaments' && (
          <View>
            <View style={styles.coachSubTabs}>
              {['upcoming', 'past'].map(st => (
                <TouchableOpacity 
                  key={st} 
                  onPress={() => setTournamentSubTab(st)}
                  style={[styles.coachSubTab, tournamentSubTab === st && styles.coachSubTabActive]}
                >
                  <Text style={[styles.coachSubTabText, tournamentSubTab === st && styles.coachSubTabTextActive]}>
                    {st.charAt(0).toUpperCase() + st.slice(1)} Tournaments
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {filteredTournaments.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No {tournamentSubTab} tournaments found</Text>
              </View>
            ) : (filteredTournaments || []).map(t => {
              const academy = (players || []).find(p => p.id === t.creatorId);
              return (
                <TouchableOpacity 
                  key={t.id} 
                  onPress={() => setViewingPlayersFor(t)}
                  style={styles.adminCard}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.cardTitle}>{t.title}</Text>
                      <Text style={styles.cardSubtitle}>{t.sport} • {t.date}</Text>
                      {academy && (
                        <View style={[styles.row, { marginTop: 4 }]}>
                          <Ionicons name="business-outline" size={10} color="#6366F1" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1', marginLeft: 4 }}>{academy.name}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.ratingBox}>
                      <Text style={styles.ratingValue}>{(t.registeredPlayerIds || []).length}/{t.maxPlayers}</Text>
                      <Text style={styles.ratingLabel}>Slots</Text>
                    </View>
                    <Ionicons name="people-outline" size={16} color="#6366F1" style={{ marginLeft: 10 }} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {subTab === 'coach_assignments' && (tournaments || []).filter(t => 
          (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && 
          !t.assignedCoachId && 
          t.status !== 'completed' && 
          !t.tournamentConcluded &&
          (t.date >= today)
        ).map(t => {
          const academy = (players || []).find(p => p.id === t.creatorId);
          return (
            <View key={t.id} style={styles.adminCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  <Text style={styles.cardSubtitle}>{t.sport} • {t.date}</Text>
                  {academy && (
                    <View style={[styles.row, { marginTop: 4 }]}>
                      <Ionicons name="business-outline" size={10} color="#6366F1" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1', marginLeft: 4 }}>{academy.name}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.statusBadge, styles.wideBadge, { backgroundColor: t.coachStatus?.includes('Assigned') ? '#DCFCE7' : t.coachStatus?.includes('Confirmed') ? '#FEF9C3' : '#F1F5F9' }]}>
                  <Text style={[styles.statusText, { color: t.coachStatus?.includes('Assigned') ? '#15803D' : t.coachStatus?.includes('Confirmed') ? '#A16207' : '#64748B' }]}>{t.coachStatus}</Text>
                </View>
              </View>

            {t.coachStatus === 'Pending Coach Registration' && t.invitedCoachDetails && (
              <View style={[styles.infoBlock, { backgroundColor: '#FFF7ED', borderLeftWidth: 3, borderLeftColor: '#F97316' }]}>
                <Text style={styles.infoLabel}>Invited Coach Details</Text>
                <Text style={styles.coachDetailName}>{t.invitedCoachDetails.name}</Text>
                <Text style={styles.coachDetailText}>{t.invitedCoachDetails.email}</Text>
              </View>
            )}

            {t.coachStatus === 'Coach Confirmed - Awaiting Assignment' && t.confirmedCoachId && (
              <View style={[styles.infoBlock, { backgroundColor: '#FEF9C3', borderLeftWidth: 3, borderLeftColor: '#EAB308' }]}>
                <Text style={styles.infoLabel}>Confirmed Coach</Text>
                <View style={styles.assignRow}>
                  <Text style={styles.coachDetailName}>{players.find(p => p.id === t.confirmedCoachId)?.name}</Text>
                  <TouchableOpacity onPress={() => onAssignCoach(t.id, t.confirmedCoachId)} style={styles.miniAssignBtn}>
                    <Text style={styles.miniAssignText}>Assign</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {t.coachAssignmentType === 'platform' && !t.assignedCoachId && t.assignedCoachIds?.length > 0 && (
              <View style={[styles.infoBlock, { backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: '#6366F1' }]}>
                <Text style={styles.infoLabel}>Opted-in Coaches</Text>
                {t.assignedCoachIds.map(cid => (
                  <View key={cid} style={styles.optedInRow}>
                    <Text style={styles.coachDetailName}>{players.find(p => p.id === cid)?.name}</Text>
                    <TouchableOpacity onPress={() => onAssignCoach(t.id, cid)} style={styles.miniAssignBtnBlue}>
                      <Text style={styles.miniAssignText}>Assign</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {(t.coachStatus === 'Coach Assigned' || t.coachStatus === 'Coach Assigned - Academy') && t.assignedCoachId && (
              <View style={[styles.infoBlock, { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: '#22C55E' }]}>
                <Text style={styles.infoLabel}>Assigned Coach</Text>
                <View style={styles.assignRow}>
                  <Text style={styles.coachDetailName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                  <TouchableOpacity onPress={() => onRemoveCoach(t.id)} style={styles.miniRemoveBtn}>
                    <Text style={styles.miniRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity onPress={() => setViewingAssignmentFor(t)} style={styles.detailsBtn}>
              <Text style={styles.detailsBtnText}>View Full Details</Text>
            </TouchableOpacity>
          </View>
        );
      })}

        {subTab === 'security' && (
          <View>
            <Text style={styles.sectionTitle}>Failed Access Attempts</Text>
            {tournaments.flatMap(t => 
              (t.failedOtpAttempts || []).map((attempt, idx) => {
                const coach = players.find(p => p.id === attempt.coachId);
                return (
                  <View key={`${t.id}-${idx}`} style={[styles.adminCard, { borderLeftColor: '#EF4444' }]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.flex}>
                        <Text style={[styles.cardTitle, { color: '#EF4444' }]}>Security Alert</Text>
                        <Text style={styles.cardSubtitle}>{new Date(attempt.timestamp).toLocaleString()}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
                        <Ionicons name="warning" size={14} color="#EF4444" />
                      </View>
                    </View>
                    <View style={styles.alertContent}>
                        <Text style={styles.alertLabel}>Tournament: <Text style={styles.alertValue}>{t.title}</Text></Text>
                        <Text style={styles.alertLabel}>Coach: <Text style={styles.alertValue}>{coach ? coach.name : attempt.coachId}</Text></Text>
                        <Text style={styles.alertLabel}>OTP Used: <Text style={styles.alertOtp}>{attempt.otp}</Text></Text>
                    </View>
                  </View>
                );
              })
            )}
            {tournaments.every(t => !t.failedOtpAttempts?.length) && (
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark" size={48} color="#E2E8F0" />
                <Text style={[styles.emptyText, { marginTop: 12 }]}>No security alerts logged</Text>
              </View>
            )}
          </View>
        )}

        {subTab === 'recordings' && (
          <AdminRecordingsDashboard 
            matchVideos={matchVideos}
            tournaments={tournaments}
            players={players}
            onUpdateVideoStatus={onUpdateVideoStatus}
            onBulkUpdateStatus={onBulkUpdateVideoStatus}
            onForceRefund={onForceRefundVideo}
            onApproveDeleteVideo={onApproveDeleteVideo}
            onRejectDeleteVideo={onRejectDeleteVideo}
            onPermanentDeleteVideo={onPermanentDeleteVideo}
            onBulkPermanentDeleteVideos={onBulkPermanentDeleteVideos}
          />
        )}

        {subTab === 'grievances' && (
          <AdminGrievancesPanel 
            tickets={supportTickets}
            players={players}
            onReply={onReplyTicket}
            onUpdateStatus={onUpdateTicketStatus}
          />
        )}

        {subTab === 'audit' && (
          <AdminAuditLogsPanel auditLogs={auditLogs} players={players} search={search} />
        )}

        {subTab === 'diagnostics' && (
          <View style={styles.diagnosticsContainer}>
            <View style={styles.diagHeaderRow}>
               <Text style={[styles.sectionTitle, { flex: 1, marginRight: 12, minWidth: 150 }]}>System Diagnostics Management</Text>
               <TouchableOpacity 
                 onPress={() => {
                   logger.logAction('ADMIN_MANUAL_SYNC_TRIGGER');
                   onManualSync?.(true, true);
                 }}
                 style={styles.diagSyncBtn}
               >
                 <Ionicons name="refresh-circle" size={16} color="#FFFFFF" />
                 <Text style={styles.diagSyncBtnText}>Force Sync Cloud</Text>
               </TouchableOpacity>
            </View>
            
            <View style={styles.diagSearchBox}>
              <Ionicons name="people-outline" size={16} color="#64748B" />
              <TextInput 
                 placeholder="Search user (shashank, saumya, etc.)..."
                 value={diagUserSearch}
                 onChangeText={handleDiagSearchChange}
                 style={styles.diagSearchInput}
              />
            </View>

            {recentLogFiles.length > 0 && !diagUserSearch && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#64748B', marginLeft: 4, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent System Activity</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {recentLogFiles.map(file => (
                    <TouchableOpacity 
                      key={file}
                      onPress={async () => {
                        setSelectedDiagUser(null);
                        setSelectedDiagFile(file);
                        setDiagContent(null);
                        setIsDownloading(true);
                        try {
                          const res = await fetch(`${activeApiUrl}/api/diagnostics/${file}`, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
                          if (res.ok) {
                            const text = await res.text();
                            setDiagContent(text);
                            setDiagFileSize(text.length);
                          }
                        } catch (e) { Alert.alert("Error", "Could not fetch file."); }
                        finally { setIsDownloading(false); }
                      }}
                      style={{ backgroundColor: '#F0F9FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#BAE6FD', flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Ionicons name="document-text-outline" size={12} color="#0369A1" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#0369A1' }}>{file.split('_')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.userListScroll}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {(players || [])
                  .filter(p => {
                    if (!p) return false;
                    const name = (p.name || '').toLowerCase();
                    const id = String(p.id || '').toLowerCase();
                    const email = (p.email || '').toLowerCase();
                    const s = diagUserSearch.toLowerCase().trim();
                    if (s) return name.includes(s) || id.includes(s) || email.includes(s);
                    // No search — show all users who have devices or reports, or just everyone (horizontal scroll will handle)
                    return true;
                  })
                  .map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      onPress={async () => {
                        setSelectedDiagUser(p);
                        setUserDiagFiles([]); // Clear immediately to avoid stale data UI
                        setSelectedDiagFile(null);
                        setDiagContent(null);
                        setIsFetchingDiags(true);
                        
                        // PING NATIVE DEVICE TO CHECK PRESENCE (3 retries at 1s intervals)
                        const socket = socketRef?.current;
                        
                        // 🛡️ SYNC HARDENING (v2.6.18): Better null/disconnected check
                        if (!socketRef) {
                          console.error('❌ [AdminHub] socketRef prop is MISSING!');
                          Alert.alert('Connection Error', 'Socket reference missing. Please restart the app.');
                        } else if (!socket) {
                          console.warn('⚠️ [AdminHub] socket.current is null! Socket might still be initializing...');
                          Alert.alert('Sync Starting', 'Please wait a moment for the connection to warm up.');
                        } else {
                          const isConnected = socket.connected;
                          const socketId = socket.id;
                          console.log(`🏓 ADMIN PING: target=${p.id}, socketConnected=${isConnected}, socketId=${socketId}`);
                          
                          // CLEAR STALE ONLINE STATUS FOR THIS USER BEFORE PINGING
                          setOnlineDevices(prev => {
                            const next = { ...prev };
                            delete next[p.id];
                            if (p.devices && Array.isArray(p.devices)) {
                              p.devices.forEach(d => { if (d && d.id) delete next[d.id]; });
                            }
                            return next;
                          });

                          if (!isConnected) {
                            console.warn('⚠️ Socket NOT connected! Attempting manual reconnect (v2.6.20)...');
                            
                            // 🛡️ SYNC HARDENING (v2.6.20): Detailed error logging for manual connect
                            const errHandler = (err) => {
                              console.error(`❌ Socket RECONNECT_ERROR: ${err.message}`);
                              logger.logAction('WS_RECONNECT_ERROR', { error: err.message, message: err.toString() });
                            };
                            socket.once('connect_error', errHandler);
                            
                            socket.connect();
                            // 🛡️ SYNC HARDENING (v2.6.20): Wait up to 1500ms for connection
                            await new Promise(resolve => {
                              const timeout = setTimeout(resolve, 1500);
                              socket.once('connect', () => {
                                clearTimeout(timeout);
                                socket.off('connect_error', errHandler);
                                resolve();
                              });
                            });
                            
                            if (!socket.connected) {
                              Alert.alert('Reconnecting', 'WebSocket failed to authenticate or connect. Please check your internet or try again.');
                              socket.off('connect_error', errHandler);
                              return;
                            }
                            console.log('✅ Reconnected successfully (v2.6.20). Proceeding with ping.');
                          }

                          // Send initial ping plus retries
                          socket.emit('admin_ping_device', { targetUserId: p.id });
                          setTimeout(() => socket?.emit('admin_ping_device', { targetUserId: p.id }), 1000);
                          setTimeout(() => socket?.emit('admin_ping_device', { targetUserId: p.id }), 2000);
                        }
                        
                        const url = `${activeApiUrl}/api/diagnostics?userId=${p.id}`;
                        try {
                          const res = await fetch(url, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
                          if (res.ok) {
                            const data = await res.json();
                            const pName = (p.name || '').toLowerCase();
                            const pId = String(p.id || '').toLowerCase();
                            const pEmailRaw = (p.email || '');
                            const firstName = pName.split(' ')[0];

                            const safeName = p.name ? p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
                            const safeId = p.id ? String(p.id).replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
                            const pEmailPrefix = p.email ? p.email.split('@')[0] : '';
                            const safeEmail = pEmailPrefix.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                            
                            // Check for files matching name, id, email or even parts
                            let fs = (data?.files || []).filter(f => {
                              if (!f) return false;
                              const low = f.toLowerCase();
                              return (safeName && low.startsWith(safeName + '_')) || 
                                     (safeId && low.startsWith(safeId + '_')) ||
                                     (safeEmail && low.startsWith(safeEmail + '_')) ||
                                     (safeName && low.startsWith('admin_requested_' + safeName + '_')) ||
                                     (safeName && low.startsWith('profile_manual_' + safeName + '_')) ||
                                     (safeName && low.includes(`_${safeName}_`)) ||
                                     (firstName.length > 3 && low.includes(firstName.toLowerCase()));
                            });
                            
                            // Improved sort: extract YYYY-MM-DD_HH-MM-SS or YYYYMMDD_HHMMSS and sort descending
                            const getTs = (f) => {
                              const m = f.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})|(\d{8}_\d{6})/);
                              return m ? m[0].replace(/[-_]/g, '') : f;
                            };
                            fs = fs.sort((a, b) => getTs(b).localeCompare(getTs(a))).slice(0, 5);
                            setUserDiagFiles(fs);
                            logger.logAction('DIAGNOSTICS_FETCH_SUCCESS', { user: p.name, fileCount: fs.length });
                          }
                        } catch (e) {
                          setUserDiagFiles([]);
                          logger.logAction('DIAGNOSTICS_FETCH_ERROR', { error: e.message });
                          if (String(p.id).length >= 20) Alert.alert("Error", "Failed to fetch files.");
                        } finally {
                          setIsFetchingDiags(false);
                        }
                      }}
                      style={[styles.miniUserCard, selectedDiagUser?.id === p.id && styles.miniUserCardActive]}
                    >
                      <Image 
                        source={getSafeAvatar(p.avatar, p.name)} 
                        style={styles.miniAvatar} 
                      />
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.miniUserName, selectedDiagUser?.id === p.id && styles.miniUserNameActive]} numberOfLines={1}>
                          {(p.name || 'User').split(' ')[0]}
                        </Text>
                        <Text style={{ fontSize: 8, color: selectedDiagUser?.id === p.id ? '#FFFFFF' : '#94A3B8', fontWeight: 'bold' }}>
                          ({p.id})
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {((players || [])
                  .filter(p => {
                    if (!p) return false;
                    const name = (p.name || '').toLowerCase();
                    const id = String(p.id || '').toLowerCase();
                    const email = (p.email || '').toLowerCase();
                    const s = diagUserSearch.toLowerCase().trim();
                    if (s) return name.includes(s) || id.includes(s) || email.includes(s);
                    // No search — show all (horizontal scroll will handle)
                    return true;
                  }) || []).length === 0 && (
                    <View style={{ padding: 20 }}>
                      <Text style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                        No user matching "{diagUserSearch}" found.
                      </Text>
                      <Text style={{ color: '#64748B', fontSize: 10, marginTop: 4, marginBottom: 12 }}>
                        Players in list: {(players || []).length}. (Check "Refresh Cloud Data" if users are missing)
                      </Text>
                      {diagUserSearch.length > 2 && (
                        <TouchableOpacity 
                          onPress={handleCloudFilenameSearch}
                          disabled={isSearchingFilenames}
                          style={{ backgroundColor: '#EEF2FF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE', alignItems: 'center' }}
                        >
                          {isSearchingFilenames ? (
                            <ActivityIndicator size="small" color="#4F46E5" />
                          ) : (
                            <Text style={{ color: '#4F46E5', fontWeight: 'bold', fontSize: 12 }}>🔍 Search Cloud for logs matching "{diagUserSearch}"</Text>
                          )}
                        </TouchableOpacity>
                      )}

                      {cloudMatchFiles.length > 0 && (
                        <View style={{ marginTop: 16 }}>
                          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0F172A', marginBottom: 8 }}>Found {cloudMatchFiles.length} Cloud Logs:</Text>
                          {cloudMatchFiles.map(file => (
                            <TouchableOpacity 
                              key={file}
                              onPress={async () => {
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
                                    setDiagFileSize(text.length);
                                  }
                                } catch (e) { Alert.alert("Error", "Could not fetch file."); }
                                finally { setIsDownloading(false); }
                              }}
                              style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, marginBottom: 4, borderWidth: 1, borderColor: '#E2E8F0' }}
                            >
                              <Text style={{ fontSize: 10, color: '#334155' }} numberOfLines={1}>{file}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
              </ScrollView>
            </View>

            {selectedDiagUser && (
              <View style={styles.diagFileSection}>
                {selectedDiagUser.devices && selectedDiagUser.devices.length > 0 ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' }}>Active Devices</Text>
                    {(selectedDiagUser.devices || []).filter(d => {
                      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
                      return d.lastActive >= threeDaysAgo;
                    }).sort((a, b) => {
                      const aOnline = onlineDevices[a.id] ? 1 : 0;
                      const bOnline = onlineDevices[b.id] ? 1 : 0;
                      return bOnline - aOnline;
                    }).map(d => {
                      // Debug logger for missing versions
                      if (!d.appVersion || !d.platformVersion) {
                        console.log(`[AdminHub] Device version missing: ID=${d.id}, App=${d.appVersion}, Platform=${d.platformVersion}`);
                        logger.logAction('DEVICE_VERSION_MISSING', { deviceId: d.id, app: d.appVersion, platform: d.platformVersion });
                      }
                      return (
                      <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#0F172A' }} numberOfLines={1}>{d.name}</Text>
                          <Text style={{ fontSize: 9, color: '#64748B' }}>ID: {d.id}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onlineDevices[d.id] ? '#10B981' : '#EF4444' }} />
                            <Text style={{ fontSize: 10, color: onlineDevices[d.id] ? '#10B981' : '#EF4444', fontWeight: 'bold' }}>
                              {onlineDevices[d.id] ? 'ONLINE' : 'OFFLINE'}
                            </Text>
                            <Text style={{ fontSize: 9, color: '#94A3B8' }}>
                              • Last Seen: {new Date(d.lastActive).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <TouchableOpacity 
                            disabled={pullingDeviceIds[d.id] || !onlineDevices[d.id]}
                            onPress={async () => {
                              if (socketRef && socketRef.current) {
                                socketRef.current.emit('admin_pull_diagnostics', { 
                                  targetUserId: selectedDiagUser.id,
                                  targetDeviceId: d.id,
                                  adminId: user?.id 
                                });
                                logger.logAction('ADMIN_SENT_PULL_REQUEST', { target: selectedDiagUser.id, device: d.id });
                                
                                const initialFiles = new Set(userDiagFiles);
                                setPullingDeviceIds(prev => ({ ...prev, [d.id]: true }));
                                let attempts = 0;
                                
                                const poll = async () => {
                                  while (attempts < 5) {
                                    attempts++;
                                    try {
                                      const res = await fetch(`${activeApiUrl}/api/diagnostics?userId=${selectedDiagUser.id}`, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
                                      if (res.ok) {
                                        const data = await res.json();
                                        const pNameRaw = (selectedDiagUser.name || '').toLowerCase();
                                        const firstName = pNameRaw.split(' ')[0];
                                        const safeName = pNameRaw.replace(/[^a-z0-9]/gi, '_');
                                        const fs = data.files.filter(f => {
                                          const lf = f.toLowerCase();
                                          return lf.includes(safeName) || lf.includes(firstName);
                                        });
                                        
                                        const getTs = (f) => {
                                          const m = f.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})|(\d{8}_\d{6})/);
                                          return m ? m[0].replace(/[-_]/g, '') : f;
                                        };
                                        const sortedFs = fs.sort((a, b) => getTs(b).localeCompare(getTs(a)));
                                        
                                        // Diff detection: If server file rotation kept length at 3, detect the brand new filename explicitly
                                        const hasNewFile = sortedFs.some(f => !initialFiles.has(f));
                                        if (hasNewFile) {
                                          setUserDiagFiles(sortedFs);
                                          setPullingDeviceIds(prev => { const next = {...prev}; delete next[d.id]; return next; });
                                          return; // Instantly halt the spinner when the file drops
                                        }
                                      }
                                    } catch (e) {}
                                    await new Promise(r => setTimeout(r, 3000));
                                  }
                                  setPullingDeviceIds(prev => { const next = {...prev}; delete next[d.id]; return next; }); // Times out after 15s
                                };
                                poll();

                              } else {
                                Alert.alert("Error", "WebSocket not connected.");
                              }
                            }}
                            style={{ 
                              backgroundColor: (pullingDeviceIds[d.id] || !onlineDevices[d.id]) ? '#CBD5E1' : '#EF4444', 
                              paddingHorizontal: 10, 
                              paddingVertical: 6, 
                              borderRadius: 16, 
                              flexDirection: 'row', 
                              alignItems: 'center', 
                              gap: 4, 
                              minWidth: 90,
                              justifyContent: 'center',
                              opacity: (pullingDeviceIds[d.id] || !onlineDevices[d.id]) ? 0.8 : 1 
                            }}
                          >
                            {pullingDeviceIds[d.id] ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={12} color="#FFFFFF" />}
                            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 10 }}>{pullingDeviceIds[d.id] ? 'PULLING...' : 'PULL LOGS'}</Text>
                          </TouchableOpacity>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {d.platformVersion && (
                              <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>{d.platformVersion}</Text>
                              </View>
                            )}
                            {d.appVersion && (
                              <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#4F46E5' }}>{d.appVersion}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    )})}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ fontSize: 11, color: onlineDevices[selectedDiagUser.id] ? '#10B981' : '#EF4444', fontWeight: 'bold', marginBottom: 2 }}>{onlineDevices[selectedDiagUser.id] ? 'ONLINE (ACTIVE)' : 'OFFLINE'}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>No hardware logs stored on cluster. Live trigger will pull any unrecorded connected devices.</Text>
                    </View>
                    <TouchableOpacity 
                      disabled={pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]}
                      onPress={async () => {
                        if (socketRef && socketRef.current) {
                          socketRef.current.emit('admin_pull_diagnostics', { 
                            targetUserId: selectedDiagUser.id,
                            adminId: user?.id 
                          });
                          logger.logAction('ADMIN_SENT_PULL_REQUEST', { target: selectedDiagUser.id });
                          
                          const initialFiles = new Set(userDiagFiles);
                          setPullingDeviceIds(prev => ({ ...prev, [selectedDiagUser.id]: true }));
                          let attempts = 0;
                          
                          const poll = async () => {
                            while (attempts < 5) {
                              attempts++;
                              try {
                                const res = await fetch(`${activeApiUrl}/api/diagnostics`, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
                                if (res.ok) {
                                  const data = await res.json();
                                  const pNameRaw = (selectedDiagUser.name || '').toLowerCase();
                                  const firstName = pNameRaw.split(' ')[0];
                                  const safeName = pNameRaw.replace(/[^a-z0-9]/gi, '_');
                                  const fs = data.files.filter(f => {
                                    const lf = f.toLowerCase();
                                    return lf.includes(safeName) || lf.includes(firstName);
                                  });
                                  
                                  const hasNewFile = fs.some(f => !initialFiles.has(f));
                                  if (hasNewFile) {
                                    setUserDiagFiles(fs.reverse());
                                    setPullingDeviceIds(prev => { const next = {...prev}; delete next[selectedDiagUser.id]; return next; });
                                    return; // Instantly halt the spinner when the file drops
                                  }
                                }
                              } catch (e) {}
                              await new Promise(r => setTimeout(r, 3000));
                            }
                            setPullingDeviceIds(prev => { const next = {...prev}; delete next[selectedDiagUser.id]; return next; }); // Times out after 15s
                          };
                          poll();
                        }
                      }}
                      style={{ backgroundColor: (pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]) ? '#94A3B8' : '#EF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: (pullingDeviceIds[selectedDiagUser.id] || !onlineDevices[selectedDiagUser.id]) ? 0.7 : 1 }}
                    >
                      {pullingDeviceIds[selectedDiagUser.id] ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-download-outline" size={14} color="#FFFFFF" />}
                      <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 10 }}>{pullingDeviceIds[selectedDiagUser.id] ? 'PULLING...' : `PULL LIVE LOGS FOR ${(selectedDiagUser.name || 'USER').split(' ')[0].toUpperCase()}`}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.diagLabel}>Reports for {selectedDiagUser.name}:</Text>
                {isFetchingDiags ? (
                  <Text style={styles.diagLoading}>Fetching files...</Text>
                ) : userDiagFiles.length === 0 ? (
                  <Text style={styles.diagEmpty}>No reports found for this user.</Text>
                ) : (
                  <View style={styles.diagFileGrid}>
                    {userDiagFiles.map(file => (
                      <TouchableOpacity 
                        key={file} 
                        onPress={async () => {
                          setSelectedDiagFile(file);
                          setIsFetchingDiags(true);
                          try {
                            const res = await fetch(`${activeApiUrl}/api/diagnostics/${file}`, {
                              headers: { 'x-ace-api-key': config.ACE_API_KEY }
                            });
                            if (res.ok) {
                              const content = await res.json();
                              setDiagContent(content);
                              setDiagFileSize((JSON.stringify(content).length / 1024).toFixed(1));
                            }
                          } catch (e) {
                            Alert.alert("Error", "Failed to fetch content.");
                          } finally {
                            setIsFetchingDiags(false);
                          }
                        }}
                        style={[styles.diagFileItem, selectedDiagFile === file && styles.diagFileItemActive]}
                      >
                        <Ionicons name="document-text" size={20} color={selectedDiagFile === file ? "#FFFFFF" : "#3B82F6"} />
                        <Text style={[styles.diagFileName, selectedDiagFile === file && styles.diagFileNameActive]}>
                          {file.startsWith('admin_requested_') 
                            ? `[ADMIN PULL] ${file.replace('admin_requested_', '').replace('.json', '')}`
                            : file.replace('.json', '')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {diagContent && (
              <View style={styles.diagViewPanel}>
                <View style={styles.diagViewHeader}>
                  <Text style={styles.diagViewTitle}>
                    Report Details {diagContent && `(${diagFileSize} KB)`}
                  </Text>
                  <TouchableOpacity 
                    onPress={handleDownloadDiagnostic}
                    disabled={isDownloading}
                    style={[styles.diagDownloadBtn, { backgroundColor: isDownloading ? '#94A3B8' : '#16A34A' }]}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.diagDownloadText}>
                      {isDownloading ? 'Downloading...' : 'Download'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.diagScrollArea}>
                  <View style={styles.diagMetaRow}>
                    <Text style={styles.diagMetaLabel}>User: {diagContent.username}</Text>
                  </View>
                  <View style={styles.diagMetaRow}>
                    <Text style={styles.diagMetaLabel}>Date: {diagContent.uploadedAt}</Text>
                  </View>
                  <View style={styles.diagMetaRow}>
                    <Text style={styles.diagMetaLabel}>Device: {diagContent.deviceId || 'Legacy App Instance'}</Text>
                  </View>
                  <View style={styles.diagLogBox}>
                    {(diagContent.logs || []).map((log, idx) => (
                      <View key={idx} style={styles.diagLogLine}>
                        <Text style={styles.diagLogTime}>[{log.timestamp?.split(' ')[1] || '00:00'}]</Text>
                        <Text style={[styles.diagLogLevel, { color: log.level === 'error' ? '#EF4444' : log.level === 'warn' ? '#EAB308' : '#3B82F6' }]}>{log.level?.toUpperCase()}</Text>
                        <Text style={styles.diagLogMsg}>{log.message}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rejection Modal */}
      <Modal visible={!!rejectingCoachId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{rejectType === 'addendum' ? 'Request Addendum' : 'Reject Coach'}</Text>
                <Text style={styles.modalSubtitle}>
                  {rejectType === 'addendum' 
                    ? 'Specify details or documents required.' 
                    : 'Provide rejection reason.'}
                </Text>
                <TextInput 
                    multiline
                    numberOfLines={4}
                    value={rejectComment}
                    onChangeText={setRejectComment}
                    placeholder="Enter reason..."
                    style={styles.modalInput}
                />
                <View style={styles.modalActions}>
                    <TouchableOpacity 
                        onPress={() => { setRejectingCoachId(null); setRejectComment(''); }}
                        style={styles.modalCancel}
                    >
                        <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => {
                          onApproveCoach(rejectingCoachId, rejectType, rejectComment);
                          setRejectingCoachId(null);
                          setRejectComment('');
                        }}
                        style={[styles.modalSubmit, { backgroundColor: rejectType === 'addendum' ? '#EAB308' : '#EF4444' }]}
                    >
                        <Text style={styles.modalSubmitText}>Submit</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* Breakdown Modal */}
      <Modal visible={!!viewingBreakdownFor} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.sheetContent}>
                <View style={styles.sheetHeader}>
                    <View>
                        <Text style={styles.sheetTitle}>Sports Insights</Text>
                        <Text style={styles.sheetSubtitle}>{viewingBreakdownFor?.academy.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setViewingBreakdownFor(null)}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>
                <ScrollView style={styles.sheetScroll}>
                    {viewingBreakdownFor && Object.entries(viewingBreakdownFor.stats.sportsBreakdown).map(([sport, count]) => (
                        <View key={sport} style={styles.insightRow}>
                            <Text style={styles.insightLabel}>{sport}</Text>
                            <Text style={styles.insightCount}>{count}</Text>
                        </View>
                    ))}
                    {(!viewingBreakdownFor || Object.keys(viewingBreakdownFor.stats.sportsBreakdown).length === 0) && (
                        <Text style={styles.emptyNote}>No tournament data</Text>
                    )}
                </ScrollView>
                <View style={styles.sheetFooter}>
                    <Text style={styles.footerLabel}>Total Hosted</Text>
                    <Text style={styles.footerValue}>{viewingBreakdownFor?.stats.hostedCount}</Text>
                </View>
            </View>
        </View>
      </Modal>

      {/* Assignment Details Modal */}
      <Modal visible={!!viewingAssignmentFor} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.sheetContent}>
                <View style={styles.sheetHeader}>
                    <View style={styles.flex}>
                        <Text style={styles.sheetTitle}>Assignment Analytics</Text>
                        <Text style={styles.sheetSubtitle}>{viewingAssignmentFor?.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setViewingAssignmentFor(null); setViewingCoachStatusList(null); }}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>

                {(() => {
                  const sentIds = viewingAssignmentFor?.notifiedCoachIds || [];
                  const declinedIds = viewingAssignmentFor?.declinedCoachIds || [];
                  const optedOutIds = viewingAssignmentFor?.optedOutCoachIds || [];
                  const remainingIds = sentIds.filter(id => !declinedIds.includes(id) && !optedOutIds.includes(id));

                  const stats = [
                    { label: 'Sent', count: sentIds.length, color: '#3B82F6', light: '#EFF6FF', ids: sentIds },
                    { label: 'Declined', count: declinedIds.length, color: '#EF4444', light: '#FEF2F2', ids: declinedIds },
                    { label: 'Remaining', count: remainingIds.length, color: '#F59E0B', light: '#FFFBEB', ids: remainingIds },
                    { label: 'Opted Out', count: optedOutIds.length, color: '#6B7280', light: '#F9FAFB', ids: optedOutIds }
                  ];

                  if (viewingCoachStatusList) {
                    const activeStat = stats.find(s => s.label === viewingCoachStatusList);
                    const listIds = activeStat?.ids || [];
                    const listCoaches = listIds.map(id => (players || []).find(p => p.id === id)).filter(Boolean);

                    return (
                      <View style={styles.flex}>
                        <View style={styles.drillDownHeader}>
                          <TouchableOpacity onPress={() => setViewingCoachStatusList(null)} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={20} color="#6366F1" />
                            <Text style={styles.backBtnText}>Back to Summary</Text>
                          </TouchableOpacity>
                          <View style={styles.flex}>
                            <Text style={styles.drillDownTitle}>{viewingCoachStatusList} Coaches ({listCoaches.length})</Text>
                          </View>
                        </View>
                        <ScrollView style={styles.sheetScroll}>
                          {listCoaches.length > 0 ? listCoaches.map((c) => (
                            <View key={c.id} style={styles.coachListRow}>
                              <Image 
                                source={getSafeAvatar(c.avatar, c.name)} 
                                style={styles.coachSmallAvatar} 
                              />
                              <View>
                                <Text style={styles.coachNameText}>{c.name}</Text>
                                <Text style={styles.coachMetaText}>{c.id} • {c.email}</Text>
                              </View>
                            </View>
                          )) : (
                            <View style={styles.emptyContainer}>
                              <Ionicons name="people-outline" size={48} color="#E2E8F0" />
                              <Text style={styles.emptyText}>No coaches found in this category</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    );
                  }

                  return (
                    <ScrollView style={styles.sheetScroll}>
                      <View style={styles.detailSection}>
                          <Text style={styles.detailLabel}>Recruitment Progress</Text>
                          <View style={styles.analyticsTable}>
                            <View style={styles.tableHead}>
                              <Text style={styles.tableHeadText}>Notification Status</Text>
                              <Text style={[styles.tableHeadText, { textAlign: 'right' }]}>Count</Text>
                            </View>
                            
                            {stats.map((item) => (
                              <TouchableOpacity 
                                key={item.label} 
                                onPress={() => setViewingCoachStatusList(item.label)}
                                style={styles.tableRow}
                              >
                                <View style={styles.rowLabelGroup}>
                                  <View style={[styles.statusDot, { backgroundColor: item.color }]} />
                                  <Text style={styles.tableRowLabel}>{item.label}</Text>
                                </View>
                                <View style={[styles.countBadge, { backgroundColor: item.light }]}>
                                  <Text style={[styles.countBadgeText, { color: item.color }]}>{item.count}</Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                      </View>

                      <View style={styles.detailSection}>
                          <Text style={styles.detailLabel}>Host Academy</Text>
                          <View style={styles.academyBanner}>
                             <Ionicons name="business" size={20} color="#6366F1" />
                             <Text style={styles.academyNameDetail}>
                                {players.find(p => p.id === viewingAssignmentFor?.creatorId)?.name || 'Unknown Academy'}
                             </Text>
                          </View>
                      </View>

                      <View style={[styles.detailSection, { marginBottom: 100 }]}>
                          <Text style={styles.detailLabel}>Primary Assignment</Text>
                          {viewingAssignmentFor?.assignedCoachId ? (
                             <View style={[styles.infoBlock, { backgroundColor: '#F0FDF4', borderLeftWidth: 4, borderLeftColor: '#22C55E' }]}>
                                <Text style={styles.coachDetailName}>
                                  {players.find(p => p.id === viewingAssignmentFor.assignedCoachId)?.name}
                                </Text>
                                <Text style={styles.coachDetailText}>Assigned Coach</Text>
                             </View>
                          ) : (
                             <View style={[styles.infoBlock, { backgroundColor: '#F8FAFC' }]}>
                                <Text style={[styles.coachDetailText, { textAlign: 'center' }]}>No coach assigned yet</Text>
                             </View>
                          )}
                      </View>
                    </ScrollView>
                  );
                })()}
            </View>
        </View>
      </Modal>

      <ParticipantsModal 
        tournament={viewingPlayersFor} 
        players={players} 
        onClose={() => setViewingPlayersFor(null)} 
      />
    </View>
  );

  const renderWebSidebar = () => (
    <>
      {(isMobileWeb && isWebSidebarOpen) && (
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setIsWebSidebarOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        />
      )}
      <View style={{ 
        width: 280, 
        backgroundColor: '#0F172A', 
        height: '100vh', 
        paddingTop: 32, 
        paddingBottom: 24, 
        justifyContent: 'space-between',
        position: isMobileWeb ? 'absolute' : 'relative',
        left: isMobileWeb ? (isWebSidebarOpen ? 0 : -280) : 0,
        zIndex: 101,
        transition: 'left 0.3s ease-in-out'
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 40 }}>
            {isMobileWeb ? (
              <TouchableOpacity onPress={() => setIsWebSidebarOpen(false)}>
                <Ionicons name="close" size={28} color="#FFF" style={{ marginRight: 16 }} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="menu" size={28} color="#FFF" style={{ marginRight: 16 }} />
            )}
            <Image source={require('../assets/icon.png')} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>ACETRACK</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 1, paddingHorizontal: 16 }}>
            <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 12, paddingHorizontal: 12, letterSpacing: 1.5 }}>MAIN MENU</Text>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'speedometer-outline' },
              { id: 'individuals', label: 'Individuals', icon: 'person-outline' },
              { id: 'academies', label: 'Academies', icon: 'business-outline' },
              { id: 'coaches', label: 'Coaches', icon: 'megaphone-outline', count: (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && (seenAdminActionIds?.has ? !seenAdminActionIds.has(p.id) : true)).length },
              { id: 'security', label: 'Security', icon: 'shield-checkmark-outline' },
              { id: 'tournaments', label: 'Tournaments', icon: 'trophy-outline' },
              { id: 'coach_assignments', label: 'Coach Assignments', icon: 'clipboard-outline', count: (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today) && (seenAdminActionIds?.has ? !seenAdminActionIds.has(t.id) : true)).length },
              { id: 'recordings', label: 'Recordings', icon: 'videocam-outline', count: (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && (seenAdminActionIds?.has ? !seenAdminActionIds.has(v.id) : true)).length },
              { id: 'grievances', label: 'Grievances', icon: 'warning-outline', count: (supportTickets || []).filter(t => t.status === 'Open').length },
              { id: 'audit', label: 'Audit Logs', icon: 'book-outline' },
              { id: 'diagnostics', label: 'Diagnostics', icon: 'desktop-outline' }
            ].map(tab => {
              const isActive = subTab === tab.id || (tab.id === 'individuals' && subTab === 'dashboard'); // Default
              return (
                 <TouchableOpacity 
                   key={tab.id}
                   onPress={() => { 
                     setSubTab(tab.id === 'dashboard' ? 'individuals' : tab.id); 
                     setSearch('');
                     if (isMobileWeb) setIsWebSidebarOpen(false);
                   }}
                   style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: isActive ? '#0F766E' : 'transparent', marginBottom: 4 }}
                 >
                   <Ionicons name={tab.icon} size={20} color={isActive ? '#FFF' : '#94A3B8'} />
                   <Text style={{ marginLeft: 16, fontSize: 14, fontWeight: isActive ? '700' : '500', color: isActive ? '#FFF' : '#CBD5E1', flex: 1 }}>{tab.label}</Text>
                   {tab.count > 0 && <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{tab.count}</Text></View>}
                 </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
        <View style={{ paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 24, marginTop: 16 }}>
           <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 20 }}>
             <Ionicons name="toggle" size={24} color="#10B981" />
             <Text style={{ color: '#E2E8F0', marginLeft: 12, fontSize: 13, fontWeight: '600' }}>Admin Active</Text>
           </View>
           <TouchableOpacity onPress={() => { setSubTab('profile'); if (isMobileWeb) setIsWebSidebarOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
             <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: subTab === 'profile' ? '#10B981' : '#334155', justifyContent: 'center', alignItems: 'center' }}>
               <Ionicons name="person" size={18} color="#FFF" />
             </View>
             <View style={{ marginLeft: 12 }}>
               <Text style={{ color: subTab === 'profile' ? '#10B981' : '#F8FAFC', fontSize: 14, fontWeight: 'bold' }}>Profile Settings</Text>
               <Text style={{ color: '#94A3B8', fontSize: 11 }}>View Your Details</Text>
             </View>
           </TouchableOpacity>
        </View>
      </View>
    </>
  );

  return isWeb ? (
    <View style={{ flex: 1, flexDirection: isMobileWeb ? 'column' : 'row', backgroundColor: '#F8FAFC', height: '100vh', width: '100vw' }}>
      {renderWebSidebar()}
      <View style={{ flex: 1, padding: isMobileWeb ? 16 : 32, overflow: 'hidden' }}>
        {subTab === 'profile' ? (
           <ProfileScreen 
             user={user} tournaments={tournaments || []} isCloudOnline={isCloudOnline}
             isUsingCloud={isUsingCloud} lastSyncTime={lastSyncTime}
             onManualSync={onManualSync} onToggleCloud={onToggleCloud}
             setIsProfileEditActive={setIsProfileEditActive} appVersion={appVersion}
             navigation={navigation} players={players || []} supportTickets={supportTickets || []}
             onVerifyAccount={onVerifyAccount} onUploadLogs={onUploadLogs} isUploadingLogs={isUploadingLogs}
             {...restProps}
           />
        ) : (
           <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: isMobileWeb ? 16 : 24, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, overflow: 'hidden' }}>
             {content}
           </View>
        )}
      </View>
    </View>
  ) : content;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  premiumHeader: { paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingTop: Platform.OS === 'ios' ? 0 : 20 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginTop: 10 },
  premiumTitle: { fontSize: 26, fontWeight: '900', color: '#FFF' },
  premiumSubtitle: { fontSize: 13, color: '#E0E7FF', marginTop: 2 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  tabContainer: { marginVertical: 20 },
  tabScroll: { paddingHorizontal: 16 },
  premiumTab: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 20, 
    backgroundColor: '#FFF', 
    marginRight: 10,
    ...designSystem.shadows.sm
  },
  premiumTabActive: { backgroundColor: '#6366F1' },
  premiumTabText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  premiumTabTextActive: { color: '#FFF' },
  premiumBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  premiumBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    marginHorizontal: 24, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    marginBottom: 20,
    ...designSystem.shadows.sm
  },
  searchInput: { flex: 1, paddingVertical: 12, marginLeft: 10, fontSize: 14, color: '#1E293B', fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: 24 },
  adminCard: { 
    backgroundColor: '#FFF', 
    borderRadius: 24, 
    padding: 20, 
    marginBottom: 16, 
    borderLeftWidth: 4, 
    borderLeftColor: '#6366F1',
    ...designSystem.shadows.sm
  },
  cardActive: { borderLeftColor: '#10B981' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, marginRight: 14 },
  initialsBox: { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  initialsText: { fontSize: 18, fontWeight: '800', color: '#6366F1' },
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  infoBlock: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: '#F1F5F9' },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  infoValue: { color: '#1E293B', textTransform: 'none' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailTitle: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  linkText: { fontSize: 12, color: '#6366F1', fontWeight: '700' },
  reasonLine: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 },
  reasonText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  actionRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  actionBtn: { flex: 1, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  approveBtn: { backgroundColor: '#6366F1' },
  actionBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  rejectBtn: { backgroundColor: '#FEE2E2' },
  addendumBtn: { backgroundColor: '#FEF9C3' },
  fullActionBtn: { height: 48, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  fullActionBtnText: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  coachSubTabs: { flexDirection: 'row', marginBottom: 20, gap: 8 },
  coachSubTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', ...designSystem.shadows.sm },
  coachSubTabActive: { backgroundColor: '#6366F1' },
  coachSubTabText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  coachSubTabTextActive: { color: '#FFF' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  tierText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statsInline: { flexDirection: 'row', gap: 12 },
  inlineStat: { alignItems: 'center' },
  inlineStatBtn: { alignItems: 'center' },
  inlineValue: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  inlineLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  expandedContent: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  detailsBlock: { marginBottom: 16 },
  blockLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 12 },
  gridStats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  gridStatBox: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC' },
  gridStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', marginBottom: 4 },
  gridStatValue: { fontSize: 11, color: '#1E293B', fontWeight: '800' },
  tournamentList: { marginTop: 8 },
  hostedTItem: { padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hostedTTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  hostedTSport: { fontSize: 11, color: '#6366F1', fontWeight: '800' },
  emptyNote: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  ratingBox: { alignItems: 'center' },
  ratingValue: { fontSize: 16, fontWeight: '800', color: '#6366F1' },
  ratingLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  wideBadge: { width: 100, alignItems: 'center' },
  assignRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachDetailName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  coachDetailText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  miniAssignBtn: { backgroundColor: '#6366F1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  miniAssignBtnBlue: { backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  miniAssignText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  miniRemoveBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  miniRemoveText: { color: '#EF4444', fontSize: 10, fontWeight: '800' },
  optedInRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailsBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  detailsBtnText: { fontSize: 13, fontWeight: '800', color: '#6366F1' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#1E293B', textTransform: 'uppercase', marginBottom: 16, marginTop: 10 },
  alertContent: { marginTop: 10 },
  alertLabel: { fontSize: 12, color: '#64748B', fontWeight: '700', marginBottom: 4 },
  alertValue: { color: '#1E293B', fontWeight: '800' },
  alertOtp: { color: '#EF4444', fontWeight: '900', letterSpacing: 1 },
  diagnosticsContainer: { paddingHorizontal: 24, paddingBottom: 40 },
  diagHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  diagSyncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  diagSyncBtnText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  diagSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, borderRadius: 16, ...designSystem.shadows.sm, marginBottom: 16 },
  diagSearchInput: { flex: 1, paddingVertical: 12, marginLeft: 10, fontSize: 14, color: '#1E293B' },
  userListScroll: { marginBottom: 24 },
  miniUserCard: { alignItems: 'center', padding: 12, marginRight: 12, borderRadius: 20, backgroundColor: '#FFF', width: 85, ...designSystem.shadows.sm },
  miniUserCardActive: { backgroundColor: '#6366F1' },
  miniAvatar: { width: 44, height: 44, borderRadius: 14, marginBottom: 8 },
  miniUserName: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  miniUserNameActive: { color: '#FFFFFF' },
  diagFileSection: { marginTop: 8 },
  diagLabel: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 16 },
  diagFileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  diagFileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 12, borderRadius: 16, gap: 8, minWidth: '45%' },
  diagFileItemActive: { backgroundColor: '#6366F1' },
  diagFileName: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  diagFileNameActive: { color: '#FFFFFF' },
  diagViewPanel: { marginTop: 24, backgroundColor: '#FFF', borderRadius: 24, ...designSystem.shadows.md, overflow: 'hidden' },
  diagViewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  diagViewTitle: { fontSize: 12, fontWeight: '900', color: '#1E293B', textTransform: 'uppercase' },
  diagDownloadBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6, backgroundColor: '#10B981' },
  diagDownloadText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  diagScrollArea: { maxHeight: 400, padding: 16 },
  diagMetaRow: { flexDirection: 'row', marginBottom: 6, gap: 10 },
  diagMetaLabel: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  diagMetaValue: { fontSize: 11, color: '#1E293B', fontWeight: '700' },
  diagLogBox: { marginTop: 16, backgroundColor: '#0F172A', borderRadius: 16, padding: 16 },
  diagLogLine: { flexDirection: 'row', marginBottom: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1E293B', paddingBottom: 6 },
  diagLogTime: { fontSize: 9, color: '#94A3B8' },
  diagLogLevel: { fontSize: 9, fontWeight: '900' },
  diagLogMsg: { flex: 1, fontSize: 10, color: '#E2E8F0' },
  sheetContent: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%', backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, ...designSystem.shadows.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  sheetScroll: { flex: 1, padding: 24 },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16 },
  insightLabel: { fontSize: 14, fontWeight: '700', color: '#334155' },
  insightCount: { fontSize: 16, fontWeight: '900', color: '#6366F1' },
  sheetFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 32, borderTopWidth: 1, borderTopColor: '#F8FAFC' },
  footerLabel: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' },
  footerValue: { fontSize: 18, color: '#0F172A', fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  modalSubtitle: { fontSize: 12, color: '#64748B' },
  modalInput: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, height: 120, textAlignVertical: 'top', fontSize: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalCancel: { flex: 1, paddingVertical: 14, backgroundColor: '#F1F5F9', borderRadius: 12, alignItems: 'center' },
  modalCancelText: { fontWeight: '700', color: '#64748B' },
  modalSubmit: { flex: 1.5, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalSubmitText: { fontWeight: '900', color: '#FFFFFF' },
  documentGrid: { flexDirection: 'row', gap: 12, marginTop: 8 },
  docBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 12, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  docBtnText: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  reasonBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  reasonLabel: { fontSize: 10, fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  detailSection: { marginBottom: 24 },
  detailLabel: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1 },
  detailValue: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  detailSubValue: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '600' },
  analyticsTable: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  tableHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableHeadText: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  rowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tableRowLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  countBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  countBadgeText: { fontSize: 13, fontWeight: '900' },
  academyBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF2FF', padding: 16, borderRadius: 16 },
  academyNameDetail: { fontSize: 15, fontWeight: '800', color: '#6366F1' },
  drillDownHeader: { padding: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backBtnText: { fontSize: 12, fontWeight: '800', color: '#6366F1' },
  drillDownTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  coachListRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 16 },
  coachSmallAvatar: { width: 40, height: 40, borderRadius: 12 },
  coachNameText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  coachMetaText: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 1 },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    gap: 4,
  },
  syncOnline: { backgroundColor: '#F0FDF4' },
  syncOffline: { backgroundColor: '#FEF2F2' },
  syncLocal: { backgroundColor: '#FFF7ED' },
  syncText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  lastSyncText: { fontSize: 8, color: '#E0E7FF', marginTop: 4, fontWeight: '600' },
  tabContainer: { backgroundColor: '#F8FAFC', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tabScroll: { paddingHorizontal: 20, gap: 10 },
  premiumTab: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 14, 
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...designSystem.shadows.sm
  },
  premiumTabActive: { 
    backgroundColor: '#6366F1',
    borderColor: '#4F46E5'
  },
  premiumTabText: { fontSize: 13, fontWeight: '700', color: '#64748B', marginLeft: 4 },
  premiumTabTextActive: { color: '#FFFFFF' },
  premiumBadge: {
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF'
  },
  premiumBadgeText: { 
    color: '#FFFFFF', 
    fontSize: 9, 
    fontWeight: '900' 
  },
});

export default AdminHubScreen;
