import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';
import { getSafeAvatar } from '../utils/imageUtils';

const PlayerDashboardView = ({ players, tournaments, title }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  return (
    <View style={styles.container}>
      {(players || []).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No players found</Text>
        </View>
      ) : (
        (players || []).map(p => (
          <TouchableOpacity 
            key={p.id} 
            activeOpacity={0.9}
            onPress={() => setSelectedPlayerId(selectedPlayerId === p.id ? null : p.id)}
            style={[
              styles.playerCard, 
              selectedPlayerId === p.id && styles.playerCardActive
            ]}
          >
            <View style={styles.cardHeader}>
              <Image 
                source={getSafeAvatar(p.avatar, p.name)}
                style={styles.avatar} 
              />
              <View style={styles.info}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.phone}>{p.phone}</Text>
              </View>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingValue}>{p.rating}</Text>
                <Text style={styles.ratingLabel}>Points</Text>
              </View>
              <Ionicons 
                name={selectedPlayerId === p.id ? "chevron-up" : "chevron-down"} 
                size={16} 
                color="#64748B" 
                style={{ marginLeft: 8 }} 
              />
            </View>

            {selectedPlayerId === p.id && (
              <View style={styles.expandedContent}>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <View style={styles.row}>
                      <Ionicons name="information-circle-outline" size={14} color="#6366F1" />
                      <Text style={[styles.statLabel, { marginLeft: 4, marginBottom: 0 }]}>Account Information</Text>
                    </View>
                    <View style={[styles.detailLine, { marginTop: 8 }]}>
                      <Text style={styles.detailLabel}>UID: </Text>
                      <Text style={styles.detailValue}>{p.id}</Text>
                    </View>
                    <View style={styles.detailLine}>
                      <Text style={styles.detailLabel}>Email: </Text>
                      <Text style={styles.detailValue}>{p.email}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Game Record</Text>
                    <View style={styles.recordValue}>
                      <Text style={styles.winText}>{p.wins}W</Text>
                      <Text style={styles.lossText}> / {p.losses}L</Text>
                    </View>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Reliability</Text>
                    <View style={styles.recordValue}>
                      <Text style={styles.noShowText}>{p.noShows}NS</Text>
                      <Text style={styles.lossText}> / {p.cancellations}C</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.registrationsHeader}>
                  <Text style={styles.registrationsTitle}>Active Registrations</Text>
                  <View style={styles.regList}>
                    {((tournaments || []).filter(t => t && (t.registeredPlayerIds || []).includes(p.id)) || []).length > 0 ? (
                      (tournaments || []).filter(t => t && (t.registeredPlayerIds || []).includes(p.id)).map(t => (
                        <View key={t.id} style={styles.regItem}>
                          <View>
                            <Text style={styles.regTitle}>{t.title}</Text>
                            <Text style={styles.regDate}>{t.date}</Text>
                          </View>
                          <Ionicons name="trophy" size={16} color="#6366F1" opacity={0.6} />
                        </View>
                      ))
                    ) : (
                      <View style={styles.emptyReg}>
                        <Text style={styles.emptyRegText}>No active events</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 4, gap: 12 },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
    ...designSystem.shadows.sm,
    overflow: 'hidden',
  },
  playerCardActive: { borderLeftColor: '#10B981', backgroundColor: '#F8FAFC' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1F5F9' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' },
  phone: { fontSize: 10, fontWeight: 'bold', color: '#94A3B8', textTransform: 'none', marginTop: 2 },
  ratingBox: { alignItems: 'center' },
  ratingValue: { fontSize: 14, fontWeight: '900', color: '#6366F1' },
  ratingLabel: { fontSize: 7, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' },
  expandedContent: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16 },
  statLabel: { fontSize: 8, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6 },
  detailLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailLabel: { fontSize: 9, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' },
  detailValue: { fontSize: 9, fontWeight: '700', color: '#334155' },
  recordValue: { flexDirection: 'row', alignItems: 'baseline' },
  winText: { fontSize: 15, fontWeight: '900', color: '#1E293B' },
  lossText: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8' },
  noShowText: { fontSize: 15, fontWeight: '900', color: '#EF4444' },
  registrationsHeader: { gap: 8 },
  registrationsTitle: { fontSize: 10, fontWeight: '900', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 },
  regList: { gap: 8 },
  regItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 12, borderRadius: 12 },
  regTitle: { fontSize: 11, fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' },
  regDate: { fontSize: 8, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase', marginTop: 2 },
  emptyReg: { backgroundColor: '#F8FAFC', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  emptyRegText: { fontSize: 10, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase' },
  emptyContainer: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 10, fontWeight: '900', color: '#CBD5E1', textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
});

export default PlayerDashboardView;
