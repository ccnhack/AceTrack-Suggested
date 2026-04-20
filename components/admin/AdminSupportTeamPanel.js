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

  const supportAgents = useMemo(() => {
    return (players || []).filter(p => p.role === 'support');
  }, [players]);

  const filteredAgents = useMemo(() => {
    const s = search.toLowerCase().trim();
    return supportAgents.filter(a => 
      a.name?.toLowerCase().includes(s) || 
      a.id?.toLowerCase().includes(s) || 
      a.email?.toLowerCase().includes(s)
    );
  }, [supportAgents, search]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return supportAgents.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, supportAgents]);

  const selectedAgentStats = useMemo(() => {
    if (!selectedAgentId || !analytics?.leaderboard) return null;
    return analytics.leaderboard.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, analytics]);

  return (
    <View style={styles.container}>
      {/* 🛡️ Diagnostic Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Support Team</Text>
          <Text style={styles.subTitle}>Onboarded Personnel & KPI Audit</Text>
        </View>
        <TouchableOpacity onPress={fetchTeamAnalytics} disabled={isRefreshing}>
          <Ionicons name="refresh-circle" size={28} color="#6366F1" style={isRefreshing && { opacity: 0.5 }} />
        </TouchableOpacity>
      </View>

      {/* 🔍 Search Agent Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder="Search onboarded employees..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {/* 🏃‍♂️ Diagnostic User Row */}
      <View style={styles.userRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredAgents.map(agent => (
            <TouchableOpacity 
              key={agent.id} 
              onPress={() => setSelectedAgentId(agent.id)}
              style={[styles.miniCard, selectedAgentId === agent.id && styles.miniCardActive]}
            >
              <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={40} borderRadius={12} />
              <Text style={[styles.miniName, selectedAgentId === agent.id && styles.miniNameActive]} numberOfLines={1}>
                {agent.firstName || agent.name?.split(' ')[0]}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: agent.supportStatus === 'terminated' ? '#EF4444' : (agent.supportStatus === 'overwhelmed' ? '#F59E0B' : '#10B981') }]} />
            </TouchableOpacity>
          ))}
          {filteredAgents.length === 0 && <Text style={styles.emptyAgents}>No onboarded support found.</Text>}
        </ScrollView>
      </View>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        {selectedAgent ? (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View style={styles.detailAvatarBox}>
                <SafeAvatar uri={selectedAgent.avatar} name={selectedAgent.name} role={selectedAgent.role} size={64} borderRadius={20} />
                <View style={styles.detailNameBox}>
                  <Text style={styles.detailName}>{selectedAgent.name}</Text>
                  <Text style={styles.detailEmail}>{selectedAgent.email}</Text>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelTag}>{selectedAgent.supportLevel || 'Trainee'}</Text>
                    <Text style={styles.statusLabel}>{selectedAgent.supportStatus || 'active'}</Text>
                  </View>
                </View>
              </View>

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
                         Alert.alert("Confirm Termination", "This will unassign all tickets instantly. Proceed?", [
                           { text: "Cancel" },
                           { text: "Terminate", style: 'destructive', onPress: () => updateUserStatus(selectedAgent.id, 'terminated') }
                         ])
                       }}
                     ]
                   )
                }}
              >
                <Ionicons name="settings" size={20} color="#6366F1" />
              </TouchableOpacity>
            </View>

            {/* Performance Insights */}
            <View style={styles.statsGrid}>
               <View style={styles.statBox}>
                 <Text style={styles.statLabel}>WEIGHTED SCORE</Text>
                 <Text style={styles.statValue}>{selectedAgentStats?.score || '0.0'}</Text>
               </View>
               <View style={styles.statBox}>
                 <Text style={styles.statLabel}>TICKETS CLOSED</Text>
                 <Text style={styles.statValue}>{selectedAgentStats?.stats?.closedTickets || 0}</Text>
               </View>
               <View style={styles.statBox}>
                 <Text style={styles.statLabel}>AVG RATING</Text>
                 <Text style={[styles.statValue, { color: '#F59E0B' }]}>★ {selectedAgentStats?.stats?.avgRating || 'N/A'}</Text>
               </View>
            </View>

            <View style={styles.metricsList}>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Total Handled</Text>
                 <Text style={styles.mValue}>{selectedAgentStats?.stats?.totalHandled || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Manual Pool Picks</Text>
                 <Text style={[styles.mValue, { color: '#10B981' }]}>+{selectedAgentStats?.stats?.manualPicks || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Onboarded Via</Text>
                 <Text style={styles.mValue}>{selectedAgent.onboardedVia || 'Invite'}</Text>
               </View>
            </View>
          </View>
        ) : (
          <View style={styles.selectHint}>
            <Ionicons name="finger-print-outline" size={48} color="#E2E8F0" />
            <Text style={styles.selectHintText}>Select an agent above for deep diagnostics</Text>
          </View>
        )}

        {/* Global Leaderboard Section */}
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', fontWeight: '600' },
  userRowContainer: { marginBottom: 24 },
  miniCard: { width: 70, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniCardActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  miniName: { fontSize: 9, fontWeight: '800', color: '#64748B', marginTop: 4, textAlign: 'center' },
  miniNameActive: { color: '#FFF' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#FFF' },
  emptyAgents: { fontSize: 12, color: '#94A3B8', marginTop: 12, marginLeft: 8, fontStyle: 'italic' },
  mainContent: { flex: 1 },
  detailCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...shadows.md, borderWidth: 1, borderColor: '#F1F5F9' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailAvatarBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailNameBox: { flex: 1 },
  detailName: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  detailEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  levelTag: { fontSize: 10, fontWeight: '800', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'uppercase' },
  statusLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'capitalize' },
  settingsBtn: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12 },
  statsGrid: { flexDirection: 'row', gap: 12, marginTop: 24 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  metricsList: { marginTop: 20, gap: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  mValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  selectHint: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 },
  selectHintText: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 12 },
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
