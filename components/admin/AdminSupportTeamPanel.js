import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';
import { usePlayers } from '../../context/PlayerContext';
import SafeAvatar from '../SafeAvatar';

const AdminSupportTeamPanel = () => {
  const { players } = usePlayers();
  
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManaging, setIsManaging] = useState(null);
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'ex-employees'

  const fetchTeamAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    try {
       const res = await fetch(`${config.API_BASE_URL}/api/support/analytics`, {
         headers: { 'x-ace-api-key': config.ACE_API_KEY, 'x-user-id': 'admin' }
       });
       if (res.ok) {
         const data = await res.json();
         setAnalytics(data);
       }
    } catch (e) {
       console.warn("Failed to fetch analytics");
    } finally {
       setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamAnalytics();
  }, [fetchTeamAnalytics]);

  const updateUserStatus = async (userId, status, level) => {
    setIsManaging(userId);
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/manage-user`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-ace-api-key': config.ACE_API_KEY, 
          'x-user-id': 'admin' 
        },
        body: JSON.stringify({ targetUserId: userId, status, level })
      });
      if (res.ok) {
        fetchTeamAnalytics();
        Alert.alert("Success", "Employee profile updated successfully.");
      } else {
        const data = await res.json();
        Alert.alert("Error", data.error || "Failed to update user");
      }
    } catch (e) {
      Alert.alert("Network Error", e.message);
    } finally {
      setIsManaging(null);
    }
  };

  const handleForceReset = async (userId) => {
    Alert.alert(
      "Force Password Reset",
      "This will generate a random secure password and email it to the employee. All current sessions will be terminated. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset Password", style: "destructive", onPress: async () => {
          setIsManaging(userId);
          try {
            const res = await fetch(`${config.API_BASE_URL}/api/support/force-reset`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'x-ace-api-key': config.ACE_API_KEY, 
                'x-user-id': 'admin' 
              },
              body: JSON.stringify({ targetUserId: userId })
            });
            if (res.ok) {
              Alert.alert("Success", "Password reset successfully. Credentials sent to employee.");
            } else {
              const data = await res.json();
              Alert.alert("Error", data.error || "Failed to reset password");
            }
          } catch (e) {
            Alert.alert("Error", e.message);
          } finally {
            setIsManaging(null);
          }
        }}
      ]
    );
  };

  // Split support agents into active & terminated
  const allSupportAgents = useMemo(() => {
    return (players || []).filter(p => p.role === 'support');
  }, [players]);

  const activeAgents = useMemo(() => {
    return allSupportAgents.filter(a => a.supportStatus !== 'terminated');
  }, [allSupportAgents]);

  const exEmployees = useMemo(() => {
    return allSupportAgents.filter(a => a.supportStatus === 'terminated');
  }, [allSupportAgents]);

  const displayedAgents = activeTab === 'employees' ? activeAgents : exEmployees;

  const filteredAgents = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return displayedAgents;
    return displayedAgents.filter(a => 
      a.name?.toLowerCase().includes(s) || 
      a.id?.toLowerCase().includes(s) || 
      a.email?.toLowerCase().includes(s)
    );
  }, [displayedAgents, search]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return allSupportAgents.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, allSupportAgents]);

  const selectedAgentStats = useMemo(() => {
    if (!selectedAgentId || !analytics?.leaderboard) return null;
    return analytics.leaderboard.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, analytics]);

  const isSelectedTerminated = selectedAgent?.supportStatus === 'terminated';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Support Team</Text>
          <Text style={styles.subTitle}>Onboarded Personnel & KPI Audit</Text>
        </View>
        <TouchableOpacity onPress={fetchTeamAnalytics} disabled={isRefreshing}>
          <Ionicons name="refresh-circle" size={28} color="#6366F1" style={isRefreshing && { opacity: 0.5 }} />
        </TouchableOpacity>
      </View>

      {/* Sub-Tabs: Employees / Ex-Employees */}
      <View style={styles.subTabRow}>
        <TouchableOpacity 
          onPress={() => { setActiveTab('employees'); setSelectedAgentId(null); }}
          style={[styles.subTab, activeTab === 'employees' && styles.subTabActive]}
        >
          <Ionicons name="people" size={16} color={activeTab === 'employees' ? '#FFFFFF' : '#64748B'} />
          <Text style={[styles.subTabText, activeTab === 'employees' && styles.subTabTextActive]}>
            Employees ({activeAgents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => { setActiveTab('ex-employees'); setSelectedAgentId(null); }}
          style={[styles.subTab, activeTab === 'ex-employees' && styles.subTabActive, activeTab === 'ex-employees' && styles.subTabTerminated]}
        >
          <Ionicons name="person-remove" size={16} color={activeTab === 'ex-employees' ? '#FFFFFF' : '#94A3B8'} />
          <Text style={[styles.subTabText, activeTab === 'ex-employees' && styles.subTabTextActive]}>
            Ex-Employees ({exEmployees.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder={activeTab === 'employees' ? "Search active employees..." : "Search ex-employees..."}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Agent Avatars Row */}
      <View style={styles.userRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredAgents.map(agent => (
            <TouchableOpacity 
              key={agent.id} 
              onPress={() => setSelectedAgentId(agent.id)}
              style={[
                styles.miniCard, 
                selectedAgentId === agent.id && styles.miniCardActive,
                agent.supportStatus === 'terminated' && styles.miniCardTerminated
              ]}
            >
              <View style={agent.supportStatus === 'terminated' ? styles.avatarTerminated : null}>
                <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={40} borderRadius={12} />
              </View>
              <Text style={[
                styles.miniName, 
                selectedAgentId === agent.id && styles.miniNameActive,
                agent.supportStatus === 'terminated' && styles.miniNameTerminated
              ]} numberOfLines={1}>
                {agent.firstName || agent.name?.split(' ')[0]}
              </Text>
              <View style={[
                styles.statusDot, 
                { backgroundColor: agent.supportStatus === 'terminated' ? '#EF4444' : (agent.supportStatus === 'overwhelmed' ? '#F59E0B' : '#10B981') }
              ]} />
            </TouchableOpacity>
          ))}
          {filteredAgents.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name={activeTab === 'employees' ? 'people-outline' : 'filing-outline'} size={24} color="#CBD5E1" />
              <Text style={styles.emptyAgents}>
                {activeTab === 'employees' ? 'No active support employees found.' : 'No ex-employees found.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        {selectedAgent ? (
          <View style={[styles.detailCard, isSelectedTerminated && styles.detailCardTerminated]}>
            {/* Terminated Banner */}
            {isSelectedTerminated && (
              <View style={styles.terminatedBanner}>
                <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
                <Text style={styles.terminatedBannerText}>TERMINATED — Access Revoked</Text>
              </View>
            )}

            <View style={styles.detailHeader}>
              <View style={styles.detailAvatarBox}>
                <View style={isSelectedTerminated ? styles.avatarTerminated : null}>
                  <SafeAvatar uri={selectedAgent.avatar} name={selectedAgent.name} role={selectedAgent.role} size={64} borderRadius={20} />
                </View>
                <View style={styles.detailNameBox}>
                  <Text style={[styles.detailName, isSelectedTerminated && styles.textTerminated]}>{selectedAgent.name}</Text>
                  <Text style={styles.detailEmail}>{selectedAgent.email}</Text>
                  <View style={styles.levelRow}>
                    <Text style={[
                      styles.levelTag, 
                      isSelectedTerminated && styles.levelTagTerminated
                    ]}>
                      {selectedAgent.supportLevel || 'Trainee'}
                    </Text>
                    <View style={[
                      styles.statusPill,
                      { backgroundColor: isSelectedTerminated ? '#FEE2E2' : (selectedAgent.supportStatus === 'overwhelmed' ? '#FEF3C7' : '#D1FAE5') }
                    ]}>
                      <View style={[
                        styles.statusPillDot, 
                        { backgroundColor: isSelectedTerminated ? '#EF4444' : (selectedAgent.supportStatus === 'overwhelmed' ? '#F59E0B' : '#10B981') }
                      ]} />
                      <Text style={[
                        styles.statusPillText,
                        { color: isSelectedTerminated ? '#DC2626' : (selectedAgent.supportStatus === 'overwhelmed' ? '#D97706' : '#059669') }
                      ]}>
                        {isSelectedTerminated ? 'Terminated' : (selectedAgent.supportStatus || 'Active')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Settings Button — only for ACTIVE employees */}
            {!isSelectedTerminated && (
              <TouchableOpacity 
                style={styles.settingsBtn}
                onPress={() => {
                     Alert.alert(
                       "Employee Actions",
                       `Manage ${selectedAgent.name}`,
                       [
                         { text: "Cancel", style: "cancel" },
                         { text: "Promote (Specialist)", onPress: () => updateUserStatus(selectedAgent.id, null, 'Specialist') },
                         { text: "Promote (Senior)", onPress: () => updateUserStatus(selectedAgent.id, null, 'Senior') },
                         { text: selectedAgent.supportStatus === 'overwhelmed' ? "Resume Distribution" : "Pause Distribution", onPress: () => updateUserStatus(selectedAgent.id, selectedAgent.supportStatus === 'overwhelmed' ? 'active' : 'overwhelmed') },
                         { text: "Terminate Access", style: 'destructive', onPress: () => {
                           Alert.alert("Confirm Termination", "This will unassign all tickets instantly and revoke dashboard access. The employee will be moved to Ex-Employees. Proceed?", [
                             { text: "Cancel" },
                             { text: "Terminate", style: 'destructive', onPress: () => updateUserStatus(selectedAgent.id, 'terminated') }
                           ])
                         }},
                         { text: "Reset Password", onPress: () => handleForceReset(selectedAgent.id) }
                       ]
                     )
                  }}
                >
                  <Ionicons name="settings" size={20} color="#6366F1" />
              </TouchableOpacity>
            )}

            {/* Re-Onboard Button — only for TERMINATED employees */}
            {isSelectedTerminated && (
              <TouchableOpacity 
                style={styles.reOnboardBtn}
                onPress={() => {
                  Alert.alert(
                    "Re-Onboard Employee",
                    `This will restore ${selectedAgent.name}'s access and move them back to the active Employees list. Proceed?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Re-Onboard", onPress: () => updateUserStatus(selectedAgent.id, 'active') }
                    ]
                  );
                }}
              >
                <Ionicons name="person-add" size={16} color="#FFFFFF" />
                <Text style={styles.reOnboardText}>Re-Onboard</Text>
              </TouchableOpacity>
            )}

            {/* Performance Insights */}
            <View style={styles.statsGrid}>
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>WEIGHTED SCORE</Text>
                 <Text style={[styles.statValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.score || '0.0'}</Text>
               </View>
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>TICKETS CLOSED</Text>
                 <Text style={[styles.statValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.stats?.closedTickets || 0}</Text>
               </View>
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>AVG RATING</Text>
                 <Text style={[styles.statValue, { color: isSelectedTerminated ? '#94A3B8' : '#F59E0B' }]}>★ {selectedAgentStats?.stats?.avgRating || 'N/A'}</Text>
               </View>
            </View>

            <View style={styles.metricsList}>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Total Handled</Text>
                 <Text style={[styles.mValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.stats?.totalHandled || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Manual Pool Picks</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#10B981' }]}>+{selectedAgentStats?.stats?.manualPicks || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Onboarded Via</Text>
                 <Text style={styles.mValue}>{selectedAgent.onboardedVia || 'Invite'}</Text>
               </View>
               {isSelectedTerminated && selectedAgent.terminatedAt && (
                 <View style={styles.metricRow}>
                   <Text style={styles.mLabel}>Terminated On</Text>
                   <Text style={[styles.mValue, { color: '#EF4444' }]}>
                     {new Date(selectedAgent.terminatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                   </Text>
                 </View>
               )}
            </View>
          </View>
        ) : (
          <View style={styles.selectHint}>
            <Ionicons name={activeTab === 'employees' ? 'finger-print-outline' : 'archive-outline'} size={48} color="#E2E8F0" />
            <Text style={styles.selectHintText}>
              {activeTab === 'employees' 
                ? 'Select an agent above for deep diagnostics' 
                : 'Select an ex-employee to view their history'}
            </Text>
          </View>
        )}

        {/* Global Leaderboard Section — only in Employees tab */}
        {activeTab === 'employees' && (
          <View style={styles.leaderboardSection}>
            <Text style={styles.leaderboardTitle}>Team Performance Leaderboard</Text>
            {analytics?.leaderboard?.map((entry, idx) => (
              <View key={entry.id} style={[styles.leaderboardItem, selectedAgentId === entry.id && styles.leaderboardItemActive]}>
                <Text style={styles.rankText}>#{idx + 1}</Text>
                <Text style={styles.rankName} numberOfLines={1}>{entry.name}</Text>
                <View style={styles.rankScoreBox}>
                  <Text style={styles.rankScore}>{entry.score}</Text>
                  <Text style={styles.rankScoreUnits}>pts</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },

  // Sub-Tabs
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  subTab: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 16, paddingVertical: 10, 
    borderRadius: 12, backgroundColor: '#F1F5F9', 
    borderWidth: 1, borderColor: '#E2E8F0' 
  },
  subTabActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  subTabTerminated: { backgroundColor: '#EF4444', borderColor: '#DC2626' },
  subTabText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  subTabTextActive: { color: '#FFFFFF' },

  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', fontWeight: '600' },

  // Agent Row
  userRowContainer: { marginBottom: 24 },
  miniCard: { width: 70, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniCardActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  miniCardTerminated: { opacity: 0.7, borderColor: '#FCA5A5' },
  miniName: { fontSize: 9, fontWeight: '800', color: '#64748B', marginTop: 4, textAlign: 'center' },
  miniNameActive: { color: '#FFF' },
  miniNameTerminated: { color: '#94A3B8' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#FFF' },
  avatarTerminated: { opacity: 0.5 },
  emptyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8 },
  emptyAgents: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  // Detail Card
  mainContent: { flex: 1 },
  detailCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...shadows.md, borderWidth: 1, borderColor: '#F1F5F9' },
  detailCardTerminated: { borderColor: '#FCA5A5', backgroundColor: '#FFFBFB' },
  detailHeader: { flexDirection: 'row', alignItems: 'center' },
  detailAvatarBox: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 40 },
  detailNameBox: { flex: 1 },
  detailName: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  detailEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  textTerminated: { color: '#94A3B8' },
  textMuted: { color: '#94A3B8' },

  // Level & Status
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  levelTag: { fontSize: 10, fontWeight: '800', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'uppercase' },
  levelTagTerminated: { color: '#94A3B8', backgroundColor: '#F1F5F9' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  // Terminated Banner
  terminatedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EF4444', paddingVertical: 8, borderRadius: 12, marginBottom: 16 },
  terminatedBannerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Action Buttons
  settingsBtn: { position: 'absolute', top: 20, right: 20, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', zIndex: 10 },
  reOnboardBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, marginTop: 4,
    ...shadows.sm
  },
  reOnboardText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 12, marginTop: 24 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statBoxTerminated: { backgroundColor: '#FAFAFA', borderColor: '#F1F5F9' },
  statLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  // Metrics
  metricsList: { marginTop: 20, gap: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  mValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // Select Hint
  selectHint: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 },
  selectHintText: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 12, textAlign: 'center' },

  // Leaderboard
  leaderboardSection: { marginTop: 32, marginBottom: 20 },
  leaderboardTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  leaderboardItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  leaderboardItemActive: { borderColor: '#6366F1', backgroundColor: '#F5F3FF' },
  rankText: { fontSize: 12, fontWeight: '900', color: '#94A3B8', width: 30 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1E293B' },
  rankScoreBox: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  rankScore: { fontSize: 16, fontWeight: '900', color: '#6366F1' },
  rankScoreUnits: { fontSize: 10, fontWeight: '700', color: '#94A3B8' }
});

export default AdminSupportTeamPanel;
