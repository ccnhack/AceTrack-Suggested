/**
 * 🏆 ShareablePlayerCard — v2.6.566
 * A premium-looking player stats card with gradient background,
 * skill breakdown, and share functionality.
 * 
 * Reads ONLY from useAuth() and useTournamentsStore() — no side effects.
 */
import React, { memo, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Platform, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from './SafeAvatar';
import { colors, shadows, typography, borderRadius } from '../theme/designSystem';
import { computePlayerCardData, sharePlayerStatsAsText } from '../utils/shareUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 380);

// Tier gradient mappings
const TIER_GRADIENTS = {
  Legend: ['#F59E0B', '#D97706', '#B45309'],
  Master: ['#8B5CF6', '#7C3AED', '#6D28D9'],
  Expert: ['#3B82F6', '#2563EB', '#1D4ED8'],
  Rising: ['#10B981', '#059669', '#047857'],
  Rookie: ['#64748B', '#475569', '#334155'],
};

const StatBox = memo(({ label, value, icon, color = '#FFF' }) => (
  <View style={statStyles.box}>
    <Ionicons name={icon} size={16} color={color} style={{ opacity: 0.7 }} />
    <Text style={[statStyles.value, { color }]}>{value}</Text>
    <Text style={[statStyles.label, { color, opacity: 0.6 }]}>{label}</Text>
  </View>
));

const TrendBadge = memo(({ trend }) => {
  if (trend === 0) return null;
  const isUp = trend > 0;
  return (
    <View style={[trendStyles.badge, { backgroundColor: isUp ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }]}>
      <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={12} color={isUp ? '#10B981' : '#EF4444'} />
      <Text style={[trendStyles.text, { color: isUp ? '#10B981' : '#EF4444' }]}>
        {isUp ? '+' : ''}{trend}
      </Text>
    </View>
  );
});

const ShareablePlayerCard = memo(({ visible, onClose, user, tournaments = [] }) => {
  const cardData = useMemo(() => computePlayerCardData(user, tournaments), [user, tournaments]);

  if (!cardData) return null;

  const gradientColors = TIER_GRADIENTS[cardData.tier] || TIER_GRADIENTS.Rookie;

  const handleShare = async () => {
    await sharePlayerStatsAsText(user);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#94A3B8" />
          </TouchableOpacity>

          {/* THE CARD */}
          <View style={styles.cardWrapper}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {/* Decorative circles */}
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />

              {/* Header: Avatar + Name + Tier */}
              <View style={styles.cardHeader}>
                <View style={styles.avatarContainer}>
                  <SafeAvatar
                    uri={cardData.avatar}
                    name={cardData.name}
                    size={64}
                    style={styles.avatar}
                  />
                </View>
                <View style={styles.headerInfo}>
                  <Text style={styles.playerName} numberOfLines={1}>{cardData.name}</Text>
                  <View style={styles.sportRow}>
                    <Text style={styles.sportText}>{cardData.sport}</Text>
                    <View style={styles.dot} />
                    <Text style={styles.sportText}>{cardData.skillLevel}</Text>
                  </View>
                  {cardData.city ? (
                    <View style={styles.cityRow}>
                      <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.cityText}>{cardData.city}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Tier Badge */}
              <View style={styles.tierBadge}>
                <Ionicons
                  name={cardData.tier === 'Legend' ? 'diamond' : cardData.tier === 'Master' ? 'star' : 'shield-checkmark'}
                  size={14}
                  color="#FFF"
                />
                <Text style={styles.tierText}>{cardData.tier}</Text>
              </View>

              {/* TrueSkill Rating */}
              <View style={styles.ratingSection}>
                <Text style={styles.ratingLabel}>TRUESKILL RATING</Text>
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingValue}>
                    {cardData.trueSkill !== null ? cardData.trueSkill : '--'}
                  </Text>
                  <TrendBadge trend={cardData.recentTrend} />
                </View>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <StatBox label="Win Rate" value={`${cardData.winRate}%`} icon="trophy" />
                <StatBox label="Matches" value={cardData.totalMatches} icon="game-controller" />
                <StatBox label="Wins" value={cardData.wins} icon="checkmark-circle" />
                <StatBox label="Tournaments" value={cardData.tournamentsPlayed} icon="ribbon" />
              </View>

              {/* Win/Loss Bar */}
              <View style={styles.barContainer}>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: cardData.totalMatches > 0
                          ? `${(cardData.wins / cardData.totalMatches) * 100}%`
                          : '50%'
                      }
                    ]}
                  />
                </View>
                <View style={styles.barLabels}>
                  <Text style={styles.barLabelText}>{cardData.wins}W</Text>
                  <Text style={styles.barLabelText}>{cardData.losses}L</Text>
                </View>
              </View>

              {/* Branding Footer */}
              <View style={styles.brandFooter}>
                <Text style={styles.brandText}>ACETRACK</Text>
                <Text style={styles.brandTagline}>Track Your Game</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Share Button */}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5']}
              style={styles.shareBtnGradient}
            >
              <Ionicons name="share-social" size={20} color="#FFF" />
              <Text style={styles.shareBtnText}>Share My Card</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Referral Code */}
          {cardData.referralCode && (
            <View style={styles.referralContainer}>
              <Text style={styles.referralLabel}>Referral Code</Text>
              <Text style={styles.referralCode}>{cardData.referralCode}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
});

ShareablePlayerCard.displayName = 'ShareablePlayerCard';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    borderRadius: 24,
    ...shadows.lg,
    overflow: 'hidden',
  },
  card: {
    padding: 24,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  decorCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 16,
  },
  playerName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sportText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 8,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  cityText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    marginLeft: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ratingSection: {
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -1,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  barContainer: {
    marginBottom: 16,
  },
  barBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 3,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  brandFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  brandText: {
    fontSize: 14,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 3,
  },
  brandTagline: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  shareBtn: {
    width: CARD_WIDTH,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  referralContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  referralLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginRight: 8,
  },
  referralCode: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
});

const statStyles = StyleSheet.create({
  box: {
    alignItems: 'center',
    flex: 1,
  },
  value: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

const trendStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
  },
});

export default ShareablePlayerCard;
