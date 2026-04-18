import React, { useMemo, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvaluations } from '../../context/EvaluationContext';
import { usePlayers } from '../../context/PlayerContext';
import { useTournaments } from '../../context/TournamentContext';
import { getSafeAvatar } from '../../utils/imageUtils';
import { shadows, colors } from '../../theme/designSystem';

const AdminEvaluationsPanel = memo(({ search }) => {
  const { evaluations } = useEvaluations();
  const { players } = usePlayers();
  const { tournaments } = useTournaments();

  const filteredEvaluations = useMemo(() => {
    return (evaluations || []).filter(e => {
      if (!search) return true;
      const s = search.toLowerCase();
      const player = (players || []).find(p => p.id === e.playerId);
      const coach = (players || []).find(p => p.id === e.coachId);
      const tournament = (tournaments || []).find(t => t.id === e.tournamentId);
      
      return (player?.name || '').toLowerCase().includes(s) ||
             (coach?.name || '').toLowerCase().includes(s) ||
             (tournament?.title || '').toLowerCase().includes(s) ||
             (e.feedback || '').toLowerCase().includes(s);
    });
  }, [evaluations, search, players, tournaments]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Recent Evaluation Feed</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredEvaluations.length}</Text>
        </View>
      </View>

      {filteredEvaluations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="clipboard-outline" size={48} color="#E2E8F0" />
          <Text style={styles.emptyText}>No evaluations recorded</Text>
        </View>
      ) : (
        filteredEvaluations.map((e, idx) => {
          const player = (players || []).find(p => p.id === e.playerId);
          const coach = (players || []).find(p => p.id === e.coachId);
          const tournament = (tournaments || []).find(t => t.id === e.tournamentId);
          
          return (
            <View key={e.id || idx} style={styles.adminCard}>
              <View style={styles.evalHeader}>
                <View style={styles.userInfo}>
                  <Image source={getSafeAvatar(player?.avatar, player?.name)} style={styles.evalAvatar} />
                  <View>
                    <Text style={styles.playerName}>{player?.name || 'Unknown Player'}</Text>
                    <Text style={styles.tournamentName}>{tournament?.title || 'External Match'}</Text>
                  </View>
                </View>
                <View style={[styles.scoreBox, { backgroundColor: e.averageScore >= 8 ? '#DCFCE7' : (e.averageScore >= 6 ? '#FEF3C7' : '#F1F5F9') }]}>
                  <Text style={[styles.scoreValue, { color: e.averageScore >= 8 ? '#16A34A' : (e.averageScore >= 6 ? '#D97706' : '#475569') }]}>
                    {e.averageScore?.toFixed(1) || 'N/A'}
                  </Text>
                </View>
              </View>

              <View style={styles.coachContext}>
                 <Ionicons name="school" size={12} color="#6366F1" />
                 <Text style={styles.coachName}>Evaluated by: <Text style={styles.bold}>{coach?.name || 'System'}</Text></Text>
              </View>

              {e.feedback && (
                <View style={styles.feedbackContainer}>
                  <Text style={styles.feedbackText} numberOfLines={3}>"{e.feedback}"</Text>
                </View>
              )}

              <View style={styles.evalFooter}>
                 <Text style={styles.timestamp}>{e.timestamp ? new Date(e.timestamp).toLocaleDateString() : 'Recent'}</Text>
                 <View style={styles.metricRow}>
                    {Object.entries(e.scores || {}).slice(0, 3).map(([key, val]) => (
                      <View key={key} style={styles.metricPill}>
                        <Text style={styles.metricLabel}>{key.substring(0, 3).toUpperCase()}:</Text>
                        <Text style={styles.metricVal}>{val}</Text>
                      </View>
                    ))}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  countBadge: { backgroundColor: '#6366F1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  adminCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, marginBottom: 16, ...shadows.sm, borderWidth: 1, borderColor: '#F1F5F9' },
  evalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  evalAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9' },
  playerName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  tournamentName: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 1 },
  scoreBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 18, fontWeight: '900' },
  coachContext: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  coachName: { fontSize: 11, color: '#64748B' },
  bold: { fontWeight: 'bold', color: '#4F46E5' },
  feedbackContainer: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, marginBottom: 16 },
  feedbackText: { fontSize: 13, color: '#334155', fontStyle: 'italic', lineHeight: 18 },
  evalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
  timestamp: { fontSize: 10, color: '#94A3B8', fontWeight: 'bold' },
  metricRow: { flexDirection: 'row', gap: 8 },
  metricPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  metricLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8' },
  metricVal: { fontSize: 9, fontWeight: 'bold', color: '#475569' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#94A3B8', fontWeight: 'bold' }
});

export default AdminEvaluationsPanel;
