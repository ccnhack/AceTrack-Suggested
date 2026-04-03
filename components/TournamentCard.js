import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const getSportImage = (sport) => {
  switch (sport) {
    case 'Badminton': return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
    case 'Table Tennis': return "https://images.unsplash.com/photo-1534158914592-062992fbe900?q=80&w=1000&auto=format&fit=crop";
    case 'Cricket': return "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop";
    default: return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
  }
};

const TournamentCard = ({ 
  tournament: t, 
  onPress, 
  userId, 
  userRole,
  isRec = false 
}) => {
  const isRegistered = userId && (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
  const isPendingPayment = userId && (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
  const isAssignedCoach = userId && (t.assignedCoachIds || []).includes(userId);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = t.registrationDeadline ? new Date(t.registrationDeadline) : null;
  if (deadline) deadline.setHours(0, 0, 0, 0);
  const diffTime = deadline ? deadline.getTime() - today.getTime() : null;
  const diffDays = diffTime !== null ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : null;

  let registrationMessage = '';
  if (diffDays !== null) {
    if (diffDays < 0) registrationMessage = 'Registration Closed';
    else if (diffDays === 0) registrationMessage = 'Hurry Up! Registration closes today.';
    else if (diffDays <= 3) registrationMessage = `Hurry Up! Registration closes in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
    else registrationMessage = `Registrations are open. Closes in ${diffDays} days.`;
  }

  if (isRec) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.recCard}>
        <View style={styles.recCardHeader}>
          <View>
            <View style={styles.bestMatchBadge}>
              <Text style={styles.bestMatchText}>Best Match</Text>
            </View>
            <Text style={styles.recCardTitle} numberOfLines={1}>{t.title}</Text>
          </View>
          <View style={styles.recIcon}>
            <Ionicons name="chevron-forward" size={16} color="#F87171" />
          </View>
        </View>
        <View style={styles.recCardFooter}>
          <View style={styles.recInfoItem}>
            <Ionicons name="time-outline" size={12} color="#94A3B8" />
            <Text style={styles.recInfoText}>{t.date}</Text>
          </View>
          <View style={styles.recInfoItem}>
            <Ionicons name="cash-outline" size={12} color="#94A3B8" />
            <Text style={styles.recInfoText}>₹{t.entryFee}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <View style={styles.cardCover}>
        <Image 
          source={{ uri: getSportImage(t.sport) || "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000" }} 
          style={styles.cardImage} 
        />
        <View style={styles.overlay} />
        <View style={styles.cardHeaderArea}>
          <View style={styles.cardBadges}>
            <View style={styles.levelBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.levelBadgeText}>{t.skillLevel}</Text>
            </View>
            {isRegistered && userRole !== 'coach' && (
              <View style={[styles.statusBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.statusBadgeText}>Registered</Text>
              </View>
            )}
            {isPendingPayment && userRole !== 'coach' && (
              <View style={[styles.statusBadge, { backgroundColor: '#F97316' }]}>
                <Text style={styles.statusBadgeText}>Pending Payment</Text>
              </View>
            )}
            {isAssignedCoach && userRole === 'coach' && (
              <View style={[styles.statusBadge, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.statusBadgeText}>Assigned</Text>
              </View>
            )}
          </View>
          <View style={styles.locationContainer}>
            <Ionicons name="location" size={16} color="#EF4444" />
            <Text style={styles.locationText}>{t.location}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
              <Text style={styles.infoLabel}>Date</Text>
            </View>
            <Text style={styles.infoValue}>{t.date}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoCol}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="people-outline" size={12} color="#94A3B8" />
              <Text style={styles.infoLabel}>Slots</Text>
            </View>
            <Text style={styles.infoValue}>
              {(t.registeredPlayerIds || []).filter(Boolean).length}/{t.maxPlayers}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoCol}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="cash-outline" size={12} color="#94A3B8" />
              <Text style={styles.infoLabel}>Entry</Text>
            </View>
            <Text style={styles.infoValue}>₹{t.entryFee}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View>
            {userRole !== 'coach' ? (
              <Text style={[
                styles.regMessage, 
                diffDays < 0 ? { color: '#94A3B8' } : diffDays <= 3 ? { color: '#EF4444' } : { color: '#16A34A' }
              ]}>
                {registrationMessage}
              </Text>
            ) : (
              <Text style={[styles.regMessage, { color: '#3B82F6' }]}>COACH VIEW</Text>
            )}
            {t.distance !== undefined && t.distance !== 99999 && (
              <Text style={styles.distanceIndicator}>
                <Ionicons name="navigate-outline" size={10} color="#64748B" /> {t.distance} km away
              </Text>
            )}
          </View>
          <View style={styles.arrowButton}>
            <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  recCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  recCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bestMatchBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  bestMatchText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F87171',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    maxWidth: width * 0.6,
  },
  recIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCardFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  recInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recInfoText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardCover: {
    height: 192,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  cardHeaderArea: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBadges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingRight: 8,
  },
  levelBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    maxWidth: 140,
  },
  locationText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  cardTitle: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  cardContent: {
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    gap: 2,
  },
  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: '#F1F5F9',
  },
  cardFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regMessage: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: -0.2,
  },
  distanceIndicator: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(TournamentCard);
