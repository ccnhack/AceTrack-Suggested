import React, { useMemo, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTournaments } from '../../context/TournamentContext';
import { usePlayers } from '../../context/PlayerContext';

const AdminTournamentPanel = memo(({ search }) => {
  const { tournaments } = useTournaments();
  const { players } = usePlayers();
  const [tournamentSubTab, setTournamentSubTab] = useState('upcoming');
  const today = new Date().toISOString().split('T')[0];

  const filteredTournaments = useMemo(() => {
    return (tournaments || []).filter(t => {
      const isUpcoming = t.date >= today;
      if (tournamentSubTab === 'upcoming' && !isUpcoming) return false;
      if (tournamentSubTab === 'past' && isUpcoming) return false;
      
      if (!search) return true;
      const s = search.toLowerCase();
      const creator = (players || []).find(p => p.id === t.creatorId);
      return (t.title || '').toLowerCase().includes(s) ||
             (t.id || '').toLowerCase().includes(s) ||
             (creator?.name || '').toLowerCase().includes(s);
    });
  }, [tournaments, today, tournamentSubTab, search, players]);

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        {['upcoming', 'past'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            onPress={() => setTournamentSubTab(tab)}
            style={[styles.tab, tournamentSubTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, tournamentSubTab === tab && styles.tabTextActive]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredTournaments.length === 0 ? (
        <View style={styles.emptyContainer}><Text style={styles.emptyText}>No tournaments found</Text></View>
      ) : (
        filteredTournaments.map(t => (
          <View key={t.id} style={styles.adminCard}>
            <View style={styles.cardHeader}>
               <View style={styles.flex}>
                 <Text style={styles.cardTitle}>{t.title}</Text>
                 <Text style={styles.cardSubtitle}>{t.date} • {t.sport}</Text>
               </View>
               <View style={[styles.statusBadge, { backgroundColor: t.status === 'completed' ? '#F1F5F9' : '#DCFCE7' }]}>
                 <Text style={styles.statusText}>{t.status?.toUpperCase()}</Text>
               </View>
            </View>
            <View style={styles.metadata}>
              <Text style={styles.metaText}>ID: {t.id}</Text>
              <Text style={styles.metaText}>Participants: {t.participants?.length || 0}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabHeader: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  tabTextActive: { color: '#6366F1' },
  adminCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  metadata: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
  metaText: { fontSize: 11, color: '#94A3B8' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#94A3B8' }
});

export default AdminTournamentPanel;
