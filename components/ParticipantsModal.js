import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Modal, TextInput, SafeAreaView, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from './SafeAvatar';
import TournamentBracket from './TournamentBracket';
import { formatDateIST } from '../utils/tournamentUtils';
import { useSync } from '../context/SyncContext';
import { getReliabilityVerdict } from '../utils/verdict';
import { getCheckInStats, processCheckIn } from '../utils/checkIn';

const { width } = Dimensions.get('window');

const ParticipantsModal = ({ 
  tournament, players, matches = [], evaluations = [], onClose, onAddPlayer, onRemovePendingPlayer, user, onRequireVerification, onManageInterested, onUpdateMatch
}) => {
  const { serverClockOffset } = useSync();
  const [tab, setTab] = useState('roster');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  
  // QR Simulation State
  const [isQRScannerVisible, setIsQRScannerVisible] = useState(false);

  // 🕒 [RegEngine] Roster Timer Component (v2.6.103)
  const PendingTimer = ({ playerId, timestamps }) => {
    const [display, setDisplay] = useState('');

    useEffect(() => {
      const promoTimeStr = timestamps?.[playerId];
      if (!promoTimeStr) return;

      const expiry = new Date(promoTimeStr).getTime() + (30 * 60 * 1000);
      
      const update = () => {
        const now = Date.now() + (serverClockOffset || 0);
        const diff = expiry - now;
        if (diff <= 0) {
          setDisplay('Expiring...');
          return;
        }
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
      };


      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }, [playerId, timestamps]);

    if (!display) return null;
    return (
      <View style={styles.rosterTimer}>
        <Ionicons name="time-outline" size={10} color="#EA580C" />
        <Text testID={`participants.player.timer.${playerId}`} style={styles.rosterTimerText}>{display}</Text>
      </View>
    );
  };

  if (!tournament) return null;

  const isCompleted = tournament.status === 'completed';
  
  // Calculate leaderboard
  const playerScores = new Map();
  const tournamentEvals = (evaluations || []).filter(e => e && e.tournamentId === tournament.id);
  
  (tournament.registeredPlayerIds || []).forEach(pid => {
    const evals = (tournamentEvals || []).filter(e => e && e.playerId === pid);
    if (evals.length > 0) {
      const avg = evals.reduce((sum, e) => sum + (e.averageScore || 0), 0) / evals.length;
      playerScores.set(pid, Number(avg.toFixed(1)));
    } else {
      playerScores.set(pid, 0);
    }
  });
  
  const leaderboard = [...(tournament.registeredPlayerIds || [])].filter(id => !!id).sort((a, b) => (playerScores.get(b) || 0) - (playerScores.get(a) || 0));

  const handleManualCheckIn = (pid) => {
    const result = processCheckIn(tournament, pid);
    if (result.success) {
      // In a real app, this would dispatch via syncOrchestrator
      // For now, we update the local object (caller will persist)
      if (onAddPlayer) {
          // hacky way to trigger an update without full store refactor
          tournament.playerStatuses = result.tournament.playerStatuses;
          setExpandedPlayerId(null); // re-render
      }
    }
  };

  const checkInStats = getCheckInStats(tournament);

  return (
    <Modal visible animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Participants</Text>
          <TouchableOpacity 
            testID="participants.modal.close"
            onPress={onClose} 
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            onPress={() => setTab('roster')} 
            style={[styles.tab, tab === 'roster' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'roster' && styles.tabTextActive]}>Roster</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              if (user && (!user.isEmailVerified || !user.isPhoneVerified)) {
                if (onRequireVerification) {
                    onClose();
                    onRequireVerification();
                }
                return;
              }
              setTab('leaderboard');
            }} 
            style={[styles.tab, tab === 'leaderboard' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setTab('bracket')} 
            style={[styles.tab, tab === 'bracket' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'bracket' && styles.tabTextActive]}>Bracket</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setTab('checkin')} 
            style={[styles.tab, tab === 'checkin' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'checkin' && styles.tabTextActive]}>Check-In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setTab('courts')} 
            style={[styles.tab, tab === 'courts' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'courts' && styles.tabTextActive]}>Courts</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {tab === 'courts' ? (
            <View>
               <View style={styles.sectionHeader}>
                 <Text style={styles.sectionTitle}>Court Assignments</Text>
               </View>
               {(() => {
                 const tMatches = matches.filter(m => m.tournamentId === tournament.id && m.status !== 'Completed');
                 const academyCourts = user?.courts && user.courts.length > 0 
                    ? user.courts.map(c => c.name) 
                    : Array.from({ length: tournament.numCourts || 4 }, (_, i) => `Court ${i + 1}`);

                 if (tMatches.length === 0) {
                    return <Text style={styles.emptyNote}>No active matches available for assignment</Text>;
                 }

                 return academyCourts.map((courtName, index) => {
                   const matchOnCourt = tMatches.find(m => m.courtNumber === courtName && m.status === 'In Progress');
                   
                   return (
                     <View key={`court_${index}`} style={styles.playerCard}>
                        <View style={styles.playerRow}>
                           <View style={[styles.avatar, styles.emptyAvatar, { backgroundColor: matchOnCourt ? '#DCFCE7' : '#F1F5F9' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '900', color: matchOnCourt ? '#16A34A' : '#94A3B8' }}>{index + 1}</Text>
                           </View>
                           <View style={styles.flex}>
                              <Text style={styles.playerName}>{courtName}</Text>
                              <Text style={[styles.roleTag, { color: matchOnCourt ? '#16A34A' : '#D97706' }]}>
                                {matchOnCourt ? 'In Use' : 'Available'}
                              </Text>
                           </View>
                        </View>
                        {matchOnCourt ? (
                          <View style={{ marginTop: 12, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                            <Text style={styles.teamName}>
                              {players.find(p => p.id === matchOnCourt.player1Id)?.name || 'TBD'} vs {players.find(p => p.id === matchOnCourt.player2Id)?.name || 'TBD'}
                            </Text>
                            <TouchableOpacity 
                              style={[styles.manualCheckInBtn, { marginTop: 8, backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                              onPress={() => onUpdateMatch({ ...matchOnCourt, status: 'Scheduled', courtNumber: null })}
                            >
                              <Text style={[styles.manualCheckInText, { color: '#DC2626' }]}>Clear Court</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={{ marginTop: 12, gap: 8 }}>
                              {tMatches.filter(m => !m.courtNumber).map(m => (
                              <TouchableOpacity 
                                key={m.id}
                                style={[styles.manualCheckInBtn, { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }]}
                                onPress={() => onUpdateMatch({ ...m, status: 'In Progress', courtNumber: courtName })}
                              >
                                <Text style={styles.manualCheckInText}>
                                  Assign: {players.find(p => p.id === m.player1Id)?.name || 'TBD'} vs {players.find(p => p.id === m.player2Id)?.name || 'TBD'}
                                </Text>
                                <Ionicons name="arrow-forward" size={14} color="#2563EB" />
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                     </View>
                   );
                 });
               })()}
            </View>
          ) : tab === 'bracket' ? (
            <TournamentBracket tournament={tournament} players={players} />
          ) : tab === 'checkin' ? (
            <View>
              <View style={styles.checkInStatsContainer}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{checkInStats.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                  <Text style={[styles.statNum, { color: '#16A34A' }]}>{checkInStats.checkedIn}</Text>
                  <Text style={[styles.statLabel, { color: '#15803D' }]}>Checked In</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                  <Text style={[styles.statNum, { color: '#DC2626' }]}>{checkInStats.pending}</Text>
                  <Text style={[styles.statLabel, { color: '#B91C1C' }]}>Pending</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.scanQRBtn} 
                onPress={() => setIsQRScannerVisible(!isQRScannerVisible)}
              >
                <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
                <Text style={styles.scanQRText}>Launch QR Scanner</Text>
              </TouchableOpacity>

              {isQRScannerVisible && (
                <View style={styles.scannerSimulation}>
                  <Ionicons name="camera-outline" size={32} color="#94A3B8" style={{ alignSelf: 'center' }} />
                  <Text style={styles.scannerSimTitle}>Camera View (Simulation)</Text>
                  <Text style={styles.scannerSimDesc}>Tap a player below to simulate scanning their QR code.</Text>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Registration Desk</Text>
              </View>

              {(() => {
                const registered = tournament.registeredPlayerIds || [];
                if (registered.length === 0) {
                  return (
                    <Text style={styles.emptyNote}>No players registered yet</Text>
                  );
                }

                return registered.map(pid => {
                  const p = (players || []).find(player => player && String(player.id).toLowerCase() === String(pid).toLowerCase());
                  if (!p) return null;
                  
                  const status = tournament.playerStatuses?.[pid];
                  const isCheckedIn = status === 'Checked-In';

                  return (
                    <View key={pid} style={[styles.playerCard, isCheckedIn && { opacity: 0.7 }]}>
                      <View style={styles.playerRow}>
                        <SafeAvatar uri={p.avatar} name={p.name} size={40} borderRadius={20} style={styles.avatar} />
                        <View style={styles.flex}>
                          <Text style={styles.playerName}>{p.name}</Text>
                          <Text style={[styles.roleTag, { color: isCheckedIn ? '#16A34A' : '#D97706' }]}>
                            {isCheckedIn ? 'Checked In' : 'Awaiting Arrival'}
                          </Text>
                        </View>
                        {!isCheckedIn ? (
                          <TouchableOpacity 
                            style={styles.manualCheckInBtn}
                            onPress={() => handleManualCheckIn(pid)}
                          >
                            <Text style={styles.manualCheckInText}>
                              {isQRScannerVisible ? 'Simulate QR' : 'Check In'}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                        )}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          ) : tab === 'roster' ? (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Coach</Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  const coachId = tournament.assignedCoachId || tournament.confirmedCoachId;
                  if (coachId) setExpandedPlayerId(expandedPlayerId === coachId ? null : coachId);
                }}
                style={styles.coachCard}
              >
                <View style={styles.coachRow}>
                  {tournament.assignedCoachId || tournament.confirmedCoachId ? (() => {
                    const coachId = tournament.assignedCoachId || tournament.confirmedCoachId;
                    const c = (players || []).find(p => p.id === coachId);
                    return (
                      <>
                        <SafeAvatar 
                          uri={c?.avatar} 
                          name={c?.name || 'Coach'} 
                          role={c?.role} 
                          size={40} 
                          borderRadius={20} 
                          style={styles.avatar} 
                        />
                        <View style={styles.flex}>
                          <Text style={styles.playerName}>{c?.name || 'Unknown Coach'}</Text>
                          <Text style={styles.roleTag}>
                            {tournament.assignedCoachId ? 'Assigned Coach' : 'Confirmed Coach'}
                          </Text>
                        </View>
                        <Ionicons name={expandedPlayerId === coachId ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                      </>
                    );
                  })() : tournament.coachStatus === 'Pending Coach Registration' && tournament.invitedCoachDetails ? (
                    <>
                      <View style={[styles.avatar, styles.initials]}>
                        <Text style={styles.initialsText}>{tournament.invitedCoachDetails.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.playerName}>{tournament.invitedCoachDetails.name}</Text>
                        <Text style={[styles.roleTag, { color: '#F97316' }]}>Pending Registration</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.avatar, styles.emptyAvatar]}>
                        <Ionicons name="person" size={20} color="#94A3B8" />
                      </View>
                      <Text style={styles.awaitingText}>Awaiting Assignment</Text>
                    </>
                  )}
                </View>
                {expandedPlayerId === (tournament.assignedCoachId || tournament.confirmedCoachId) && (() => {
                    const coachId = tournament.assignedCoachId || tournament.confirmedCoachId;
                    const c = (players || []).find(p => p.id === coachId);
                    
                    // 🛡️ UI PRIVACY GUARD (v2.6.165): Mask sensitive info for regular users
                    const isAuthorized = user?.role === 'admin' || user?.role === 'coach' || String(user?.id).toLowerCase() === String(coachId).toLowerCase();
                    
                    if (!isAuthorized) {
                      return (
                        <View style={styles.expandedInfo}>
                          <Text style={styles.privacyNote}>Identity verified. Contact info restricted to Admins/Coaches.</Text>
                        </View>
                      );
                    }

                    return (
                        <View style={styles.expandedInfo}>
                            <View style={styles.contactRow}>
                                <Ionicons name="at-outline" size={14} color="#64748B" />
                                <Text style={styles.contactText}>{c?.id || 'N/A'}</Text>
                            </View>
                            <View style={styles.contactRow}>
                                <Ionicons name="call" size={14} color="#64748B" />
                                <Text style={styles.contactText}>{c?.phone || 'N/A'}</Text>
                            </View>
                            <View style={styles.contactRow}>
                                <Ionicons name="mail" size={14} color="#64748B" />
                                <Text style={styles.contactText}>{c?.email || 'N/A'}</Text>
                            </View>
                        </View>
                    );
                })()}
              </TouchableOpacity>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Players</Text>
                {onAddPlayer && !isCompleted && (
                  <TouchableOpacity 
                    testID="participants.addPlayer.toggle"
                    onPress={() => setIsAddingPlayer(!isAddingPlayer)} 
                    style={styles.addPlayerBtn}
                  >
                    <Text style={styles.addPlayerBtnText}>{isAddingPlayer ? 'Cancel' : '+ Add Player'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isAddingPlayer && (
                <View style={styles.addingForm}>
                  <TextInput
                    testID="participants.addPlayer.phoneInput"
                    placeholder="Enter Registered Phone Number"
                    value={newPlayerPhone}
                    onChangeText={text => {
                        setNewPlayerPhone(text);
                        const matched = (players || []).find(p => p && p.phone === text && (p.role === 'user' || !p.role));
                        setNewPlayerName(matched ? matched.name : '');
                    }}
                    style={styles.formInput}
                  />
                  {newPlayerName ? (
                    <View style={styles.foundTag}>
                        <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                        <Text testID="participants.addPlayer.foundText" style={styles.foundText}>Player Found: <Text style={styles.bold}>{newPlayerName}</Text></Text>
                    </View>
                  ) : newPlayerPhone.length >= 10 && (
                    <View style={styles.errorTag}>
                        <Ionicons name="alert-circle" size={16} color="#DC2626" />
                        <Text testID="participants.addPlayer.errorText" style={styles.errorText}>No registered user found with this number.</Text>
                    </View>
                  )}
                   <TouchableOpacity 
                    testID="participants.addPlayer.submitBtn"
                    onPress={() => {
                      if (newPlayerName && newPlayerPhone) {
                        onAddPlayer(newPlayerName, newPlayerPhone);
                        setIsAddingPlayer(false);
                        setNewPlayerName('');
                        setNewPlayerPhone('');
                      }
                    }}
                    disabled={!newPlayerName}
                    style={[styles.submitBtn, !newPlayerName && styles.submitBtnDisabled]}
                   >
                     <Text style={styles.submitBtnText}>Add to Tournament</Text>
                   </TouchableOpacity>
                </View>
              )}

              {(() => {
                const combinedIds = Array.from(new Set([
                  ...(tournament.registeredPlayerIds || []),
                  ...(tournament.pendingPaymentPlayerIds || []),
                  ...(tournament.waitlistedPlayerIds || []),
                  ...(tournament.interestedPlayerIds || []),
                  ...Object.keys(tournament.playerStatuses || {})
                ])).filter(pid => !!pid);

                if (combinedIds.length === 0) {
                  return (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                      <Text style={styles.emptyText}>No registered players yet</Text>
                    </View>
                  );
                }

                return (combinedIds || []).map(pid => {
                  const p = (players || []).find(player => player && String(player.id).toLowerCase() === String(pid).toLowerCase());
                  const status = tournament.playerStatuses?.[pid];
                  const isRegistered = (tournament.registeredPlayerIds || []).includes(pid);
                  const isPending = (tournament.pendingPaymentPlayerIds || []).includes(pid);
                  const isWaitlisted = (tournament.waitlistedPlayerIds || []).includes(pid);
                  const isInterested = (tournament.interestedPlayerIds || []).includes(pid);

                  if (!p) {
                    return (
                      <View key={pid} style={styles.playerCard}>
                        <View style={styles.playerRow}>
                          <View style={[styles.avatar, styles.emptyAvatar]}>
                            <Ionicons name="alert-circle" size={20} color="#DC2626" />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.playerName}>Missing Player Data</Text>
                            <Text style={styles.roleTag}>ID: {pid} ({status || 'No Status'})</Text>
                          </View>
                        </View>
                      </View>
                    );
                  }
                  
                  const verdict = getReliabilityVerdict(p);
                  return (
                    <TouchableOpacity 
                      testID={`participants.player.card.${pid}`}
                      key={pid} 
                      onPress={() => setExpandedPlayerId(expandedPlayerId === pid ? null : pid)}
                      style={styles.playerCard}
                    >
                      <View style={styles.playerRow}>
                          <SafeAvatar 
                            uri={p.avatar} 
                            name={p.name} 
                            role={p.role} 
                            size={40} 
                            borderRadius={20} 
                            style={styles.avatar} 
                          />
                          <View style={styles.flex}>
                              <Text 
                                testID={((status === 'Denied' || status === 'Opted-Out')) 
                                  ? `participants.player.name.strike.${pid}` 
                                  : `participants.player.name.${pid}`}
                                style={[
                                styles.playerName,
                                (status === 'Denied' || status === 'Opted-Out') && styles.strikeText
                              ]}>{p.name}</Text>
                              <View style={styles.verdictRow}>
                                  <View style={[styles.verdictTag, { backgroundColor: verdict.bg }]}>
                                      <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.label}</Text>
                                  </View>
                                  {(status || isRegistered || isPending || isWaitlisted || isInterested) && (
                                      <View style={[
                                          styles.verdictTag, 
                                          { 
                                              backgroundColor: 
                                                  status === 'Registered' || isRegistered ? '#DCFCE7' : 
                                                  status === 'Denied' ? '#FEE2E2' : 
                                                  status === 'Opted-Out' ? '#F1F5F9' : 
                                                  isPending ? '#FEF3C7' : 
                                                  isWaitlisted ? '#E2E8F0' :
                                                  isInterested ? '#FFEDD5' : '#F1F5F9'
                                          }
                                      ]}>
                                          <Text style={[
                                              styles.verdictText, 
                                              { 
                                                  color: 
                                                      status === 'Registered' || isRegistered ? '#16A34A' : 
                                                      status === 'Denied' ? '#DC2626' : 
                                                      status === 'Opted-Out' ? '#64748B' : 
                                                      isPending ? '#D97706' : 
                                                      isWaitlisted ? '#475569' :
                                                      isInterested ? '#EA580C' : '#64748B'
                                              }
                                          ]}>
                                              {status || (isRegistered ? 'Registered' : isPending ? 'Pending' : isWaitlisted ? 'Waitlisted' : isInterested ? 'Interested' : '')}
                                          </Text>
                                      </View>
                                  )}
                                  {isPending && <PendingTimer playerId={pid} timestamps={tournament.pendingPaymentTimestamps} />}
                              </View>
                          </View>
                          <Ionicons name={expandedPlayerId === pid ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                      </View>
                      
                      {expandedPlayerId === pid && (() => {
                          // 🛡️ UI PRIVACY GUARD (v2.6.165): Mask sensitive info for regular users
                          const isAuthorized = user?.role === 'admin' || user?.role === 'coach' || String(user?.id).toLowerCase() === String(pid).toLowerCase();

                          if (!isAuthorized) {
                            return (
                              <View style={styles.expandedInfo}>
                                <Text style={styles.privacyNote}>Identity verified. Contact info restricted to Admins/Coaches.</Text>
                              </View>
                            );
                          }

                          return (
                            <View style={styles.expandedInfo}>
                                <View style={styles.contactRow}>
                                    <Ionicons name="at-outline" size={14} color="#64748B" />
                                    <Text style={styles.contactText}>{p.id}</Text>
                                </View>
                                <View style={styles.contactRow}>
                                    <Ionicons name="call" size={14} color="#64748B" />
                                    <Text style={styles.contactText}>{p.phone}</Text>
                                </View>
                                <View style={styles.contactRow}>
                                    <Ionicons name="mail" size={14} color="#64748B" />
                                    <Text style={styles.contactText}>{p.email}</Text>
                                </View>

                                {isInterested && onManageInterested && (
                                    <View style={styles.actionRow}>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, styles.confirmBtn]}
                                            onPress={() => onManageInterested(pid, 'confirm')}
                                        >
                                            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                                            <Text style={styles.actionBtnText}>Confirm</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, styles.rejectBtn]}
                                            onPress={() => onManageInterested(pid, 'reject')}
                                        >
                                            <Ionicons name="close-circle" size={16} color="#FFFFFF" />
                                            <Text style={styles.actionBtnText}>Reject</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                          );
                      })()}
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>
          ) : (
            <View>
              {leaderboard.length > 0 ? (
                leaderboard.map((pid, index) => {
                    const p = players.find(player => player.id === pid);
                    if (!p) return null;
                    const score = playerScores.get(pid) || 0;
                    const isQualified = tournament.playerStatuses?.[pid] === 'Qualified';
                    const isEliminated = tournament.playerStatuses?.[pid] === 'Eliminated';
                    
                    let statusText = 'Pending';
                    let statusColor = '#94A3B8';
                    if (isCompleted) {
                      statusText = index < leaderboard.length / 2 ? 'Winner' : 'Participant';
                      statusColor = index < leaderboard.length / 2 ? '#16A34A' : '#64748B';
                    } else if (isQualified) {
                      statusText = 'Qualified';
                      statusColor = '#16A34A';
                    } else if (isEliminated) {
                      statusText = 'Better Luck Next Time';
                      statusColor = '#DC2626';
                    }

                    return (
                        <View key={pid} style={styles.leaderboardRow}>
                            <View style={styles.rankBadge}>
                                <Text style={styles.rankText}>{index + 1}</Text>
                            </View>
                            <View style={styles.flex}>
                                <Text style={styles.playerName}>{p.name}</Text>
                                <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                            </View>
                            <View style={styles.scoreContainer}>
                                <Text style={styles.scoreValue}>{score > 0 ? score : '-'}</Text>
                                <Text style={styles.scoreLabel}>Score</Text>
                            </View>
                        </View>
                    );
                })
              ) : (
                <Text style={styles.emptyNote}>No evaluations yet</Text>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  closeBtn: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#0F172A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  coachCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  emptyAvatar: {
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#EA580C',
    fontWeight: '900',
  },
  flex: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  strikeText: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  roleTag: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  awaitingText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  expandedInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 12,
    color: '#475569',
  },
  privacyNote: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  addPlayerBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addPlayerBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  addingForm: {
    backgroundColor: '#EFF6FF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  foundTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  foundText: {
    fontSize: 12,
    color: '#16A34A',
  },
  bold: { fontWeight: 'bold' },
  errorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  playerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  verdictTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verdictText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pendingCard: {
    opacity: 0.7,
  },
  emptyNote: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 40,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  scoreLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  confirmBtn: {
    backgroundColor: '#16A34A',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rosterTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  rosterTimerText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EA580C',
  },
  checkInStatsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statNum: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  scanQRBtn: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    marginBottom: 20,
  },
  scanQRText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  scannerSimulation: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  scannerSimTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
    marginTop: 12,
  },
  scannerSimDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  manualCheckInBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  manualCheckInText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
});

export default ParticipantsModal;
