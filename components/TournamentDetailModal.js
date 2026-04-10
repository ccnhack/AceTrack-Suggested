import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TournamentDetailModal = ({
  tournament,
  visible,
  onClose,
  user,
  role,
  players = [],
  onRegister,
  onJoinWaitlist,
  onCoachOptIn,
  onUpdateTournament,
}) => {
  const [showAcademyDetails, setShowAcademyDetails] = useState(false);

  if (!tournament) return null;

  const isAdminUser = role === 'admin';
  const isAcademyUser = role === 'academy';
  const isCoach = role === 'coach';
  const isRegularUser = role === 'user';

  const isRegistered = user && (tournament.registeredPlayerIds || []).includes(user.id);
  const isPendingPayment = user && (tournament.pendingPaymentPlayerIds || []).includes(user.id);
  const isWaitlisted = user && (tournament.waitlistedPlayerIds || []).includes(user.id);
  const isInterested = user && (tournament.interestedPlayerIds || []).includes(user.id);
  const isRejected = user && (tournament.rejectedPlayerIds || []).includes(user.id);

  const handleInterestPress = () => {
    if (!user || user.role !== 'user') return;

    if (isInterested) {
      Alert.alert(
        "Changed your mind?",
        "Do you want to mark yourself as not interested?",
        [
          { text: "No", style: "cancel" },
          { 
            text: "Yes, Remove", 
            onPress: () => {
              const updated = {
                ...tournament,
                interestedPlayerIds: (tournament.interestedPlayerIds || []).filter(id => id !== user.id)
              };
              onUpdateTournament(updated);
            }
          }
        ]
      );
    } else {
      const updated = {
        ...tournament,
        interestedPlayerIds: [...(tournament.interestedPlayerIds || []), user.id]
      };
      onUpdateTournament(updated);
      Alert.alert(
        "Interest Submitted",
        "Thank you for showing your interest, your details has been sent to the academy for confirmation."
      );
    }
  };

  const isAlreadyRegistered = user && (tournament.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
  const isAssignedCoach = user && String(tournament.assignedCoachId).toLowerCase() === String(user.id).toLowerCase();
  const isFull = tournament.registeredPlayerIds?.length >= tournament.maxPlayers;
  
  // DATE-BASED CLOSURE: Check if deadline has passed or tournament started
  const isClosed = (() => {
    // 🛡️ [RegEngine] Status Guard: ONLY allow registration for upcoming tournaments
    // Ongoing tournaments (already started) or completed ones are closed.
    if (tournament.tournamentStarted || tournament.status !== 'upcoming') return true;
    
    if (tournament.registrationDeadline) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 🛡️ [RegEngine] Robust Parsing for regional formats (DD-MM-YYYY)
      const parseDate = (d) => {
        if (!d) return null;
        let date = new Date(d);
        if (isNaN(date.getTime())) {
          const parts = d.split('-');
          if (parts.length === 3) {
            // Check if DD-MM-YYYY (parts[2] is year)
            if (parts[2].length === 4) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            // Check if YYYY-MM-DD (parts[0] is year)
            if (parts[0].length === 4) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          }
        }
        return isNaN(date.getTime()) ? null : date;
      };

      const deadline = parseDate(tournament.registrationDeadline);
      if (deadline) {
        deadline.setHours(23, 59, 59, 999);
        if (today > deadline) return true;
      }
    }
    return false;
  })();

  const creator = (players || []).find(p => p.id === tournament.creatorId);

  const handleRegister = () => {
    // LOCK: Prevent registration if not verified
    if (user && (!user.isEmailVerified || !user.isPhoneVerified)) {
      Alert.alert(
        "Verification Required",
        "Please complete your email and phone verification in the Profile section before registering for tournaments.",
        [{ text: "OK" }]
      );
      return;
    }

    if (isFull && !isAlreadyRegistered && !isPendingPayment) {
      if (onJoinWaitlist) {
        onJoinWaitlist(tournament);
        onClose();
        return;
      }
    }

    if (!onRegister) {
      Alert.alert('Register', `Register for ${tournament.title} for ₹${tournament.entryFee}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => Alert.alert('Success', 'Registration request submitted!') },
      ]);
      return;
    }
    onRegister(tournament);
    onClose();
  };

  const handleOptIn = () => {
    if (!onCoachOptIn) {
      Alert.alert('Opt-In', 'Submitted coaching opt-in!');
      return;
    }
    onCoachOptIn(tournament);
    onClose();
  };

  const getRegisterBtnLabel = () => {
    if (isPendingPayment) return 'Pay Now';
    if (isWaitlisted) return 'Already Waitlisted';
    if (isClosed) return 'Registration Closed';
    if (isFull && !isAlreadyRegistered) return 'Join Waitlist';
    return `Register for ₹${tournament.entryFee}`;
  };

  const isRegisterDisabled = (isAlreadyRegistered && !isPendingPayment) || (isClosed && !isPendingPayment) || (isWaitlisted && !isPendingPayment) || (isFull && !isAlreadyRegistered && !isPendingPayment && !onJoinWaitlist);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#64748B" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.card}>
            {/* Wallet Balance Badge — only for regular users */}
            {isRegularUser && (
              <View style={styles.walletBadge}>
                <Text style={styles.walletLabel}>Wallet Balance</Text>
                <Text style={styles.walletAmount}>₹{user?.credits || 0}</Text>
              </View>
            )}

            {/* Title & Description */}
            <Text style={styles.title}>{tournament.title}</Text>
            <Text style={styles.description}>{tournament.description || 'No description provided.'}</Text>

            {/* Info Grid */}
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Prize Pool</Text>
                <Text style={[styles.gridValue, { color: '#EF4444' }]}>₹{tournament.prizePool || 'N/A'}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Format</Text>
                <Text style={styles.gridValue}>{tournament.format || 'N/A'}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Date</Text>
                <Text style={styles.gridValue}>{tournament.date}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Venue</Text>
                <Text style={styles.gridValue}>{tournament.location}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Players</Text>
                <Text style={styles.gridValue}>{tournament.registeredPlayerIds?.length || 0}/{tournament.maxPlayers}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Level</Text>
                <Text style={styles.gridValue}>{tournament.skillLevel}</Text>
              </View>
            </View>

            {/* Admin Host Info */}
            {isAdminUser && creator && (
              <View style={styles.hostedByCard}>
                <Text style={styles.hostedByLabel}>Hosted By</Text>
                <View style={styles.hostedByRow}>
                  <View>
                    <Text style={styles.hostedByName}>{creator.name}</Text>
                    <Text style={styles.hostedByTier}>Academy</Text>
                  </View>
                  <Ionicons name="business" size={16} color="#F87171" />
                </View>
              </View>
            )}

            {/* Registration Area — Regular Users */}
            {isRegularUser && (
              <View style={styles.actionArea}>
                {isAlreadyRegistered && !isPendingPayment && (
                  <Text style={styles.alreadyRegistered}>You are already registered</Text>
                )}
                {isWaitlisted && !isPendingPayment && (
                  <Text style={styles.alreadyRegistered}>You are in the waitlist</Text>
                )}
                {isClosed && !isAlreadyRegistered && !isPendingPayment && (
                  <View style={styles.closedContactContainer}>
                    <Text style={styles.closedMessageTitle}>Registration Closed.</Text>
                    <Text style={styles.closedMessageSub}>Kindly get in touch with the academy to register for the tournament</Text>
                    
                    {isRejected ? (
                      <View style={styles.rejectionBlock}>
                        <Ionicons name="information-circle-outline" size={20} color="#EF4444" />
                        <Text style={styles.rejectionText}>
                          Academy has declined the registration and are no longer accepting responses, Kindly check other tournaments
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.interestActions}>
                        <TouchableOpacity 
                           style={[styles.interestBtn, isInterested && styles.interestedBtnActive]}
                           onPress={handleInterestPress}
                        >
                          <Text style={[styles.interestBtnText, isInterested && styles.interestedBtnTextActive]}>
                            {isInterested ? 'Interested' : 'Interested'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.detailsBtn}
                          onPress={() => setShowAcademyDetails(!showAcademyDetails)}
                        >
                          <Text style={styles.detailsBtnText}>
                            {showAcademyDetails ? 'Hide Details' : 'Academy Details'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {showAcademyDetails && creator && (
                      <View style={styles.academyContactInfo}>
                        <View style={styles.academyContactRow}>
                          <Ionicons name="business" size={14} color="#64748B" />
                          <Text style={styles.academyContactLabel}>Academy:</Text>
                          <Text style={styles.academyContactValue}>{creator.name}</Text>
                        </View>
                        <View style={styles.academyContactRow}>
                          <Ionicons name="call" size={14} color="#3B82F6" />
                          <Text style={styles.academyContactLabel}>Contact:</Text>
                          <Text style={styles.academyContactValue}>{creator.phone || 'N/A'}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
                {isFull && !isAlreadyRegistered && !isPendingPayment && !isClosed && !isWaitlisted && (
                  <Text style={styles.alreadyRegistered}>Slots Full - Waitlist Available</Text>
                )}
                <TouchableOpacity
                  onPress={handleRegister}
                  disabled={isRegisterDisabled}
                  style={[
                    styles.registerBtn,
                    isPendingPayment && { backgroundColor: '#F97316' },
                    isWaitlisted && { backgroundColor: '#64748B' },
                    isRegisterDisabled && styles.registerBtnDisabled,
                  ]}
                >
                  <Text style={styles.registerBtnText}>{getRegisterBtnLabel()}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Coach Actions */}
            {isCoach && (
              <View style={styles.actionArea}>
                {isAssignedCoach ? (
                  <>
                    <View style={styles.assignedBox}>
                      <Text style={styles.assignedLabel}>Assigned</Text>
                      <Text style={styles.assignedDesc}>You are assigned as a coach for this event.</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Cancel', 'Cancel your coaching assignment?', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes', style: 'destructive', onPress: () => onClose() },
                      ])}
                      style={styles.cancelAssignmentBtn}
                    >
                      <Text style={styles.cancelAssignmentText}>Cancel Assignment</Text>
                    </TouchableOpacity>
                  </>
                ) : tournament.assignedCoachId ? (
                  <View style={styles.managementBanner}>
                    <Text style={styles.managementLabel}>Coach Assigned</Text>
                    <Text style={styles.managementDesc}>A coach has already been assigned to this event.</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleOptIn} style={styles.coachOptInBtn}>
                    <Text style={styles.coachOptInText}>Opt-in as Coach</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Admin / Academy Management Banner */}
            {(isAdminUser || isAcademyUser) && (
              <View style={styles.managementBanner}>
                <Text style={styles.managementLabel}>{isAdminUser ? 'Admin Preview' : 'Academy Mode'}</Text>
                <Text style={styles.managementDesc}>Management mode enabled. Registration disabled.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    position: 'relative',
  },
  walletBadge: {
    position: 'absolute',
    top: 24,
    right: 24,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  walletLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  walletAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    marginTop: 8,
    marginBottom: 12,
    paddingRight: 80,
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridItem: {
    width: '47%',
    backgroundColor: '#F2F4F7',
    borderRadius: 24,
    padding: 20,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  gridValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  hostedByCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  hostedByLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  hostedByRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hostedByName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  hostedByTier: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  actionArea: {
    marginTop: 8,
    gap: 12,
  },
  alreadyRegistered: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  registerBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  registerBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  registerBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  coachOptInBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  coachOptInText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  assignedBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#BBF7D0',
  },
  assignedLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16A34A',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  assignedDesc: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#15803D',
    marginTop: 4,
    textAlign: 'center',
  },
  cancelAssignmentBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cancelAssignmentText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  managementBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  managementLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  managementDesc: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  closedContactContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  closedMessageTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closedMessageSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: 16,
  },
  interestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  interestBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  interestedBtnActive: { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1' },
  interestedBtnTextActive: { color: '#64748B' },
  detailsBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  detailsBtnText: { color: '#475569', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  rejectionBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 10,
    marginTop: 8
  },
  rejectionText: {
    flex: 1,
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    lineHeight: 18
  },
  academyContactInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  academyContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  academyContactLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    width: 70,
  },
  academyContactValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
});

export default TournamentDetailModal;
