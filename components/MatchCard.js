import React, { memo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncContext';
import { formatDateIST } from '../utils/tournamentUtils';


const MatchCard = ({
  match: t,
  user,
  viewMode,
  isCoach,
  onConfirmCoachRequest,
  onDeclineCoachRequest,
  setShowOtpModal,
  setRegPaymentTarget,
  onReschedule,
  onOptOut,
  setViewingPlayersFor,
  navigation
}) => {
  const { serverClockOffset } = useSync();
  const rawPendingPayment = user?.id && (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
  const isWaitlisted = user?.id && (t.waitlistedPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
  const [timeLeft, setTimeLeft] = useState('');

  const isDoubles = t.format && ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(t.format);

  // 🛡️ v2.6.583: Check if this is a doubles solo player who already paid their half
  const userLower = user?.id ? String(user.id).toLowerCase() : '';
  const hasAlreadyPaid = userLower && t.playerPaymentMethods && (
    t.playerPaymentMethods[user.id] || t.playerPaymentMethods[userLower]
  );
  const isDoublesSoloPaid = isDoubles && rawPendingPayment && hasAlreadyPaid;
  // If doubles solo and already paid half, don't treat as pending payment
  const isPendingPayment = isDoublesSoloPaid ? false : rawPendingPayment;

  let userTeamCode = null;
  if (isDoubles && user?.id && t.doublesTeams) {
    const userTeam = t.doublesTeams.find(team => team.player1Id === user.id && !team.player2Id);
    if (userTeam) {
      userTeamCode = userTeam.teamCode;
    }
  }


  // 🕒 [RegEngine] Timer Logic: 30-minute reservation countdown (v2.6.103)
  useEffect(() => {
    if (!isPendingPayment || !user?.id) {
      setTimeLeft('');
      return;
    }

    const promoTimeStr = t.pendingPaymentTimestamps?.[user.id];
    if (!promoTimeStr) {
      setTimeLeft('');
      return;
    }

    const promoTime = new Date(promoTimeStr).getTime();
    const expiryTime = promoTime + (30 * 60 * 1000);

    const updateTimer = () => {
      const now = Date.now() + (serverClockOffset || 0);
      const diff = expiryTime - now;


      if (diff <= 0) {
        setTimeLeft('00:00');
        return;
      }

      const mins = Math.floor(diff / 1000 / 60);
      const secs = Math.floor((diff / 1000) % 60);
      setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isPendingPayment, t.pendingPaymentTimestamps, user?.id, serverClockOffset]);


  // 🛡️ v2.6.99: Confirmation dialog before opt-out
  // 💰 v2.6.512: Shows cancellation charge breakdown for paid tournaments
  const handleOptOut = () => {
    const entryFee = t.entryFee || 0;
    const isRegistered = user?.id && (t.registeredPlayerIds || []).some(
      id => String(id).toLowerCase() === String(user.id).toLowerCase()
    );

    // For free tournaments or non-registered players, use simple dialog
    if (entryFee <= 0 || !isRegistered) {
      Alert.alert(
        "Confirm Opt-Out",
        `Are you sure you want to opt out of "${t.title}"? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Opt Out", style: "destructive", onPress: () => onOptOut(t.id) }
        ]
      );
      return;
    }

    // For paid tournaments: calculate and show cancellation charges
    const TournamentService = require('../services/TournamentService').default;
    const chargeInfo = TournamentService.getCancellationChargePercent(t.date, serverClockOffset || 0);
    const cancellationCharge = Math.round(entryFee * (chargeInfo.percent / 100));
    const refundAmount = entryFee - cancellationCharge;

    // 💰 [v2.6.514] Three dialog variants based on cancellation tier:
    // 100% cancellation (<1 day): Only "Opt Out (No Refund)" — nothing to refund
    // Partial (25-50%): Both "Opt Out & Refund" and "Opt Out (No Refund)"
    // 0% (5+ days): Only "Opt Out & Refund" — full refund, no reason to skip

    if (chargeInfo.percent >= 100) {
      // 100% cancellation — no refund possible
      Alert.alert(
        "Confirm Opt-Out",
        `Are you sure you want to opt out of "${t.title}"?\n\n⚠️ ${chargeInfo.label}\n• Entry Fee: ₹${entryFee}\n• No refund will be issued.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Opt Out (No Refund)", style: "destructive", onPress: () => onOptOut(t.id, false) }
        ]
      );
    } else if (chargeInfo.percent > 0) {
      // Partial cancellation — show only the refund option
      Alert.alert(
        "Confirm Opt-Out & Refund",
        `Are you sure you want to opt out of "${t.title}"?\n\n📋 ${chargeInfo.label}\n• Entry Fee: ₹${entryFee}\n• Cancellation Fee: ₹${cancellationCharge}\n• Refund to Wallet: ₹${refundAmount}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Opt Out & Refund", style: "destructive", onPress: () => onOptOut(t.id, true) }
        ]
      );
    } else {
      // 0% cancellation — full refund
      Alert.alert(
        "Confirm Opt-Out & Refund",
        `Are you sure you want to opt out of "${t.title}"?\n\n✅ Full refund of ₹${entryFee} will be credited to your wallet.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Opt Out & Refund", style: "destructive", onPress: () => onOptOut(t.id, true) }
        ]
      );
    }
  };

  return (
    <View testID={`match.card.${t.title}`} style={styles.matchCard}>
      <View style={styles.matchCardHeader}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text testID={`match.card.title`} style={styles.matchTitle}>{t.title}</Text>
          <Text style={styles.matchLocation}>{t.location}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[
            styles.statusBadge,
            viewMode === 'requests' ? styles.statusYellow :
              isDoublesSoloPaid ? styles.statusIndigo :
              isPendingPayment ? styles.statusOrange :
                isWaitlisted ? styles.statusSlate :
                  viewMode === 'upcoming' ? styles.statusRed : styles.statusSlate
          ]}>
            <Text style={[
              styles.statusText,
              viewMode === 'requests' ? styles.textYellow :
                isDoublesSoloPaid ? styles.textIndigo :
                isPendingPayment ? styles.textOrange :
                  isWaitlisted ? styles.textSlate :
                    viewMode === 'upcoming' ? styles.textRed : styles.textSlate
            ]}>
              {viewMode === 'requests' ? 'Requested' : 
               isDoublesSoloPaid ? 'Paid — Awaiting Partner' :
               isPendingPayment ? 'Pending Payment' : 
               isWaitlisted ? 'Waitlisted' :
               viewMode === 'upcoming' ? 'Confirmed' : 'Completed'}
            </Text>
          </View>
          {isPendingPayment && timeLeft !== '' && (
            <View style={styles.cardTimer}>
              <Ionicons name="time-outline" size={10} color="#EA580C" />
              <Text testID="match.card.timer" style={styles.cardTimerText}>{timeLeft}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.matchDetails}>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text 
            style={styles.detailValue} 
            numberOfLines={1} 
            adjustsFontSizeToFit
          >
            {formatDateIST(t.date)}
          </Text>
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Time</Text>
          <Text style={styles.detailValue}>{t.time}</Text>
        </View>
        <TouchableOpacity 
          disabled={!isCoach}
          onPress={() => {
            setRosterTab('roster');
            setViewingPlayersFor(t);
          }}
          style={[styles.detailBox, { borderRightWidth: 0 }]}
        >
          <Text style={[styles.detailLabel, isCoach && { color: '#3B82F6' }]}>Players</Text>
          <Text style={[styles.detailValue, isCoach && { color: '#3B82F6' }]}>{(t.registeredPlayerIds || []).length}/{t.maxPlayers}</Text>
        </TouchableOpacity>
      </View>

      {userTeamCode && (
        <View style={{ backgroundColor: '#EEF2FF', padding: 12, borderRadius: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#C7D2FE' }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#4F46E5', textTransform: 'uppercase', marginBottom: 4 }}>Your Team Code</Text>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#312E81', letterSpacing: 4 }}>{userTeamCode}</Text>
          <Text style={{ fontSize: 10, color: '#6366F1', textAlign: 'center', marginTop: 4 }}>Share this with your partner or wait for matchmaking</Text>
        </View>
      )}

      <View style={styles.matchActions}>
        {viewMode === 'requests' ? (
          <>
            <TouchableOpacity
              onPress={() => onConfirmCoachRequest(t)}
              style={[styles.actionButton, styles.buttonBlue]}
            >
              <Text style={styles.buttonText}>Opt-in as Coach</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDeclineCoachRequest(t)}
              style={[styles.actionButton, styles.buttonWhite]}
            >
              <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Decline</Text>
            </TouchableOpacity>
          </>
        ) : t.status === 'completed' ? (
          <View style={[styles.actionButton, styles.buttonDisabled, { width: '100%' }]}>
            <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Event Concluded</Text>
          </View>
        ) : isCoach ? (
          <>
            {(t.status === 'completed' || t.tournamentConcluded) ? (
              <View style={[styles.actionButton, styles.buttonDisabled, { width: '100%' }]}>
                <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Event Concluded</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => {
                    if (t.tournamentStarted) {
                      setRosterTab('roster');
                      setViewingPlayersFor(t);
                    }
                    else setShowOtpModal({ tournament: t, type: 'start' });
                  }}
                  style={[styles.actionButton, styles.buttonBlue]}
                >
                  <Text style={styles.buttonText}>{t.tournamentStarted ? 'View Players' : 'Start Event'}</Text>
                </TouchableOpacity>

                {t.tournamentStarted && (
                  <TouchableOpacity 
                    onPress={() => navigation.navigate('LiveScoring', { match: t })}
                    style={[styles.actionButton, { backgroundColor: '#000', borderWidth: 1, borderColor: '#333' }]}
                  >
                    <Ionicons name="stats-chart" size={14} color="#fff" />
                    <Text style={[styles.buttonText, { marginLeft: 5 }]}>Live Score</Text>
                  </TouchableOpacity>
                )}
                {t.tournamentStarted ? (
                  <TouchableOpacity
                    onPress={() => setShowOtpModal({ tournament: t, type: 'end' })}
                    style={[styles.actionButton, styles.buttonRed]}
                  >
                    <Text style={styles.buttonText}>End Event</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={handleOptOut} style={[styles.actionButton, styles.buttonWhite]}>
                    <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Cancel Assignment</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        ) : viewMode === 'upcoming' ? (
          <>
            {isDoublesSoloPaid ? (
              <>
                <View style={[styles.actionButton, { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }]}>
                  <Ionicons name="people-outline" size={14} color="#4F46E5" />
                  <Text style={[styles.buttonText, { color: '#4F46E5' }]}>Waiting for Partner</Text>
                </View>
                <TouchableOpacity onPress={handleOptOut} style={[styles.actionButton, styles.buttonWhite]}>
                  <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Opt-out</Text>
                </TouchableOpacity>
              </>
            ) : isPendingPayment ? (
              <>
                <TouchableOpacity testID={`match.card.payBtn.${t.title}`} onPress={() => setRegPaymentTarget(t)} style={[styles.actionButton, styles.buttonOrange]}>
                  <Text style={styles.buttonText}>Pay Now</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOptOut} style={[styles.actionButton, styles.buttonWhite]}>
                  <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Opt-out</Text>
                </TouchableOpacity>
              </>
            ) : isWaitlisted ? (
              <>
                <View testID={`match.card.waitlistedBtn.${t.title}`} style={[styles.actionButton, styles.buttonSlate, { opacity: 0.7 }]}>
                  <Text style={styles.buttonText}>Waitlisted</Text>
                </View>
                <TouchableOpacity testID={`match.card.waitlistOptOutBtn.${t.title}`} onPress={handleOptOut} style={[styles.actionButton, styles.buttonWhite]}>
                  <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Opt-out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => {
                    onReschedule(t);
                    navigation.navigate('Explore');
                  }}
                  style={[styles.actionButton, styles.buttonSlate]}
                >
                  <Text style={styles.buttonText}>Reschedule</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`match.card.optOutBtn.${t.title}`} onPress={handleOptOut} style={[styles.actionButton, styles.buttonWhite]}>
                  <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Opt-out</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <View style={[styles.actionButton, styles.buttonDisabled]}>
            <Text style={[styles.buttonText, { color: '#94A3B8' }]}>Event Concluded</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: '#F2F4F7',
    borderRadius: 40,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  matchTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  matchLocation: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 1,
  },
  statusYellow: { backgroundColor: '#FEF9C3' },
  statusOrange: { backgroundColor: '#FFEDD5' },
  statusRed: { backgroundColor: '#FEF2F2' },
  statusSlate: { backgroundColor: '#F1F5F9' },
  statusIndigo: { backgroundColor: '#EEF2FF' },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  textYellow: { color: '#854D0E' },
  textOrange: { color: '#C2410C' },
  textRed: { color: '#EF4444' },
  textSlate: { color: '#64748B' },
  textIndigo: { color: '#4F46E5' },
  matchDetails: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  detailBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 10,
    fontWeight: '900',
    color: '#334155',
  },
  matchActions: {
    gap: 12,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonBlue: { backgroundColor: '#3B82F6' },
  buttonRed: { backgroundColor: '#EF4444' },
  buttonOrange: { backgroundColor: '#F97316' },
  buttonSlate: { backgroundColor: '#0F172A' },
  buttonWhite: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  buttonDisabled: { backgroundColor: '#F1F5F9' },
  buttonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  cardTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  cardTimerText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EA580C',
  },
});

export default memo(MatchCard);
