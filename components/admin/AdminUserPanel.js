import React, { useMemo, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PlayerDashboardView from '../PlayerDashboardView';
import { usePlayers } from '../../context/PlayerContext';
import { useTournaments } from '../../context/TournamentContext';

const AdminUserPanel = memo(({ subTab, search }) => {
  const { players } = usePlayers();
  const { tournaments } = useTournaments();
  const [selectedAcademy, setSelectedAcademy] = useState(null);

  const filterData = (data, field = 'name') => {
    if (!data) return [];
    if (!search) return data;
    const s = search.toLowerCase().trim();
    return data.filter(item => 
      (item[field] || '').toLowerCase().includes(s) ||
      (item.id || '').toLowerCase().includes(s) ||
      (item.email || '').toLowerCase().includes(s)
    );
  };

  const filteredIndividuals = useMemo(() => 
    filterData((players || []).filter(p => !p.role || p.role === 'user')), 
    [players, search]
  );

  const filteredAcademies = useMemo(() => 
    filterData((players || []).filter(p => p.role === 'academy')), 
    [players, search]
  );

  const calculateAcademyStats = (uid) => {
    const academyTs = (tournaments || []).filter(t => t.creatorId === uid);
    const hostedCount = academyTs.length;
    const liveCount = academyTs.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
    
    let tier = 'Bronze';
    if (hostedCount >= 10) tier = 'Gold';
    else if (hostedCount >= 5) tier = 'Silver';

    const sportsBreakdown = {};
    academyTs.forEach(t => {
      sportsBreakdown[t.sport] = (sportsBreakdown[t.sport] || 0) + 1;
    });

    return { hostedCount, liveCount, tier, sportsBreakdown };
  };

  if (subTab === 'individuals') {
    return (
      <View style={{ flex: 1 }}>
        <PlayerDashboardView players={filteredIndividuals} tournaments={tournaments} title="Individuals" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {filteredAcademies.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No matching academies found</Text>
        </View>
      ) : (
        filteredAcademies.map(a => {
          const stats = calculateAcademyStats(a.id);
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
                  <Text style={styles.initialsText}>{a.name?.[0]?.toUpperCase() || 'A'}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{a.name}</Text>
                  <View style={[styles.tierBadge, { 
                    backgroundColor: stats.tier === 'Gold' ? '#FEF9C3' : 
                                     stats.tier === 'Silver' ? '#F1F5F9' : '#FFEDD5' 
                  }]}>
                    <Text style={[styles.tierText, { 
                      color: stats.tier === 'Gold' ? '#A16207' : 
                             stats.tier === 'Silver' ? '#475569' : '#C2410C' 
                    }]}>
                      {stats.tier} Tier
                    </Text>
                  </View>
                </View>
                <View style={styles.statsInline}>
                  <View style={styles.inlineStat}>
                    <Text style={styles.inlineValue}>{stats.liveCount}</Text>
                    <Text style={styles.inlineLabel}>Live</Text>
                  </View>
                  <View style={[styles.inlineStat, { marginLeft: 12 }]}>
                    <Text style={styles.inlineValue}>{stats.hostedCount}</Text>
                    <Text style={styles.inlineLabel}>Total</Text>
                  </View>
                </View>
              </View>

              {isSelected && (
                <View style={styles.expandedContent}>
                  <View style={styles.detailsBlock}>
                    <Text style={styles.blockLabel}>Registration Details</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>UID</Text>
                      <Text style={styles.detailValue}>{a.id}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Email</Text>
                      <Text style={styles.detailValue}>{a.email}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Phone</Text>
                      <Text style={styles.detailValue}>{a.phone || 'N/A'}</Text>
                    </View>
                  </View>

                  <View style={styles.gridStats}>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Sports Coverage</Text>
                      <Text style={styles.gridStatValue}>
                        {Object.keys(stats.sportsBreakdown).join(', ') || 'None'}
                      </Text>
                    </View>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Joined</Text>
                      <Text style={styles.gridStatValue}>
                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : 'Legacy'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    onPress={() => Linking.openURL(`mailto:${a.email}`)}
                    style={styles.contactBtn}
                  >
                    <Ionicons name="mail-outline" size={16} color="#6366F1" style={{ marginRight: 8 }} />
                    <Text style={styles.contactBtnText}>Contact Academy Admin</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16 },
  adminCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#6366F1', elevation: 2 },
  cardActive: { borderLeftColor: '#10B981' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 16, marginRight: 14 },
  initialsBox: { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  initialsText: { fontSize: 18, fontWeight: '800', color: '#6366F1' },
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  tierText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statsInline: { flexDirection: 'row', alignItems: 'center' },
  inlineStat: { alignItems: 'center' },
  inlineValue: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  inlineLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  expandedContent: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  detailsBlock: { marginBottom: 16 },
  blockLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailTitle: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  gridStats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  gridStatBox: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC' },
  gridStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', marginBottom: 4 },
  gridStatValue: { fontSize: 11, color: '#1E293B', fontWeight: '800' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', padding: 14, borderRadius: 16 },
  contactBtnText: { color: '#6366F1', fontWeight: '800', fontSize: 13 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' }
});

export default AdminUserPanel;
