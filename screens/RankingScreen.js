import React, { useMemo, useCallback } from 'react';
import { 
  View, Text, Image, StyleSheet, 
  SafeAreaView, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeAvatar from '../components/SafeAvatar';
import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';
import { useTournaments } from '../context/TournamentContext';
import TournamentService from '../services/TournamentService';

const RankingScreen = () => {
  const { currentUser: user, userRole: role } = useAuth();
  const { players } = usePlayers();
  const { tournaments } = useTournaments();
  const insets = useSafeAreaInsets();
  const rankingPlayers = useMemo(() => {
    let list = [...(players || [])].filter(p => p && p.id !== 'admin_sys' && p.role !== 'academy' && p.role !== 'coach');
    
    if (role === 'academy' && user) {
      const myParticipantIds = new Set(
        (tournaments || [])
          .filter(t => TournamentService.normalizeId(t.creatorId) === TournamentService.normalizeId(user.id))
          .flatMap(t => t.registeredPlayerIds || [])
          .map(pid => TournamentService.normalizeId(pid))
      );
      list = (players || []).filter(p => p && p.id && myParticipantIds.has(TournamentService.normalizeId(p.id)) && p.role !== 'coach');
    }

    // Sort by trueSkillRating or rating descending
    return list.sort((a, b) => {
      const ratingA = (a.trueSkillRating || a.rating || 0);
      const ratingB = (b.trueSkillRating || b.rating || 0);
      return ratingB - ratingA;
    });
  }, [players, tournaments, role, user?.id]);

  const renderPlayer = useCallback(({ item, index }) => {
    const isCurrentUser = item.id === user?.id;
    return (
      <View 
        style={[
          styles.playerCard, 
          isCurrentUser ? styles.currentUserCard : styles.defaultCard
        ]}
      >
        <Text style={styles.rankNumber}>{index + 1}</Text>
        
        <SafeAvatar 
          uri={item.avatar} 
          name={item.name} 
          role={item.role} 
          size={48} 
          style={styles.avatar}
        />
        
        <View style={styles.infoCol}>
          <Text style={styles.playerName}>{item.name}</Text>
          <Text style={styles.skillLevel}>{item.skillLevel}</Text>
        </View>
        
        <View style={styles.ratingCol}>
          <Text style={styles.ratingValue}>{item.trueSkillRating || item.rating}</Text>
          <Text style={styles.ratingLabel}>RATING</Text>
        </View>
      </View>
    );
  }, [user?.id]);

  const listHeader = useMemo(() => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>LEADERBOARD</Text>
    </View>
  ), []);

  const emptyComponent = useMemo(() => (
    <Text style={styles.emptyText}>NO RANKINGS AVAILABLE</Text>
  ), []);

  const isLocked = useMemo(() => {
    return (!user?.isEmailVerified || !user?.isPhoneVerified) && role !== 'admin' && user?.role !== 'admin' && user?.id !== 'admin';
  }, [user?.isEmailVerified, user?.isPhoneVerified, role, user?.role, user?.id]);

  if (isLocked) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        {listHeader}
        <View style={styles.lockContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed" size={48} color="#EF4444" />
          </View>
          <Text style={styles.lockTitle}>Verification Required</Text>
          <Text style={styles.lockSubtitle}>
            Please complete your email and phone verification in the Profile tab to view the global rankings and leaderboards.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <FlatList
        data={rankingPlayers}
        renderItem={renderPlayer}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
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
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    marginBottom: 12,
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

