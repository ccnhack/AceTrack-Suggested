import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Image, TextInput, Modal, Alert, Linking, Platform, Share,
  ActivityIndicator, Dimensions, useWindowDimensions, LayoutAnimation
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, shadows } from '../theme/designSystem';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Domain Modular Components
import AdminUserPanel from '../components/admin/AdminUserPanel';
import AdminCoachPanel from '../components/admin/AdminCoachPanel';
import AdminTournamentPanel from '../components/admin/AdminTournamentPanel';
import AdminDiagnosticsPanel from '../components/admin/AdminDiagnosticsPanel';
import AdminAuditLogsPanel from '../components/AdminAuditLogsPanel';
import AdminRecordingsDashboard from '../components/AdminRecordingsDashboard';
import { AdminGrievancesPanel } from '../components/AdminGrievancesPanel';
import AdminAssignmentPanel from '../components/admin/AdminAssignmentPanel';
import AdminMatchesPanel from '../components/admin/AdminMatchesPanel';
import AdminEvaluationsPanel from '../components/admin/AdminEvaluationsPanel';
import AdminPaymentsPanel from '../components/admin/AdminPaymentsPanel';
import AdminStaffPanel from '../components/admin/AdminStaffPanel';

// Context Hooks
import { usePlayers } from '../context/PlayerContext';
import { useTournaments } from '../context/TournamentContext';
import { useVideos } from '../context/VideoContext';
import { useSupport } from '../context/SupportContext';
import { useAdmin } from '../context/AdminContext';
import { useSync } from '../context/SyncContext';
import { useMatchmaking } from '../context/MatchmakingContext';
import { useEvaluations } from '../context/EvaluationContext';

