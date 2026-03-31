import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Modal, TextInput, SafeAreaView, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TournamentBracket from './TournamentBracket';
import { getReliabilityVerdict } from '../utils/verdict';

const { width } = Dimensions.get('window');

const ParticipantsModal = ({ 
  tournament, players, evaluations = [], onClose, onAddPlayer, onRemovePendingPlayer, user, onRequireVerification, onManageInterested
}) => {
  const [tab, setTab] = useState('roster');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);

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

  return (
    <Modal visible animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Participants</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {tab === 'bracket' ? (
            <TournamentBracket tournament={tournament} players={players} />
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
                        <Image 
                          source={{ uri: (c?.avatar && c.avatar !== 'null') ? c.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(c?.name || 'Coach')}&background=007AFF&color=fff` }} 
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
                  <TouchableOpacity onPress={() => setIsAddingPlayer(!isAddingPlayer)} style={styles.addPlayerBtn}>
                    <Text style={styles.addPlayerBtnText}>{isAddingPlayer ? 'Cancel' : '+ Add Player'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isAddingPlayer && (
                <View style={styles.addingForm}>
                  <TextInput
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
                        <Text style={styles.foundText}>Player Found: <Text style={styles.bold}>{newPlayerName}</Text></Text>
                    </View>
                  ) : newPlayerPhone.length >= 10 && (
                    <View style={styles.errorTag}>
                        <Ionicons name="alert-circle" size={16} color="#DC2626" />
                        <Text style={styles.errorText}>No registered player found</Text>
                    </View>
                  )}
                   <TouchableOpacity 
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
                      key={pid} 
                      onPress={() => setExpandedPlayerId(expandedPlayerId === pid ? null : pid)}
                      style={styles.playerCard}
                    >
                      <View style={styles.playerRow}>
                          <Image 
                            key={`${pid}-${p.avatar}`}
                            source={{ uri: (p.avatar && p.avatar !== 'null') ? p.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random` }} 
                            style={styles.avatar} 
                          />
                          <View style={styles.flex}>
                              <Text style={[
                                styles.playerName,
                                (status === 'Denied' || status === 'Opted-Out') && styles.strikeText
                              ]}>{p.name}</Text>
                              <View style={styles.verdictRow}>
                                  <View style={[styles.verdictTag, { backgroundColor: verdict.bg }]}>
                                      <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.label}</Text>
                                  </View>
                                  {(status || isRegistered || isPending || isInterested) && (
                                      <View style={[
                                          styles.verdictTag, 
                                          { 
                                              backgroundColor: 
                                                  status === 'Registered' || isRegistered ? '#DCFCE7' : 
                                                  status === 'Denied' ? '#FEE2E2' : 
                                                  status === 'Opted-Out' ? '#F1F5F9' : 
                                                  isPending ? '#FEF3C7' : 
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
                                                      isInterested ? '#EA580C' : '#64748B'
                                              }
                                          ]}>
                                              {status || (isRegistered ? 'Registered' : isPending ? 'Pending' : isInterested ? 'Interested' : '')}
                                          </Text>
                                      </View>
                                  )}
                              </View>
                          </View>
                          <Ionicons name={expandedPlayerId === pid ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                      </View>
                      
                      {expandedPlayerId === pid && (
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
                      )}
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
});

export default ParticipantsModal;
