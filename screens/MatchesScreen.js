import React, { useState, useEffect, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, SafeAreaView, Dimensions, Modal, Image, Alert, InteractionManager
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeAvatar from '../components/SafeAvatar';
import TournamentBracket from '../components/TournamentBracket';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import logger from '../utils/logger';
import { parseTournamentDateTime, isTournamentPast } from '../utils/tournamentUtils';
import MatchCard from '../components/MatchCard';
import { useIsFocused } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { RosterRow } from '../components/MatchesSubComponents';

// Styles
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');





import { useAuth } from '../context/AuthContext';
import { useTournaments } from '../context/TournamentContext';
import { usePlayers } from '../context/PlayerContext';
import { useVideos } from '../context/VideoContext';
import { useSupport } from '../context/SupportContext';
import { useAdmin } from '../context/AdminContext';

const MatchesScreen = ({ route, navigation }) => {
  const { currentUser: user } = useAuth();
  const { 
    tournaments, onReschedule, onOptOut, onStartTournament, onEndTournament, 
    onUpdateTournament, onRegister, onAssignCoach, onConfirmCoachRequest, onDeclineCoachRequest 
  } = useTournaments();
  const { players } = usePlayers();
  const { 
    evaluations, onSaveEvaluation, matchVideos, onSaveCoachComment 
  } = useVideos(); // Evaluations are in VideoContext currently
  const { supportTickets, onSaveTicket, onReplyTicket } = useSupport();
  const { onLogFailedOtp } = useAdmin();
  const [viewMode, setViewMode] = useState(route?.params?.viewMode || 'upcoming');
  
  // 🛡️ v2.6.87: Reactively update viewMode when params change (Fix for deep-linking when screen is already mounted)
  useEffect(() => {
    if (route?.params?.viewMode) {
      setViewMode(route.params.viewMode);
    }
  }, [route?.params?.viewMode]);
  const [showOtpModal, setShowOtpModal] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [viewingPlayersFor, setViewingPlayersFor] = useState(null);
  const [evaluatingPlayer, setEvaluatingPlayer] = useState(null);
  const [viewingHistoryForPlayer, setViewingHistoryForPlayer] = useState(null);
  const [evaluationScores, setEvaluationScores] = useState({});
  const [analyzingVideo, setAnalyzingVideo] = useState(null);
  const [regPaymentTarget, setRegPaymentTarget] = useState(null);
  const [rosterTab, setRosterTab] = useState('roster');

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    logger.logAction('Matches View Mode Changed', { mode: viewMode });
  }, [viewMode]);

  // 🧪 [E2E DIAGNOSTIC] Temporary debug log to understand Phase 4 data flow
  if (__DEV__) {
    console.log('--- MatchesScreen Render ---', { 
      userId: user?.id, 
      userRole: user?.role, 
      viewMode, 
      totalTournaments: tournaments?.length,
      tournamentTitles: (tournaments || []).map(t => t.title),
      assignedCount: (tournaments || []).filter(t => 
        (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(user?.id).toLowerCase()) ||
        (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(user?.id).toLowerCase())
      ).length,
      pendingPaymentMatches: (tournaments || []).filter(t => 
        (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(user?.id).toLowerCase())
      ).map(t => t.title)
    });
  }

  if (!user) return null;

  const isCoach = user.role === 'coach';

  const renderItem = React.useCallback(({ item }) => (
    <MatchCard 
      match={item}
      user={user}
      viewMode={viewMode}
      isCoach={isCoach}
      onConfirmCoachRequest={onConfirmCoachRequest}
      onDeclineCoachRequest={onDeclineCoachRequest}
      setShowOtpModal={setShowOtpModal}
      setRegPaymentTarget={setRegPaymentTarget}
      onReschedule={onReschedule}
      onOptOut={onOptOut}
      setViewingPlayersFor={setViewingPlayersFor}
      setRosterTab={setRosterTab}
      navigation={navigation}
    />
  ), [user, viewMode, isCoach, onConfirmCoachRequest, onDeclineCoachRequest, onReschedule, onOptOut, navigation]);

  useEffect(() => {
    if (isCoach) {
      // Coach debugs removed per request
    }
  }, [user, tournaments, isCoach]);

  const assignedTournaments = useMemo(() => {
    if (isCoach) {
      return (tournaments || []).filter(t => String(t.assignedCoachId).toLowerCase() === String(user.id).toLowerCase());
    }
    return (tournaments || []).filter(t => 
      (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase()) || 
      (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase()) ||
      (t.waitlistedPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase())
    );
  }, [isCoach, tournaments, user.id]);

  const requestTournaments = useMemo(() => {
    if (!isCoach) return [];
    return (tournaments || []).filter(t =>
      t.coachAssignmentType === 'platform' &&
      t.coachStatus === 'Awaiting Coach Confirmation' &&
      !t.declinedCoachIds?.includes(user.id) &&
      !isTournamentPast(t)
    );
  }, [isCoach, tournaments, user.id]);

  const displayedMatches = useMemo(() => {
    if (viewMode === 'requests') return requestTournaments || [];
    
    return (assignedTournaments || []).filter(t => {
      const isPast = isTournamentPast(t);
      if (viewMode === 'upcoming') {
        return t.status !== 'completed' && !t.tournamentConcluded && (!isPast || t.tournamentStarted);
      } else {
        return t.status === 'completed' || t.tournamentConcluded || (isPast && !t.tournamentStarted);
      }
    });
  }, [viewMode, requestTournaments, assignedTournaments]);

  const getReliabilityVerdict = (p) => {
    const noShows = p.noShows || 0;
    const cancellations = p.cancellations || 0;
    const matches = p.matchesPlayed || 0;

    if (noShows > 2 || (matches > 5 && noShows / matches > 0.2)) {
      return { label: 'High Alert', color: '#EF4444', bg: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' } };
    }
    if (noShows > 0 || cancellations > 2) {
      return { label: 'Caution', color: '#EA580C', bg: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FFEDD5' } };
    }
    if (matches > 10 && noShows === 0) {
      return { label: 'Elite Pro', color: '#059669', bg: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' } };
    }
    return { label: 'Verified', color: '#2563EB', bg: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE' } };
  };

  const getEvaluationQuestions = (sport) => {
    if (sport === 'Badminton') {
      return [
        { id: 'serve', label: 'Serve Quality', desc: 'How accurate and consistent were the player’s serves?' },
        { id: 'control', label: 'Shot Control & Accuracy', desc: 'How well did the player control clears, drops, and drives?' },
        { id: 'backhand', label: 'Backhand Performance', desc: 'How effective were the player’s backhand shots?' },
        { id: 'smash', label: 'Smash Execution', desc: 'How powerful and well placed were the smash hits?' },
        { id: 'footwork', label: 'Footwork & Court Movement', desc: 'How efficiently did the player move around the court?' },
        { id: 'defense', label: 'Defensive Ability', desc: 'How well did the player defend difficult shots or smashes?' },
        { id: 'coordination', label: 'Team Coordination', desc: 'How well did the player coordinate with their partner? (for doubles)' },
        { id: 'consistency', label: 'Consistency & Focus', desc: 'How consistent was the player throughout the match?' }
      ];
    } else if (sport === 'Table Tennis') {
      return [
        { id: 'serve', label: 'Serve quality and variation', desc: '' },
        { id: 'return', label: 'Return of serve and spin control', desc: '' },
        { id: 'stroke', label: 'Forehand and backhand stroke quality', desc: '' },
        { id: 'placement', label: 'Ball placement and rally consistency', desc: '' },
        { id: 'reaction', label: 'Reaction time and footwork', desc: '' },
        { id: 'tactical', label: 'Tactical awareness and decision making', desc: '' },
        { id: 'consistency', label: 'Consistency during rallies', desc: '' }
      ];
    }
    return [];
  };

  const handleOpenEvaluation = (player, tournament) => {
    const existingEval = evaluations.find(e => 
      String(e.playerId).toLowerCase() === String(player.id).toLowerCase() && 
      String(e.tournamentId) === String(tournament.id) && 
      String(e.coachId) === String(user?.id) && 
      (e.round || 1) === (tournament.currentRound || 1)
    );
    if (existingEval) {
      setEvaluationScores(existingEval.scores);
    } else {
      setEvaluationScores({});
    }
    setEvaluatingPlayer({ player, tournament });
  };

  const handleScoreChange = (questionId, score) => {
    setEvaluationScores(prev => ({ ...prev, [questionId]: score }));
  };

  const handleSubmitEvaluation = () => {
    if (!evaluatingPlayer || !user) return;

    const questions = getEvaluationQuestions(evaluatingPlayer?.tournament?.sport);
    if (Object.keys(evaluationScores).length < questions.length) {
      Alert.alert('Error', 'Please rate all questions before submitting.');
      return;
    }

    const scoresArray = Object.values(evaluationScores);
    const totalScore = scoresArray.reduce((sum, score) => sum + score, 0);
    const averageScore = Number((totalScore / questions.length).toFixed(1));

    const newEvaluation = {
      id: `eval_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      playerId: evaluatingPlayer?.player?.id,
      coachId: user?.id,
      tournamentId: evaluatingPlayer?.tournament?.id,
      date: new Date().toISOString(),
      sport: evaluatingPlayer?.tournament?.sport,
      scores: evaluationScores,
      averageScore,
      round: evaluatingPlayer?.tournament?.currentRound || 1
    };

    onSaveEvaluation(newEvaluation);
    setEvaluatingPlayer(null);
    setEvaluationScores({});
  };

  const handleVerifyOtp = (modalData) => {
    const latestTournament = tournaments.find(t => t.id === modalData.tournament.id) || modalData.tournament;
    const { type } = modalData;
    const t = latestTournament;
    const tDate = new Date(t.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // BUFFER: Allow a 7-day grace period for coaches to finalize past events
    const bufferDate = new Date(tDate);
    bufferDate.setDate(bufferDate.getDate() + 7);

    if (today > bufferDate && t.status !== 'completed' && t.status !== 'ongoing') {
      Alert.alert("Expired", "This OTP has expired. Please contact the academy for a new session code.");
      return;
    }

    const expectedOtp = type === 'start' ? t.startOtp : t.endOtp;
    if (!expectedOtp || otpInput.trim() === expectedOtp) {
      if (type === 'start') {
        onStartTournament(t.id);
        setViewingPlayersFor(t);
      } else {
        if (!t.ratingsModified && user.role !== 'admin') {
          Alert.alert("Action Required", "Cannot end tournament: Player ratings must be modified before ending the tournament.");
          return;
        }
        onEndTournament(t.id);
      }
      setShowOtpModal(null);
      setOtpInput('');
    } else {
      Alert.alert("Error", "Invalid access: This OTP is not correct.");
      onLogFailedOtp(t.id, user.id, otpInput);
    }
  };

  const renderPaymentModal = () => {
    if (!regPaymentTarget) return null;

    const totalAdjustedCost = regPaymentTarget.entryFee;
    const canPayWithCredits = (user?.credits || 0) >= totalAdjustedCost;

    const finalize = (method) => {
        console.log(`🧪 [JS_DEBUG] Finalize called with method: ${method}`);
        const result = onRegister(regPaymentTarget, method, totalAdjustedCost, false, null);
        console.log('🧪 [JS_DEBUG] onRegister completed, clearing regPaymentTarget');
        
        if (result && result.success) {
            setRegPaymentTarget(null);
            
            if (!__DEV__) {
                setTimeout(() => {
                    if (result.type === 'UPI_PENDING') {
                        Alert.alert(
                            "Verification Pending", 
                            "Your registration is being processed. Please share the payment screenshot with the organizer or wait for admin confirmation."
                        );
                    } else {
                        Alert.alert("Success", "Registration successful!");
                    }
                }, 300);
            } else {
                console.log('🧪 [JS_DEBUG] Bypassing native success alert for E2E reliability');
            }
        }
    };

    return (
        <Modal testID="matches.payment.modal" transparent animationType={__DEV__ ? "none" : "fade"} visible={!!regPaymentTarget}>
            <View testID="matches.payment.modalContent" style={styles.modalOverlay}>
                <View style={styles.paymentSheet}>
                    <View style={styles.paymentHeader}>
                        <Text style={styles.paymentTitle}>Select Payment</Text>
                        <TouchableOpacity onPress={() => setRegPaymentTarget(null)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.paymentSummary}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={[styles.summaryLabel, { flex: 1 }]}>Registration Fee</Text>
                            <Text style={[styles.summaryLabel, { flex: 1, textAlign: 'right' }]}>Wallet Balance</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Text 
                                style={[styles.summaryValue, { flex: 1, color: '#EF4444' }]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                ₹{totalAdjustedCost}
                            </Text>
                            <Text 
                                style={[styles.summaryValue, { flex: 1, textAlign: 'right', color: '#334155' }, !canPayWithCredits && { color: '#EF4444' }]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                ₹{user?.credits || 0}
                            </Text>
                        </View>
                        {!canPayWithCredits && (
                            <Text style={styles.insufficientText}>Insufficient AceTrack credits</Text>
                        )}
                    </View>

                    <View style={styles.paymentActions}>
                        <TouchableOpacity 
                            testID="matches.payment.payBtn"
                            disabled={!canPayWithCredits}
                            onPress={() => finalize('credits')}
                            style={[styles.payBtn, !canPayWithCredits && styles.payBtnDisabled]}
                        >
                            <Text style={[styles.payBtnText, !canPayWithCredits && styles.payBtnTextDisabled]}>Pay with Wallet</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            testID="matches.payment.upiBtn"
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
    <View testID="matches.screen.container" style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Matches</Text>
          <Text style={styles.headerSubtitle}>Your Schedule</Text>
        </View>
        <View style={styles.tabs}>
          {isCoach && (
            <TouchableOpacity
              onPress={() => setViewMode('requests')}
              style={[styles.tab, viewMode === 'requests' && styles.tabActive]}
            >
              <Text style={[styles.tabText, viewMode === 'requests' && styles.tabTextActive]}>
                Requests {requestTournaments.length > 0 && <Text style={styles.countBadge}>{requestTournaments.length}</Text>}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setViewMode('upcoming')}
            style={[styles.tab, viewMode === 'upcoming' && styles.tabActive]}
          >
            <Text style={[styles.tabText, viewMode === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('past')}
            style={[styles.tab, viewMode === 'past' && styles.tabActive]}
          >
            <Text style={[styles.tabText, viewMode === 'past' && styles.tabTextActive]}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        testID="matches.list"
        data={displayedMatches}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View testID="matches.empty" style={styles.empty}>
            <Text style={styles.emptyText}>No {viewMode} matches</Text>
          </View>
        }
      />

      {/* OTP Modal */}
      {!!showOtpModal && (
        <Modal visible={!!showOtpModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Enter {showOtpModal?.type === 'start' ? 'Start' : 'End'} Event OTP</Text>
              <Text style={styles.modalSubtitle}>Please enter the {showOtpModal?.type} OTP provided by the academy for {showOtpModal?.tournament?.title}.</Text>
              <TextInput
                style={styles.otpInput}
                value={otpInput}
                onChangeText={setOtpInput}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor="#CBD5E1"
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => handleVerifyOtp(showOtpModal)} style={[styles.modalButton, styles.buttonBlue]}>
                  <Text style={styles.buttonText}>Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowOtpModal(null); setOtpInput(''); }} style={[styles.modalButton, styles.buttonWhite]}>
                  <Text style={[styles.buttonText, { color: '#64748B' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Evaluation Modal */}
      {!!evaluatingPlayer && (
        <Modal visible={!!evaluatingPlayer} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.modalLarge]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Evaluate Player</Text>
                  <Text style={styles.modalSubtitleLabel}>{evaluatingPlayer?.player?.name?.toUpperCase()}</Text>
                </View>
                <TouchableOpacity onPress={() => { setEvaluatingPlayer(null); setEvaluationScores({}); }} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.evalList} showsVerticalScrollIndicator={false}>
                {evaluatingPlayer && getEvaluationQuestions(evaluatingPlayer?.tournament?.sport).map((q) => (
                  <View key={q.id} style={styles.evalItem}>
                    <View style={styles.evalItemHeader}>
                      <Text style={styles.evalLabel}>{q.label}</Text>
                      <View style={styles.scoreBadge}>
                        <Text style={styles.scoreBadgeText}>{evaluationScores[q.id] || 0}/10</Text>
                      </View>
                    </View>
                    {q.desc ? <Text style={styles.evalDesc}>{q.desc}</Text> : null}
                    <View style={styles.sliderContainer}>
                      <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={10}
                        step={1}
                        value={evaluationScores[q.id] || 0}
                        onValueChange={(value) => handleScoreChange(q.id, value)}
                        minimumTrackTintColor="#2563EB"
                        maximumTrackTintColor="#E2E8F0"
                        thumbTintColor="#2563EB"
                      />
                    </View>
                    <View style={styles.evalRange}>
                      <Text style={styles.rangeText}>Poor</Text>
                      <Text style={styles.rangeText}>Excellent</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={handleSubmitEvaluation} style={styles.submitEvalButton}>
                <LinearGradient
                  colors={['#3B82F6', '#8B5CF6', '#EC4899']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitEvalGradient}
                >
                  <Text style={styles.submitEvalButtonText}>Submit Evaluation</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Enhanced Coach Player View Modal */}
      {!!viewingPlayersFor && (
        <Modal visible={!!viewingPlayersFor && !evaluatingPlayer && !viewingHistoryForPlayer} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.modalLarge]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Player Roster</Text>
                  <Text style={styles.modalSubtitleLabel}>{viewingPlayersFor?.title} - Round {viewingPlayersFor?.currentRound || 1}</Text>
                </View>
                <TouchableOpacity onPress={() => setViewingPlayersFor(null)} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {viewingPlayersFor && (() => {
                const activeTournament = tournaments.find(t => t.id === viewingPlayersFor.id) || viewingPlayersFor;
                const isDoubles = activeTournament?.format?.includes('Doubles');
                const currentRound = activeTournament?.currentRound || 1;
                const playerStatuses = activeTournament?.playerStatuses || {};
                const roundDecisions = activeTournament?.roundDecisions || {};
                const currentRoundDecisions = roundDecisions[currentRound] || {};

                const activePlayerIds = (activeTournament?.registeredPlayerIds || []).filter(id => playerStatuses[id] !== 'Eliminated');
                
                // 🛡️ v2.6.99: Include opted-out players in roster view for visibility
                const optedOutIds = (activeTournament?.optedOutPlayerIds || []).filter(id => 
                  !(activeTournament?.registeredPlayerIds || []).includes(id)
                );
                const allRosterIds = [...activePlayerIds, ...optedOutIds];

                const teams = [];
                if (isDoubles) {
                  // Only pair active (non-opted-out) players into doubles teams
                  const doublesActiveIds = activePlayerIds.filter(id => playerStatuses[id] !== 'Opted-Out');
                  const playerRatings = doublesActiveIds.map(id => {
                    const p = players.find(player => String(player.id).toLowerCase() === String(id).toLowerCase()) || (String(id).toLowerCase() === String(user?.id).toLowerCase() ? user : null);
                    if (!p) return { id, rating: 0 };
                    
                    const playerEvaluations = evaluations.filter(e => String(e.playerId).toLowerCase() === String(p.id).toLowerCase() && String(e.tournamentId).toLowerCase() === String(activeTournament?.id).toLowerCase());
                    const cumulativeAvg = playerEvaluations.length > 0 
                      ? (playerEvaluations.reduce((sum, e) => sum + e.averageScore, 0) / playerEvaluations.length)
                      : (p.rating || 0);
                      
                    return { id, rating: cumulativeAvg };
                  });
                  
                  playerRatings.sort((a, b) => b.rating - a.rating);
                  const sortedPlayerIds = playerRatings.map(pr => pr.id);
                  
                  const numTeams = Math.ceil(sortedPlayerIds.length / 2);
                  for (let i = 0; i < numTeams; i++) {
                    const teamId = `team_${i}`;
                    const p1 = sortedPlayerIds[i];
                    const p2 = sortedPlayerIds[sortedPlayerIds.length - 1 - i];
                    const teamPlayerIds = p1 === p2 ? [p1] : [p1, p2];
                    teams.push({ id: teamId, name: `Team ${String.fromCharCode(65 + i)}`, playerIds: teamPlayerIds, isPending: false });
                  }
                  // Append opted-out players as individual entries for visibility
                  optedOutIds.forEach(id => {
                    const p = players.find(player => String(player.id).toLowerCase() === String(id).toLowerCase());
                    teams.push({ id: `optout_${id}`, name: p?.name || `Player ${id}`, playerIds: [id], isPending: false });
                  });
                } else {
                  allRosterIds.forEach(id => {
                    const p = players.find(player => String(player.id).toLowerCase() === String(id).toLowerCase()) || (String(id).toLowerCase() === String(user?.id).toLowerCase() ? user : null);
                    teams.push({ id, name: p?.name || `Player ${id}`, playerIds: [id], isPending: false });
                  });
                }

                if (teams.length === 0) {
                  return (
                    <View style={styles.emptyHistory}>
                      <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                      <Text style={styles.emptyHistoryTitle}>No Participants Yet</Text>
                      <Text style={styles.emptyHistoryText}>Players will appear here once they register or are invited by the academy.</Text>
                    </View>
                  );
                }

                const allTeamsEvaluated = teams.every(team =>
                  team.isPending || team.playerIds.every(id =>
                    evaluations.some(e => String(e.playerId).toLowerCase() === String(id).toLowerCase() && String(e.tournamentId) === String(activeTournament?.id) && String(e.coachId) === String(user?.id) && (e.round || 1) === currentRound)
                  )
                );

                const allTeamsDecided = teams.every(team => team.isPending || currentRoundDecisions[team.id] !== undefined);

                return (
                  <View style={{ flex: 1, minHeight: 200 }}>
                    <FlashList
                      data={teams}
                      keyExtractor={t => t.id}
                      estimatedItemSize={80}
                      renderItem={({ item: team }) => {
                      const decision = currentRoundDecisions[team.id];
                      const teamEvaluated = team.playerIds.every(id =>
                        evaluations.some(e => String(e.playerId).toLowerCase() === String(id).toLowerCase() && String(e.tournamentId).toLowerCase() === String(activeTournament?.id).toLowerCase() && String(e.coachId).toLowerCase() === String(user?.id).toLowerCase() && (e.round || 1) === currentRound)
                      );
                      return (
                        <RosterRow 
                          team={team}
                          teamEvaluated={teamEvaluated}
                          decision={decision}
                          activeTournament={activeTournament}
                          currentRound={currentRound}
                          players={players}
                          evaluations={evaluations}
                          user={user}
                          onUpdateTournament={onUpdateTournament}
                          setEvaluatingPlayer={setEvaluatingPlayer}
                          setEvaluationScores={setEvaluationScores}
                          setViewingHistoryForPlayer={setViewingHistoryForPlayer}
                          handleOpenEvaluation={handleOpenEvaluation}
                          styles={styles}
                        />
                      );
                    }}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={
                      allTeamsEvaluated && allTeamsDecided && teams.length > 1 && (activeTournament?.status !== 'completed' && !activeTournament?.tournamentConcluded) ? (
                        <TouchableOpacity
                          onPress={() => {
                            const nextRoundTeams = teams.filter(t => currentRoundDecisions[t.id] === 'Qualified');
                            if (nextRoundTeams.length <= 1) {
                              onEndTournament(activeTournament);
                              setViewingPlayersFor(null);
                            } else {
                              onUpdateTournament({ ...activeTournament, currentRound: currentRound + 1 });
                            }
                          }}
                          style={[styles.actionButton, styles.buttonBlue, { marginTop: 20 }]}
                        >
                          <Text style={styles.buttonText}>
                            {teams.filter(t => currentRoundDecisions[t.id] === 'Qualified').length <= 1 ? 'End Tournament' : `Proceed to Round ${currentRound + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ) : null
                    }
                  />
                  </View>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}


      {/* Verification History Modal */}
      {!!viewingHistoryForPlayer && (
        <Modal visible={!!viewingHistoryForPlayer} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.modalLarge]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Performance History</Text>
                  <Text style={styles.modalSubtitleLabel}>{viewingHistoryForPlayer?.name} • Tournament Archive</Text>
                </View>
                <TouchableOpacity onPress={() => setViewingHistoryForPlayer(null)} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                {viewingHistoryForPlayer && evaluations.filter(e => String(e.playerId).toLowerCase() === String(viewingHistoryForPlayer?.id).toLowerCase()).length > 0 ? (
                  evaluations.filter(e => String(e.playerId).toLowerCase() === String(viewingHistoryForPlayer?.id).toLowerCase())
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((evalRecord) => {
                      const t = tournaments.find(t => t.id === evalRecord.tournamentId);
                      return (
                        <View key={evalRecord.id} style={styles.historyItem}>
                          <View style={styles.historyItemHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.historyTournament}>{t?.title || 'Unknown Tournament'}</Text>
                              <Text style={styles.historyMeta}>{evalRecord.sport} • {new Date(evalRecord.date).toLocaleDateString()}</Text>
                            </View>
                            <View style={styles.historyScoreBox}>
                              <Text style={styles.historyScoreText}>{evalRecord.averageScore}</Text>
                            </View>
                          </View>
                          <View style={styles.historyScores}>
                            {Object.entries(evalRecord.scores).map(([qId, score]) => {
                              const questions = getEvaluationQuestions(evalRecord.sport);
                              const q = questions.find(question => question.id === qId);
                              return (
                                <View key={qId} style={styles.historyScoreRow}>
                                  <Text style={styles.historyScoreLabel}>{q?.label || qId}</Text>
                                  <Text style={styles.historyScoreVal}>{score}/10</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })
                ) : (
                  <View style={styles.emptyHistory}>
                    <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
                    <Text style={styles.emptyHistoryTitle}>No history found</Text>
                    <Text style={styles.emptyHistoryText}>This player hasn't been evaluated in any tournaments yet.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {renderPaymentModal()}
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 12,
    marginTop: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 8,
  },
  content: {
    padding: 24,
    paddingBottom: 100,
    gap: 32,
  },
  matchCard: {
    backgroundColor: '#F2F4F7',
    borderRadius: 40,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  matchDetails: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  detailBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
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
  buttonVideo: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  buttonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  empty: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 40,
    padding: 32,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  modalLarge: {
    maxHeight: 600,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  otpInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0F172A',
    letterSpacing: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalSubtitleLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
  },
  evalList: {
    maxHeight: 450,
  },
  evalItem: {
    marginBottom: 24,
    gap: 8,
  },
  evalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  scoreBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3B82F6',
  },
  evalDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 4,
  },
  ratingNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  ratingNumActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  ratingNumTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  evalRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sliderContainer: {
    paddingHorizontal: 4,
    marginTop: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  submitEvalButton: {
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitEvalGradient: {
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  submitEvalButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  rangeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
  },
  rosterList: {
    maxHeight: 450,
  },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  rosterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rosterInfo: {
    flex: 1,
  },
  rosterName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
  },
  rosterRating: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  submittedBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 6,
  },
  scoreBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3B82F6',
  },
  buttonBlue: {
    backgroundColor: '#2563EB',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  evalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  evalDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
    marginTop: 2,
  },
  rangeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buttonSuccess: { 
    backgroundColor: '#F0FDF4', 
    borderWidth: 1, 
    borderColor: '#BBF7D0' 
  },
  buttonDanger: { 
    backgroundColor: '#FEF2F2', 
    borderWidth: 1, 
    borderColor: '#FECACA' 
  },
  decisionButtonSuccess: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  decisionButtonDanger: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  decisionTextSuccess: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16A34A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  decisionTextDanger: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  decisionButtonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rosterActions: {
    flexDirection: 'row',
    gap: 6,
  },
  evalButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  evalButtonText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  histButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  histButtonText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalSubtitleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  teamContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  decisionText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  textSuccess: { color: '#10B981' },
  textDanger: { color: '#EF4444' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  decisionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  historyItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyTournament: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  historyMeta: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  historyScoreBox: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 12,
  },
  historyScoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  historyScores: {
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  historyScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyScoreLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  historyScoreVal: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: 16,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  paymentSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  paymentTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  paymentSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
  },
  summaryValueSmall: {
    fontSize: 24,
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
  modalTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9', // Light gray background
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  modalTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalTabText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalTabTextActive: {
    color: '#0F172A',
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  scoreBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreBadgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
});

export default MatchesScreen;
