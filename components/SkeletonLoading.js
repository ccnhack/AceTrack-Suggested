import React from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { useEffect, useRef } from 'react';

/**
 * 💀 Skeleton Loading Components
 * UX Fix: Animated placeholders while content loads
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SkeletonPulse = ({ style }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(animatedValue, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return <Animated.View style={[styles.pulse, style, { opacity }]} />;
};

// Tournament Card Skeleton
export const TournamentCardSkeleton = () => (
  <View style={styles.tournamentCard}>
    <SkeletonPulse style={styles.tournamentBadge} />
    <View style={{ flex: 1 }}>
      <SkeletonPulse style={[styles.line, { width: '70%' }]} />
      <SkeletonPulse style={[styles.line, { width: '50%', marginTop: 8 }]} />
      <SkeletonPulse style={[styles.line, { width: '30%', marginTop: 8 }]} />
    </View>
  </View>
);

// Player Card Skeleton
export const PlayerCardSkeleton = () => (
  <View style={styles.playerCard}>
    <SkeletonPulse style={styles.avatar} />
    <View style={{ flex: 1, marginLeft: 12 }}>
      <SkeletonPulse style={[styles.line, { width: '60%' }]} />
      <SkeletonPulse style={[styles.line, { width: '40%', marginTop: 6 }]} />
    </View>
    <SkeletonPulse style={styles.badge} />
  </View>
);

// Match Card Skeleton
export const MatchCardSkeleton = () => (
  <View style={styles.matchCard}>
    <View style={styles.matchRow}>
      <SkeletonPulse style={styles.avatar} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <SkeletonPulse style={[styles.line, { width: '50%' }]} />
      </View>
      <SkeletonPulse style={[styles.scoreBadge]} />
      <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 8 }}>
        <SkeletonPulse style={[styles.line, { width: '50%' }]} />
      </View>
      <SkeletonPulse style={styles.avatar} />
    </View>
  </View>
);

// Video Card Skeleton
export const VideoCardSkeleton = () => (
  <View style={styles.videoCard}>
    <SkeletonPulse style={styles.videoThumb} />
    <View style={{ padding: 12 }}>
      <SkeletonPulse style={[styles.line, { width: '80%' }]} />
      <SkeletonPulse style={[styles.line, { width: '50%', marginTop: 8 }]} />
    </View>
  </View>
);

// Generic List Skeleton
export const ListSkeleton = ({ count = 5, Card = TournamentCardSkeleton }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} />
    ))}
  </View>
);

// Stat Card Skeleton
export const StatCardSkeleton = () => (
  <View style={styles.statCard}>
    <SkeletonPulse style={[styles.line, { width: '40%', height: 28 }]} />
    <SkeletonPulse style={[styles.line, { width: '60%', marginTop: 8 }]} />
  </View>
);

const styles = StyleSheet.create({
  pulse: {
    backgroundColor: '#334155',
    borderRadius: 6,
  },
  line: {
    height: 14,
    borderRadius: 4,
  },
  tournamentCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  tournamentBadge: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: 16,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  badge: {
    width: 50,
    height: 24,
    borderRadius: 12,
  },
  matchCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreBadge: {
    width: 60,
    height: 32,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  videoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  videoThumb: {
    width: '100%',
    height: 160,
  },
  statCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    width: (SCREEN_WIDTH - 48) / 2,
  },
});

export default {
  TournamentCardSkeleton,
  PlayerCardSkeleton,
  MatchCardSkeleton,
  VideoCardSkeleton,
  ListSkeleton,
  StatCardSkeleton,
};
