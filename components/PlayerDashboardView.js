import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';

const PlayerDashboardView = ({ players, tournaments, title }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  return (
    <View style={styles.container}>
      {players.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No players found</Text>
        </View>
      ) : (
        players.map(p => (
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
                source={{ uri: (p.avatar && p.avatar !== 'null') ? p.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random` }} 
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
            </View>

            {selectedPlayerId === p.id && (
              <View style={styles.expandedContent}>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Registration Info</Text>
                    <View style={styles.detailLine}>
                      <Text style={styles.detailLabel}>Username: </Text>
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
                  <Text style={styles.registrationsTitle}>Registrations</Text>
                  <View style={styles.regList}>
                    {tournaments.filter(t => t.registeredPlayerIds.includes(p.id)).length > 0 ? (
                      tournaments.filter(t => t.registeredPlayerIds.includes(p.id)).map(t => (
                        <View key={t.id} style={styles.regItem}>
                          <Text style={styles.regTitle}>{t.title}</Text>
                          <Text style={styles.regDate}>{t.date}</Text>
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
  container: {
    paddingVertical: 4,
    gap: 12,
  },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  playerCardActive: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  phone: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  ratingBox: {
    alignItems: 'flex-end',
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  ratingLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 16,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#334155',
  },
  recordValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  winText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  lossText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  noShowText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#EF4444',
  },
  registrationsHeader: {
    gap: 12,
  },
  registrationsTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginLeft: 4,
  },
  regList: {
    gap: 8,
  },
  regItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  regTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
  },
  regDate: {
    fontSize: 8,
    fontWeight: '900',
    color: '#F87171',
    textTransform: 'uppercase',
  },
  emptyReg: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyRegText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
});

export default PlayerDashboardView;