const AdminHubScreen = ({ navigation, route }) => {
  const { players } = usePlayers();
  const { tournaments, onUpdateTournament, onRemovePendingPlayer } = useTournaments();
  const { matchVideos, onUpdateVideoStatus, onBulkUpdateVideoStatus, onForceRefundVideo, onApproveDeleteVideo, onRejectDeleteVideo, onPermanentDeleteVideo, onBulkPermanentDeleteVideos } = useVideos();
  const { supportTickets, onReplyTicket, onUpdateTicketStatus } = useSupport();
  const { matchmaking } = useMatchmaking();
  const { evaluations } = useEvaluations();
  const { seenAdminActionIds = new Set(), setSeenAdminActionIds, auditLogs, hasSeen, hasVisited, setVisitedAdminSubTabs, visitedAdminSubTabs = new Set() } = useAdmin();
  const { isCloudOnline, isUsingCloud, lastSyncTime, onManualSync } = useSync();

  const [subTab, setSubTab] = useState('individuals');
  const [search, setSearch] = useState('');
  const [autoSelectUser, setAutoSelectUser] = useState(null);
  const [autoSelectTicketId, setAutoSelectTicketId] = useState(null);
  const { width: windowWidth } = useWindowDimensions();
  const today = new Date().toISOString().split('T')[0];

  const badges = useMemo(() => {
    return {
      coaches: (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !p.isApprovedCoach && !seenAdminActionIds.has(String(p.id))).length,
      recordings: (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && !seenAdminActionIds.has(String(v.id))).length,
      grievances: (supportTickets || []).filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !seenAdminActionIds.has(String(t.id))).length,
      assignments: (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today) && !seenAdminActionIds.has(String(t.id))).length,
      payments: (tournaments || []).reduce((acc, t) => acc + (t.pendingPaymentPlayerIds || []).filter(pid => !seenAdminActionIds.has(`${t.id}-${pid}`)).length, 0),
      matches: (matchmaking || []).filter(m => m.status === 'pending' && !seenAdminActionIds.has(String(m.id))).length
    };
  }, [players, matchVideos, supportTickets, tournaments, matchmaking, seenAdminActionIds, today]);

  const handleTabChange = (newTab) => {
    if (newTab === subTab) return;
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSubTab(newTab);
    setSearch('');

    // Mark as visited logic
    if (setVisitedAdminSubTabs) {
      setVisitedAdminSubTabs(prev => {
        const next = new Set(prev);
        next.add(newTab);
        return next;
      });
    }

    // Auto-clear item-specific badges when entering a tab by adding its items to seen set
    if (setSeenAdminActionIds) {
      const newSeen = new Set(seenAdminActionIds);
      let changed = false;
      if (newTab === 'coaches') {
        (players || []).filter(p => p.role === 'coach').forEach(p => { if (!newSeen.has(String(p.id))) { newSeen.add(String(p.id)); changed = true; } });
      } else if (newTab === 'recordings') {
        (matchVideos || []).forEach(v => { if (!newSeen.has(String(v.id))) { newSeen.add(String(v.id)); changed = true; } });
      } else if (newTab === 'grievances') {
        (supportTickets || []).forEach(t => { if (!newSeen.has(String(t.id))) { newSeen.add(String(t.id)); changed = true; } });
      } else if (newTab === 'assignments') {
        (tournaments || []).forEach(t => { if (!newSeen.has(String(t.id))) { newSeen.add(String(t.id)); changed = true; } });
      } else if (newTab === 'matches') {
        (matchmaking || []).forEach(m => { if (!newSeen.has(String(m.id))) { newSeen.add(String(m.id)); changed = true; } });
      } else if (newTab === 'payments') {
        (tournaments || []).forEach(t => {
          (t.pendingPaymentPlayerIds || []).forEach(pid => {
            const composite = `${t.id}-${pid}`;
            if (!newSeen.has(composite)) { newSeen.add(composite); changed = true; }
          });
        });
      }
      if (changed) setSeenAdminActionIds(newSeen);
    }
  };

  useEffect(() => {
    if (route.params?.subTab || route.params?.autoSelectSubTab) {
        handleTabChange(route.params.subTab || route.params.autoSelectSubTab);
    }
    if (route.params?.autoSelectUser) {
        setAutoSelectUser(route.params.autoSelectUser);
    }
    if (route.params?.autoSelectTicketId) {
        setAutoSelectTicketId(route.params.autoSelectTicketId);
    }
    
    if (route.params?.subTab || route.params?.autoSelectSubTab || route.params?.autoSelectUser || route.params?.autoSelectTicketId) {
        navigation.setParams({ 
            subTab: undefined, 
            autoSelectSubTab: undefined,
            autoSelectUser: undefined,
            autoSelectTicketId: undefined
        });
    }
  }, [route.params]);

  const renderContent = () => {
    switch(subTab) {
      case 'individuals':
      case 'academies':
        return <AdminUserPanel subTab={subTab} search={search} />;
      case 'coaches':
        return <AdminCoachPanel search={search} />;
      case 'tournaments':
        return <AdminTournamentPanel search={search} />;
      case 'matches':
        return <AdminMatchesPanel search={search} />;
      case 'evaluations':
        return <AdminEvaluationsPanel search={search} />;
      case 'payments':
        return <AdminPaymentsPanel search={search} />;
      case 'diagnostics':
        return <AdminDiagnosticsPanel autoSelectUser={autoSelectUser} />;
      case 'staff':
        return <AdminStaffPanel />;
      case 'grievances':
        return (
          <AdminGrievancesPanel 
            tickets={supportTickets || []}
            players={players || []}
            onReply={onReplyTicket}
            onUpdateStatus={onUpdateTicketStatus}
            seenAdminActionIds={seenAdminActionIds}
            autoSelectTicketId={autoSelectTicketId}
          />
        );
      case 'audit':
        return <AdminAuditLogsPanel logs={auditLogs} search={search} />;
      case 'recordings':
        return (
          <AdminRecordingsDashboard 
            matchVideos={matchVideos} 
            players={players}
            tournaments={tournaments}
            onUpdateVideoStatus={onUpdateVideoStatus}
            onBulkUpdateStatus={onBulkUpdateVideoStatus}
            onForceRefund={onForceRefundVideo}
            onApproveDeleteVideo={onApproveDeleteVideo}
            onRejectDeleteVideo={onRejectDeleteVideo}
            onPermanentDeleteVideo={onPermanentDeleteVideo}
            onBulkPermanentDeleteVideos={onBulkPermanentDeleteVideos}
          />
        );
      case 'assignments':
        return <AdminAssignmentPanel search={search} />;
      case 'security':
        return <AdminAuditLogsPanel logs={auditLogs.filter(l => l.type === 'security' || l.type?.toLowerCase().includes('alert'))} search={search} />;
      default:
        return (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Section {subTab} under migration...</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.premiumHeader}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumTitle}>Admin Hub</Text>
              <Text style={styles.premiumSubtitle}>System Overview & Management</Text>
              
              <View style={styles.badgeRow}>
                <TouchableOpacity 
                  testID="admin.sync.badge"
                  onPress={() => onManualSync?.(true, true)}
                  style={[styles.syncBadge, isCloudOnline ? styles.syncOnline : (isUsingCloud ? styles.syncOffline : styles.syncLocal)]}
                  accessibilityLabel={isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
                >
                  <Ionicons 
                    name={isCloudOnline ? "cloud-done" : (isUsingCloud ? "cloud-offline" : "server")} 
                    size={10} 
                    color={isCloudOnline ? "#FFF" : (isUsingCloud ? "#FFF" : "#FFF")} 
                  />
                  <Text style={styles.syncText}>
                    {isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
                  </Text>
                </TouchableOpacity>
                {lastSyncTime && <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>}
              </View>
            </View>
            <View style={styles.headerIcon}>
               <Ionicons name="shield-checkmark" size={24} color="#FFF" />
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'individuals', label: 'Individuals', icon: 'person' },
            { id: 'academies', label: 'Academies', icon: 'business' },
            { id: 'coaches', label: 'Coaches', icon: 'school', count: badges.coaches },
            { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
            { id: 'matches', label: 'Matches', icon: 'tennisball', count: badges.matches },
            { id: 'evaluations', label: 'Evaluations', icon: 'clipboard' },
            { id: 'payments', label: 'Payments', icon: 'card', count: badges.payments },
            { id: 'grievances', label: 'Tickets', icon: 'chatbubbles', count: badges.grievances },
            { id: 'recordings', label: 'Videos', icon: 'videocam', count: badges.recordings },
            { id: 'assignments', label: 'Assignments', icon: 'clipboard', count: badges.assignments },
            { id: 'audit', label: 'Audit', icon: 'list' },
            { id: 'security', label: 'Security', icon: 'shield-half' },
            { id: 'diagnostics', label: 'Diag', icon: 'pulse' },
            { id: 'staff', label: 'Staff', icon: 'people-circle-outline' },
          ].map(tab => {
            const isActive = subTab === tab.id;
            const showBadge = tab.count > 0 && (tab.id === 'grievances' || !visitedAdminSubTabs.has(tab.id));
            
            return (
              <TouchableOpacity 
                testID={`admin.tab.${tab.id}`}
                key={tab.id} 
                onPress={() => handleTabChange(tab.id)}
                style={[styles.premiumTab, isActive && styles.premiumTabActive]}
              >
                <Ionicons name={tab.icon} size={14} color={isActive ? '#FFF' : '#64748B'} style={{ marginRight: 6 }} />
                <Text style={[styles.premiumTabText, isActive && styles.premiumTabTextActive]}>{tab.label}</Text>
                {showBadge && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>{tab.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {subTab !== 'diagnostics' && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#94A3B8" />
          <TextInput 
            testID="admin.search.input"
            placeholder={subTab === 'grievances' ? "Search tickets..." : `Search ${subTab}...`}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      )}

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  premiumHeader: { paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  premiumTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  premiumSubtitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  syncOnline: { backgroundColor: '#10B981' },
  syncOffline: { backgroundColor: '#EF4444' },
  syncLocal: { backgroundColor: '#F59E0B' },
  syncText: { fontSize: 9, fontWeight: '900', color: '#FFF', marginLeft: 4, textTransform: 'uppercase' },
  lastSyncText: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  tabContainer: { height: 60, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: colors.navy[100], justifyContent: 'center' },
  tabScroll: { paddingHorizontal: 16, alignItems: 'center' },
  premiumTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, marginRight: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
  premiumTabActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5', elevation: 4 },
  premiumTabText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  premiumTabTextActive: { color: '#FFF' },
  premiumBadge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  premiumBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    margin: 16, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 20, 
    ...shadows.sm,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: colors.navy[900], fontWeight: '600' },
  content: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { color: colors.navy[400], fontSize: 14, fontWeight: '700' }
});

export default AdminHubScreen;
