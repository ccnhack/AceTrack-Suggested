import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import SafeAvatar from './SafeAvatar';
import PartnerService from '../services/PartnerService';
import { Sport, SkillLevel } from '../types';
import { useTournamentsStore, usePlayersStore } from '../stores';

const DoublesPartnerBoard = ({ requests, user, onAddRequest, onRemoveRequest, routeParams }) => {
  const { tournaments, onRegister } = useTournamentsStore();
  const { players } = usePlayersStore();
  const [filterSport, setFilterSport] = useState('All');
  const [filterCity, setFilterCity] = useState('');
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newSport, setNewSport] = useState(Sport.BADMINTON);
  const [newCity, setNewCity] = useState('');
  const [newSkill, setNewSkill] = useState(SkillLevel.INTERMEDIATE);
  const [newComment, setNewComment] = useState('');
  const [newLinkedTournament, setNewLinkedTournament] = useState(null);
  
  React.useEffect(() => {
    if (routeParams?.createPartnerRequest && routeParams?.tournamentId) {
      setNewLinkedTournament(routeParams.tournamentId);
      if (routeParams.prefilledMessage) {
        setNewComment(routeParams.prefilledMessage);
      }
      setIsModalVisible(true);
    }
  }, [routeParams]);

  const eligibleTournaments = useMemo(() => {
    if (!tournaments || !user) return [];
    
    return tournaments.filter(t => {
       if (t.status === 'completed' || t.status === 'cancelled') return false;
       if (!t.format) return false;
       
       const isMensDoubles = t.format === "Men's Doubles";
       const isWomensDoubles = t.format === "Women's Doubles";
       const isMixedDoubles = t.format === "Mixed Doubles";
       
       if (!isMensDoubles && !isWomensDoubles && !isMixedDoubles) return false;
       
       // NEW RULE: Only show doubles tournaments if the user is ALREADY registered
       const isRegistered = (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase()) || 
                            (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
       if (!isRegistered) return false;

       return true;
    });
  }, [tournaments, user]);

  React.useEffect(() => {
    if (isModalVisible && !newLinkedTournament && eligibleTournaments.length > 0 && !routeParams?.createPartnerRequest) {
      setNewLinkedTournament(eligibleTournaments[0].id);
    }
  }, [isModalVisible, eligibleTournaments, newLinkedTournament, routeParams]);

  React.useEffect(() => {
    if (isModalVisible && newLinkedTournament) {
      const t = eligibleTournaments.find(x => x.id === newLinkedTournament);
      if (t) {
        if (!newCity || newCity === '') {
          const parts = t.location ? t.location.split(',') : [];
          if (parts.length > 1) setNewCity(parts[1].trim());
          else if (parts.length > 0) setNewCity(parts[0].trim());
        }

        const myTeam = t.doublesTeams?.find(team => String(team.player1Id).toLowerCase() === String(user.id).toLowerCase() || String(team.player2Id).toLowerCase() === String(user.id).toLowerCase());
        const myTeamCode = myTeam ? myTeam.teamCode : null;

        if (!routeParams?.prefilledMessage) {
           const dynamicMessage = myTeamCode 
             ? `I have already registered for the tournament!\nMy Team code is: ${myTeamCode} (Use it directly to join my team)\nIf you register for the tournament using my team code and pay your share of fee, we will be successfully matched.`
             : `Looking for a partner for ${t.name}.`;
           
           // Replace if empty or if it was the old generic one
           if (!newComment || newComment.startsWith('Looking for a partner for') || newComment.startsWith('I have already registered for the tournament!')) {
             setNewComment(dynamicMessage);
           }
        }
      }
    }
  }, [newLinkedTournament, eligibleTournaments, isModalVisible, routeParams]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (req.status !== 'active') return false;
      if (filterSport !== 'All' && req.sport !== filterSport) return false;
      if (filterCity && !req.city.toLowerCase().includes(filterCity.toLowerCase())) return false;
      if (req.targetGender && req.targetGender !== 'All' && user.gender && req.targetGender !== user.gender) return false;
      
      if (req.linkedTournamentId) {
        const linkedT = tournaments?.find(t => t.id === req.linkedTournamentId);
        if (linkedT) {
          const isUserRegistered = linkedT.registeredPlayerIds?.includes(user.id) || linkedT.pendingPaymentPlayerIds?.includes(user.id);
          // Only hide if we are NOT in a mixed doubles or if we already have a full team
          let hasFullTeam = false;
          if (isUserRegistered && linkedT.doublesTeams) {
             const userTeam = linkedT.doublesTeams.find(team => team.player1Id === user.id || team.player2Id === user.id);
             if (userTeam && userTeam.player1Id && userTeam.player2Id) {
               hasFullTeam = true;
             }
          }
          if (hasFullTeam) return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, filterSport, filterCity, user, tournaments]);

  const handleSubmit = () => {
    if (!newCity.trim()) {
      Alert.alert('Error', 'Please enter a city.');
      return;
    }

    let targetGender = 'All';
    if (newLinkedTournament) {
      const selectedT = eligibleTournaments.find(t => t.id === newLinkedTournament);
      if (selectedT) {
        if (selectedT.format === "Men's Doubles") targetGender = 'Male';
        if (selectedT.format === "Women's Doubles") targetGender = 'Female';
      }
    }

    const response = PartnerService.createRequest(user, newSport, newCity, newSkill, newComment, newLinkedTournament, targetGender);
    if (response.success) {
      onAddRequest(response.data.updatedRequest);
      setIsModalVisible(false);
      setNewCity('');
      setNewComment('');
      setNewLinkedTournament(null);
      Alert.alert('Success', 'Partner request posted!');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Remove Request', 'Are you sure you want to remove this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const response = PartnerService.deleteRequest(id);
          if (response.success) {
            onRemoveRequest(id);
          }
        }
      }
    ]);
  };

  const renderItem = ({ item }) => {
    const isMine = item.creatorId === user.id;
    const creatorPlayer = players?.find(p => p.id === item.creatorId);
    const creatorStats = creatorPlayer?.stats || { matchesPlayed: 0, wins: 0, losses: 0 };
    const trueSkillRating = creatorPlayer?.trueSkillRating ? Math.round(creatorPlayer.trueSkillRating) : 1200;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userInfo}>
            <SafeAvatar url={item.creatorImage} name={item.creatorName} size={40} />
            <View style={styles.userNameContainer}>
              <Text style={styles.userName}>{item.creatorName}</Text>
              <Text style={styles.timeAgo}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
          {isMine && (
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.detailsRow}>
          <View style={styles.badge}>
            <Ionicons name="tennisball-outline" size={12} color="#475569" />
            <Text style={styles.badgeText}>{item.sport}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={12} color="#475569" />
            <Text style={styles.badgeText}>{item.city}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
            <Ionicons name="stats-chart" size={12} color="#16A34A" />
            <Text style={[styles.badgeText, { color: '#16A34A' }]}>Rating: {trueSkillRating}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}>
            <Ionicons name="trophy" size={12} color="#3B82F6" />
            <Text style={[styles.badgeText, { color: '#3B82F6' }]}>{creatorStats.wins}W - {creatorStats.losses}L</Text>
          </View>
        </View>
        {item.comment ? (
          <Text style={styles.commentText}>"{item.comment}"</Text>
        ) : null}

        {item.linkedTournamentId && (
          <TouchableOpacity 
            style={styles.tournamentLinkBadge}
            onPress={() => {
              navigation.navigate('ExploreTab', { 
                screen: 'Explore', 
                params: { 
                  openTournamentId: item.linkedTournamentId
                } 
              });
            }}
          >
            <Ionicons name="trophy-outline" size={14} color="#D97706" />
            <Text style={styles.tournamentLinkText} numberOfLines={1}>
              For: {tournaments?.find(t => t.id === item.linkedTournamentId)?.name || 'Tournament'}
            </Text>
            <Ionicons name="chevron-forward" size={12} color="#D97706" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}
        
        {!isMine && (
          <TouchableOpacity 
            style={item.linkedTournamentId ? styles.registerTeamBtn : styles.connectBtn}
            onPress={() => {
              if (item.linkedTournamentId) {
                const t = tournaments?.find(tx => tx.id === item.linkedTournamentId);
                const isUserRegistered = t?.registeredPlayerIds?.includes(user.id) || t?.pendingPaymentPlayerIds?.includes(user.id);
                
                // Get the creator's team from the tournament
                let teamCode = null;
                if (t && t.doublesTeams) {
                  const creatorTeam = t.doublesTeams.find(team => team.player1Id === item.creatorId || team.player2Id === item.creatorId);
                  if (creatorTeam) {
                    teamCode = creatorTeam.teamCode;
                  }
                }
                
                if (isUserRegistered) {
                  Alert.alert(
                    'Join Team', 
                    `Do you want to join this player's team for ${t?.name || 'this tournament'}? (No additional cost since you are already registered)`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Join Team', 
                        onPress: async () => {
                           const res = await onRegister(t, 'credits', 0, false, null, item.creatorId, teamCode, null);
                           if (res?.success) {
                             PartnerService.deleteRequest(item.id);
                             Alert.alert('Success', 'You are now joined as a team!');
                           }
                        }
                      }
                    ]
                  );
                } else {
                  Alert.alert(
                    'Accept & Register', 
                    `Do you want to accept this request and register together as a doubles team for ${t?.name || 'this tournament'}?\n\nYou will be redirected to the tournament page to pay your half of the entry fee (₹${(t?.entryFee || 0) / 2}).`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Proceed to Pay', 
                        onPress: () => {
                           // Navigate to Explore page with prefilled params
                           navigation.navigate('ExploreTab', { 
                             screen: 'Explore', 
                             params: { 
                               openTournamentId: t.id, 
                               teamCode: teamCode,
                               removePartnerRequestId: item.id
                             } 
                           });
                        }
                      }
                    ]
                  );
                }
              } else {
                // Future messaging logic
                Alert.alert('Message', `Starting chat with ${item.creatorName.split(' ')[0]}...`);
              }
            }}
          >
            <Text style={item.linkedTournamentId ? styles.registerTeamBtnText : styles.connectBtnText}>
               {item.linkedTournamentId ? (() => {
                 const t = tournaments?.find(tx => tx.id === item.linkedTournamentId);
                 const isUserRegistered = t?.registeredPlayerIds?.includes(user.id) || t?.pendingPaymentPlayerIds?.includes(user.id);
                 return isUserRegistered ? 'Join Team' : 'Accept & Register';
               })() : `Message ${item.creatorName.split(' ')[0]}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by city or area..."
            placeholderTextColor="#94A3B8"
            value={filterCity}
            onChangeText={setFilterCity}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sportsScroll}>
          {['All', 'Badminton', 'Table Tennis', 'Cricket', 'Football'].map(s => (
            <TouchableOpacity 
              key={s} 
              style={[styles.sportChip, filterSport === s && styles.sportChipActive]}
              onPress={() => setFilterSport(s)}
            >
              <Text style={[styles.sportChipText, filterSport === s && styles.sportChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.addBtn} onPress={() => setIsModalVisible(true)}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>Post a Request</Text>
        </TouchableOpacity>
      </View>

      <FlashList
        data={filteredRequests}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        estimatedItemSize={150}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No partner requests found in this area.</Text>
          </View>
        )}
      />

      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Find a Doubles Partner</Text>
            <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Sport</Text>
              <View style={styles.chipGroup}>
                  {['Badminton', 'Table Tennis', 'Cricket', 'Football'].map(s => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.modalChip, newSport === s && styles.modalChipActive]}
                      onPress={() => setNewSport(s)}
                    >
                      <Text style={[styles.modalChipText, newSport === s && styles.modalChipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Linked Tournament (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipGroup}>
                  <TouchableOpacity 
                    style={[styles.modalChip, newLinkedTournament === null && styles.modalChipActive]}
                    onPress={() => setNewLinkedTournament(null)}
                  >
                    <Text style={[styles.modalChipText, newLinkedTournament === null && styles.modalChipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {eligibleTournaments.map(t => {
                    let hasFullTeam = false;
                    if (t.doublesTeams) {
                      const userTeam = t.doublesTeams.find(team => team.player1Id === user.id || team.player2Id === user.id);
                      if (userTeam && userTeam.player1Id && userTeam.player2Id) {
                        hasFullTeam = true;
                      }
                    }

                    return (
                      <TouchableOpacity 
                        key={t.id} 
                        style={[styles.modalChip, newLinkedTournament === t.id && styles.modalChipActive, hasFullTeam && { opacity: 0.5 }]}
                        onPress={() => {
                          if (!hasFullTeam) setNewLinkedTournament(t.id);
                          else Alert.alert('Team Full', 'You already have a full team for this tournament.');
                        }}
                      >
                        <Text style={[styles.modalChipText, newLinkedTournament === t.id && styles.modalChipTextActive]}>{t.name} ({t.format})</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>City/Area</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Indiranagar, Bangalore"
                placeholderTextColor="#94A3B8"
                value={newCity}
                onChangeText={setNewCity}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Preferred Partner Skill</Text>
              <View style={styles.chipGroup}>
                  {Object.values(SkillLevel).map(s => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.modalChip, newSkill === s && styles.modalChipActive]}
                      onPress={() => setNewSkill(s)}
                    >
                      <Text style={[styles.modalChipText, newSkill === s && styles.modalChipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Additional Comments (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Looking to play on weekend mornings"
                placeholderTextColor="#94A3B8"
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>Post Request</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  sportsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  sportChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sportChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  sportChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  sportChipTextActive: {
    color: '#FFF',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userNameContainer: {
    justifyContent: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  timeAgo: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  commentText: {
    fontSize: 14,
    color: '#334155',
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 20,
  },
  tournamentLinkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tournamentLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  connectBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 14,
  },
  registerTeamBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  registerTeamBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalScroll: {
    paddingHorizontal: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  modalChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalChipTextActive: {
    color: '#6366F1',
  },
  submitBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 16,
  },
});

export default DoublesPartnerBoard;
