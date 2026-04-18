import React, { useMemo, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMatchmaking } from '../../context/MatchmakingContext';
import { usePlayers } from '../../context/PlayerContext';
import { getSafeAvatar } from '../../utils/imageUtils';

const AdminMatchesPanel = memo(({ search }) => {
  const { matchmaking } = useMatchmaking();
  const { players } = usePlayers();
  const [matchSubTab, setMatchSubTab] = useState('active');

  const filteredMatches = useMemo(() => {
    return (matchmaking || []).filter(m => {
      const isActive = m.status !== 'completed' && m.status !== 'cancelled';
      if (matchSubTab === 'active' && !isActive) return false;
      if (matchSubTab === 'past' && isActive) return false;

      if (!search) return true;
      const s = search.toLowerCase();
      const challenger = (players || []).find(p => p.id === m.senderId);
      const receiver = (players || []).find(p => p.id === m.receiverId);
      return (m.id || '').toLowerCase().includes(s) ||
             (challenger?.name || '').toLowerCase().includes(s) ||
             (receiver?.name || '').toLowerCase().includes(s) ||
             (m.senderName || '').toLowerCase().includes(s) ||
             (m.receiverName || '').toLowerCase().includes(s) ||
             (m.sport || '').toLowerCase().includes(s);
    });
  }, [matchmaking, matchSubTab, search, players]);

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        {['active', 'past'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            onPress={() => setMatchSubTab(tab)}
            style={[styles.tab, matchSubTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, matchSubTab === tab && styles.tabTextActive]}>
              {tab.toUpperCase()} MATCHES
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredMatches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="tennisball-outline" size={48} color="#E2E8F0" />
          <Text style={styles.emptyText}>No {matchSubTab} matches found</Text>
        </View>
      ) : (
        filteredMatches.map(m => {
          const challenger = (players || []).find(p => p.id === m.senderId);
          const receiver = (players || []).find(p => p.id === m.receiverId);
          
          return (
            <View key={m.id} style={styles.adminCard}>
              <View style={styles.cardHeader}>
                 <View style={styles.matchStatus}>
                    <View style={[styles.statusDot, { backgroundColor: m.status === 'accepted' ? '#10B981' : (m.status === 'pending' ? '#F59E0B' : '#94A3B8') }]} />
                    <Text style={styles.statusLabel}>{m.status?.toUpperCase()}</Text>
                 </View>
                 <Text style={styles.sportTag}>{m.sport}</Text>
              </View>

              <View style={styles.pairingRow}>
                <View style={[styles.playerCol, { alignItems: 'flex-start' }]}>
                   <Image source={getSafeAvatar(challenger?.avatar, challenger?.name || m.senderName)} style={styles.matchAvatar} />
                   <Text style={styles.playerName} numberOfLines={1}>{challenger?.name || m.senderName || 'Unknown'}</Text>
                   <Text style={styles.playerRole}>Challenger</Text>
                </View>
                
                <View style={styles.vsCircle}>
                   <Text style={styles.vsText}>VS</Text>
                </View>

                <View style={[styles.playerCol, { alignItems: 'flex-end' }]}>
                   <Image source={getSafeAvatar(receiver?.avatar, receiver?.name || m.receiverName)} style={styles.matchAvatar} />
                   <Text style={[styles.playerName, { textAlign: 'right' }]} numberOfLines={1}>{receiver?.name || m.receiverName || 'Unknown'}</Text>
                   <Text style={styles.playerRole}>Receiver</Text>
                </View>
              </View>

              <View style={styles.metadata}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                  <Text style={styles.metaText}>{m.date}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={12} color="#94A3B8" />
                  <Text style={styles.metaText}>{m.time}</Text>
                </View>
                <View style={[styles.metaItem, { flex: 1, justifyContent: 'flex-end' }]}>
                  <Ionicons name="location-outline" size={12} color="#94A3B8" />
                  <Text style={styles.metaText} numberOfLines={1}>{m.venue}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabHeader: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  tabTextActive: { color: '#6366F1' },
  adminCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  matchStatus: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: '#475569' },
  sportTag: { fontSize: 10, fontWeight: '900', color: '#6366F1', textTransform: 'uppercase' },
  pairingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  playerCol: { flex: 1, gap: 4 },
  matchAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: '#FFF' },
  playerName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  playerRole: { fontSize: 9, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  vsCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderExth: 1, borderColor: '#E2E8F0' },
  vsText: { fontSize: 8, fontWeight: '900', color: '#94A3B8' },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#94A3B8', fontWeight: 'bold' }
});

export default AdminMatchesPanel;
