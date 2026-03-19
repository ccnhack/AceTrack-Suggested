import React from 'react';
import { 
  View, Text, Image, ScrollView, StyleSheet, 
  SafeAreaView, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const RankingScreen = ({ user, role, players, tournaments }) => {
  let rankingPlayers = [...players].filter(p => p.id !== 'admin_sys' && p.role !== 'academy' && p.role !== 'coach');
  
  if (role === 'academy' && user) {
    const myParticipantIds = new Set(
      tournaments
        .filter(t => t.creatorId === user.id)
        .flatMap(t => t.registeredPlayerIds)
    );
    rankingPlayers = players.filter(p => myParticipantIds.has(p.id) && p.role !== 'coach');
  }

  // Sort by trueSkillRating or rating descending
  rankingPlayers.sort((a, b) => (b.trueSkillRating || b.rating) - (a.trueSkillRating || a.rating));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LEADERBOARD</Text>
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {(!user?.isEmailVerified || !user?.isPhoneVerified) && role !== 'admin' ? (
          <View style={styles.lockContainer}>
            <View style={styles.lockIconCircle}>
              <Ionicons name="lock-closed" size={48} color="#EF4444" />
            </View>
            <Text style={styles.lockTitle}>Verification Required</Text>
            <Text style={styles.lockSubtitle}>
              Please complete your email and phone verification in the Profile tab to view the global rankings and leaderboards.
            </Text>
          </View>
        ) : (
          <>
            {rankingPlayers.map((p, idx) => {
              const isCurrentUser = p.id === user?.id;
              return (
                <View 
                  key={p.id} 
                  style={[
                    styles.playerCard, 
                    isCurrentUser ? styles.currentUserCard : styles.defaultCard
                  ]}
                >
                  <Text style={styles.rankNumber}>{idx + 1}</Text>
                  
                  <Image 
                    source={{ uri: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random` }} 
                    style={styles.avatar} 
                  />
                  
                  <View style={styles.infoCol}>
                    <Text style={styles.playerName}>{p.name}</Text>
                    <Text style={styles.skillLevel}>{p.skillLevel}</Text>
                  </View>
                  
                  <View style={styles.ratingCol}>
                    <Text style={styles.ratingValue}>{p.trueSkillRating || p.rating}</Text>
                    <Text style={styles.ratingLabel}>RATING</Text>
                  </View>
                </View>
              );
            })}
            {rankingPlayers.length === 0 && (
              <Text style={styles.emptyText}>NO RANKINGS AVAILABLE</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120, // Extra padding for the bottom tab bar
    gap: 12,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  defaultCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F1F5F9',
  },
  currentUserCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  rankNumber: {
    width: 24,
    fontSize: 16,
    fontWeight: '900',
    color: '#CBD5E1',
    textAlign: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  skillLevel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  ratingCol: {
    alignItems: 'flex-end',
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  ratingLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 48,
    color: '#94A3B8',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  lockContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  lockIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RankingScreen;
