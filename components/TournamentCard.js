import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncContext';
import { formatDateIST } from '../utils/tournamentUtils';
import config from '../config';

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
  const { serverClockOffset } = useSync();
  const isRegistered = userId && (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
  const isPendingPayment = userId && (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
  const isAssignedCoach = userId && (t.assignedCoachIds || []).includes(userId);
  const isWaitlisted = userId && (t.waitlistedPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
  
  const today = new Date(Date.now() + (serverClockOffset || 0));
  today.setHours(0, 0, 0, 0);


  // 🛡️ [RegEngine] Robust Parsing for regional formats (DD-MM-YYYY)
  const parseDate = (d) => {
    if (!d) return null;
    let date = new Date(d);
    if (isNaN(date.getTime())) {
      const parts = d.split('-');
      if (parts.length === 3) {
        if (parts[2].length === 4) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        if (parts[0].length === 4) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }
    return isNaN(date.getTime()) ? null : date;
  };

  const deadline = parseDate(t.registrationDeadline);
  if (deadline) deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline ? deadline.getTime() - today.getTime() : null;
  const diffDays = diffTime !== null ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : null;

  let registrationMessage = '';
  // 🛡️ [RegEngine] Status-Specific Messages for Participants
  if (isRegistered || isPendingPayment || isWaitlisted) {
    if (isPendingPayment) {
      registrationMessage = 'Action Required: Complete payment to secure your spot!';
    } else if (isWaitlisted) {
      registrationMessage = 'Hold tight! We\'ll notify you if a slot opens up.';
    } else if (isRegistered) {
      const startDate = parseDate(t.date);
      if (startDate) {
        startDate.setHours(0, 0, 0, 0);
        const startDiff = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (startDiff === 0) registrationMessage = 'Today is the Day! Good luck!';
        else if (startDiff < 0) registrationMessage = 'Tournament in Progress';
        else registrationMessage = `Buckle Up! Tournament begins in ${startDiff} day${startDiff === 1 ? '' : 's'}.`;
      } else {
        registrationMessage = 'You are registered! Get ready.';
      }
    }
  } else if (t.tournamentStarted || t.status !== 'upcoming') {
    registrationMessage = 'Registration Closed';
  } else if (diffDays !== null) {
    if (diffDays < 0) registrationMessage = 'Registration Closed';
    else if (diffDays === 0) registrationMessage = 'Hurry Up! Registration closes today.';
    else if (diffDays <= 3) registrationMessage = `Hurry Up! Registration closes in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
    else registrationMessage = `Registrations are open. Closes in ${diffDays} days.`;
  }

  if (isRec) {
    return (
      <TouchableOpacity 
        testID={`tournament.card.rec.${t.id}`}
        onPress={onPress} 
        style={styles.recCard}
      >
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
            <Text style={styles.recInfoText}>{formatDateIST(t.date)}</Text>
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
    <TouchableOpacity 
      testID={`tournament.card.${t.id}`}
      onPress={onPress} 
      style={styles.card}
    >
      <View style={styles.cardCover}>
        <Image 
          source={{ uri: config.sanitizeUrl(getSportImage(t.sport)) || "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000" }} 
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
            {isWaitlisted && userRole !== 'coach' && (
              <View style={[styles.statusBadge, { backgroundColor: '#D97706' }]}>
                <Text style={styles.statusBadgeText}>Waitlisted</Text>
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
            <Text 
              style={styles.infoValue}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatDateIST(t.date)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoCol}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="people-outline" size={12} color="#94A3B8" />
              <Text style={styles.infoLabel}>Slots</Text>
            </View>
            <Text style={styles.infoValue}>
              {(() => {
                const reg = (t.registeredPlayerIds || []).filter(Boolean).length;
                const pen = (t.pendingPaymentPlayerIds || []).filter(Boolean).length;
                const isStaff = userRole === 'admin' || userRole === 'academy';
                
                if (isStaff) {
                   const wait = (t.waitlistedPlayerIds || []).filter(Boolean).length;
                   return `${reg}/${t.maxPlayers}${pen > 0 ? ` (+${pen}P)` : ''}${wait > 0 ? ` [${wait}W]` : ''}`;
                }
                
                const combined = reg + pen;
                if (combined >= t.maxPlayers) {
                  return 'Full';
                }
                return `${combined}/${t.maxPlayers}`;
              })()}
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
                isRegistered ? { color: '#0EA5E9' } :
                isPendingPayment ? { color: '#F97316' } :
                isWaitlisted ? { color: '#D97706' } :
                diffDays < 0 ? { color: '#94A3B8' } : 
                diffDays <= 3 ? { color: '#EF4444' } : 
                { color: '#16A34A' }
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bestMatchBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  bestMatchText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: '#1E293B',
    borderRadius: 24,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  cardCover: {
    height: 160,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  cardHeaderArea: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBadges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  levelBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  locationText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cardTitle: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  cardContent: {
    padding: 16,
    backgroundColor: '#1E293B',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderRadius: 12,
    padding: 12,
  },
  infoCol: {
    alignItems: 'center',
    gap: 4,
  },
  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regMessage: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  distanceIndicator: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(TournamentCard);
