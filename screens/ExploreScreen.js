import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, SafeAreaView, Dimensions, FlatList, Modal, Alert, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TournamentDetailModal from '../components/TournamentDetailModal';

const { width } = Dimensions.get('window');

const ExploreScreen = ({ 
  tournaments, onSelect, reschedulingFrom, onCancelReschedule, userId, 
  userRole, userSports, players = [], Sport, SkillLevel, user,
  onRegister, onAssignCoach, isSyncing
}) => {
  const [sportFilter, setSportFilter] = useState('All');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [regPaymentTarget, setRegPaymentTarget] = useState(null);

  const getSportImage = (sport) => {
    switch (sport) {
      case 'Badminton': return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
      case 'Table Tennis': return "https://images.unsplash.com/photo-1534158914592-062992fbe900?q=80&w=1000&auto=format&fit=crop";
      case 'Cricket': return "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop";
      default: return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
    }
  };

  const activeTournaments = tournaments.filter(t => {
    const tDate = new Date(t.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (tDate < today || t.tournamentStarted || t.status === 'ongoing' || t.status === 'completed') return false;
    if (t.registrationDeadline) {
      const deadlineDate = new Date(t.registrationDeadline);
      deadlineDate.setHours(23, 59, 59, 999);
      if (today > deadlineDate) return false;
    }
    if (userRole === 'coach' && userSports && !userSports.includes(t.sport)) return false;
    if (reschedulingFrom && t.id === reschedulingFrom) return false;

    // Gender-based filtering for Individual/Player users
    if (userRole === 'user') {
      const format = t.format || "";
      const gender = user?.gender; // Use prop gender instead of local const (hoisting/scoping fix)
      if (format.includes("Men's") && gender && gender !== 'Male') return false;
      if (format.includes("Women's") && gender && gender !== 'Female') return false;
    }

    return true;
  });

  const filteredTournaments = sportFilter === 'All' 
    ? activeTournaments 
    : activeTournaments.filter(t => t.sport === sportFilter);

  const availableSports = userRole === 'coach' && userSports ? userSports : Object.values(Sport);
  const currentUser = userId ? players.find(p => p.id === userId) : null;
  const isBeginnerProtected = currentUser?.isBeginnerProtected || false;
  const displayTournaments = isBeginnerProtected 
    ? filteredTournaments.filter(t => t.skillLevel === 'Beginner')
    : filteredTournaments;

  const recommendedTournaments = currentUser && !isBeginnerProtected
    ? displayTournaments.filter(t => {
        if (t.skillLevel === currentUser.skillLevel) return true;
        if (currentUser.trueSkillRating && t.skillRange) {
           return currentUser.trueSkillRating >= t.skillRange.min && currentUser.trueSkillRating <= t.skillRange.max;
        }
        return false;
      }).slice(0, 2)
    : [];

  const renderTournamentCard = ({ item: t, isRec = false }) => {
    const isRegistered = userId && t.registeredPlayerIds?.some(id => String(id).toLowerCase() === String(userId).toLowerCase());
    const isPendingPayment = userId && t.pendingPaymentPlayerIds?.some(id => String(id).toLowerCase() === String(userId).toLowerCase());
    const isAssignedCoach = userId && t.assignedCoachIds?.includes(userId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(t.registrationDeadline);
    deadline.setHours(0, 0, 0, 0);
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let registrationMessage = '';
    if (diffDays < 0) registrationMessage = 'Registration Closed';
    else if (diffDays === 0) registrationMessage = 'Hurry Up! Registration closes today.';
    else if (diffDays <= 3) registrationMessage = `Hurry Up! Registration closes in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
    else registrationMessage = `Registrations are open. Closes in ${diffDays} days.`;

    if (isRec) {
      return (
        <TouchableOpacity onPress={() => setSelectedTournament(t)} style={styles.recCard}>
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
      <TouchableOpacity onPress={() => setSelectedTournament(t)} style={styles.card}>
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
                <Ionicons name="calendar-outline" size={14} color="#64748B" />
                <Text style={styles.infoLabel}>Date</Text>
              </View>
              <Text style={styles.infoValue}>{t.date}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoCol}>
              <View style={styles.infoLabelContainer}>
                <Ionicons name="time-outline" size={14} color="#64748B" />
                <Text style={styles.infoLabel}>Time</Text>
              </View>
              <Text style={styles.infoValue}>{t.time}</Text>
            </View>
            {userRole !== 'coach' && (
              <>
                <View style={styles.divider} />
                <View style={[styles.infoCol, { width: 60 }]}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="cash-outline" size={14} color="#64748B" />
                    <Text style={styles.infoLabel}>Entry</Text>
                  </View>
                  <Text style={styles.infoValue}>₹{t.entryFee}</Text>
                </View>
              </>
            )}
          </View>
          {userRole !== 'coach' && (
            <View style={styles.cardFooter}>
              <Text style={[
                styles.regMessage, 
                diffDays < 0 ? { color: '#94A3B8' } : diffDays <= 3 ? { color: '#EF4444' } : { color: '#16A34A' }
              ]}>
                {registrationMessage}
              </Text>
              <View style={styles.arrowButton}>
                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderPaymentModal = () => {
    if (!regPaymentTarget) return null;

    const isRescheduling = !!reschedulingFrom;
    const oldT = isRescheduling ? tournaments.find(i => i.id === reschedulingFrom) : null;
    const rescheduleCount = isRescheduling ? (user?.rescheduleCounts?.[reschedulingFrom] || 0) : 0;
    const rescheduleFee = (isRescheduling && rescheduleCount > 0) ? 20 : 0;
    const priceDiff = (isRescheduling && oldT) ? (regPaymentTarget.entryFee - oldT.entryFee) : 0;
    const totalAdjustedCost = isRescheduling ? (priceDiff + rescheduleFee) : regPaymentTarget.entryFee;
    const canPayWithCredits = (user?.credits || 0) >= totalAdjustedCost;

    const finalize = (method) => {
        onRegister(regPaymentTarget, method, totalAdjustedCost, isRescheduling, reschedulingFrom);
        setRegPaymentTarget(null);
        setSelectedTournament(null);
        Alert.alert("Success", isRescheduling ? "Arena swapped successfully!" : "Registration successful!");
    };

    return (
        <Modal transparent animationType="fade" visible={!!regPaymentTarget}>
            <View style={styles.modalOverlay}>
                <View style={styles.paymentSheet}>
                    <View style={styles.paymentHeader}>
                        <Text style={styles.paymentTitle}>{isRescheduling ? 'Confirm Swap' : 'Select Payment'}</Text>
                        <TouchableOpacity onPress={() => setRegPaymentTarget(null)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.paymentSummary}>
                        <View style={styles.summaryRow}>
                            <View>
                                <Text style={styles.summaryLabel}>Total Adjustment</Text>
                                <Text style={[styles.summaryValue, { color: totalAdjustedCost < 0 ? '#16A34A' : '#EF4444' }]}>
                                    ₹{Math.abs(totalAdjustedCost)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.summaryLabel}>Wallet Balance</Text>
                                <Text style={[styles.summaryValueSmall, !canPayWithCredits && totalAdjustedCost > 0 && { color: '#EF4444' }]}>
                                    ₹{user?.credits || 0}
                                </Text>
                            </View>
                        </View>
                        {!canPayWithCredits && totalAdjustedCost > 0 && (
                            <Text style={styles.insufficientText}>Insufficient AceTrack credits</Text>
                        )}
                    </View>

                    <View style={styles.paymentActions}>
                        <TouchableOpacity 
                            disabled={!canPayWithCredits}
                            onPress={() => finalize('credits')}
                            style={[styles.payBtn, !canPayWithCredits && styles.payBtnDisabled]}
                        >
                            <Text style={[styles.payBtnText, !canPayWithCredits && styles.payBtnTextDisabled]}>Pay with Wallet</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={() => finalize('upi')}
                            style={[styles.payBtn, { backgroundColor: '#EF4444', marginTop: 12 }]}
                        >
                            <Text style={styles.payBtnText}>Pay with UPI</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setRegPaymentTarget(null)} style={styles.cancelLink}>
                            <Text style={styles.cancelLinkText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
  };

  return (
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>AceTrack</Text>
          <Text style={styles.heroSubtitle}>Bangalore Elite Circuit</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
          {['All', ...availableSports].map(sport => (
            <TouchableOpacity
              key={sport}
              onPress={() => setSportFilter(sport)}
              style={[styles.filterButton, sportFilter === sport && styles.filterButtonActive]}
            >
              <Text style={[styles.filterButtonText, sportFilter === sport && styles.filterButtonTextActive]}>{sport}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.main}>
        {recommendedTournaments.length > 0 && !reschedulingFrom && userRole !== 'coach' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended for you</Text>
            {recommendedTournaments.map(t => (
              <React.Fragment key={`rec-${t.id}`}>
                {renderTournamentCard({ item: t, isRec: true })}
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {reschedulingFrom ? 'Pick a new arena' : userRole === 'coach' ? 'Coaching Opportunities' : 'Upcoming Arenas'}
          </Text>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>Live Slots</Text>
          </View>
        </View>

        {isBeginnerProtected && (
          <View style={styles.alert}>
            <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
            <Text style={styles.alertText}>Beginner Protection Active. Showing only Beginner tournaments.</Text>
          </View>
        )}

        {reschedulingFrom && (
          <View style={styles.rescheduleAlert}>
            <Text style={styles.rescheduleAlertText}>Rescheduling in progress. Please select your new arena below.</Text>
            <TouchableOpacity onPress={onCancelReschedule} style={styles.cancelBox}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.list}>
          {displayTournaments.length > 0 ? (
            displayTournaments.map(t => (
              <React.Fragment key={t.id}>
                {renderTournamentCard({ item: t })}
              </React.Fragment>
            ))
          ) : (
            <View style={styles.empty}>
              {isSyncing ? (
                <ActivityIndicator size="large" color="#3B82F6" />
              ) : (
                <>
                  <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
                  <Text style={styles.emptyText}>No active arenas found</Text>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </ScrollView>

    <TournamentDetailModal
      tournament={selectedTournament}
      visible={!!selectedTournament}
      onClose={() => setSelectedTournament(null)}
      user={user}
      role={userRole}
      players={players}
      onRegister={(t) => setRegPaymentTarget(t)}
      onCoachOptIn={(t) => onAssignCoach(t.id, userId)}
    />

    {renderPaymentModal()}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  hero: {
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingTop: 60,
    paddingBottom: 40,
  },
  heroContent: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  filterContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: '#EF4444',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  main: {
    padding: 24,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  liveBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
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
    backdropFilter: 'blur(10px)',
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
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  alertText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
    flex: 1,
  },
  rescheduleAlert: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  rescheduleAlertText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
    flex: 1,
  },
  cancelBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B91C1C',
    textTransform: 'uppercase',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  paymentSheet: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    padding: 32,
    paddingBottom: 48,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  paymentSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  summaryValueSmall: {
    fontSize: 18,
    fontWeight: '900',
    color: '#334155',
  },
  insufficientText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 12,
  },
  paymentActions: {
    gap: 12,
  },
  payBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  payBtnDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  payBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  payBtnTextDisabled: {
    color: '#94A3B8',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default ExploreScreen;
