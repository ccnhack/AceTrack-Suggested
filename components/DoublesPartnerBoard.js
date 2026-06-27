import { styles } from './doubles/DoublesStyles';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image, ActivityIndicator, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import SafeAvatar from './SafeAvatar';
import PartnerService from '../services/PartnerService';
import { Sport, SkillLevel } from '../types';
import { useTournamentsStore, usePlayersStore } from '../stores';
import logger from '../utils/logger';

const DoublesPartnerBoard = ({ requests, user, onAddRequest, onRemoveRequest, routeParams }) => {
  const { tournaments, onRegister, onJoinTeam } = useTournamentsStore();
  const { players } = usePlayersStore();
  const [filterSport, setFilterSport] = useState('All');
  const [filterCity, setFilterCity] = useState('');
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newSport, setNewSport] = useState(Sport.BADMINTON);
  const [newCity, setNewCity] = useState('');
  const [newSkill, setNewSkill] = useState(SkillLevel.INTERMEDIATE);
  const [newComment, setNewComment] = useState('');
  const [newLinkedTournament, setNewLinkedTournament] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  
  const navigation = useNavigation();

  // ═══════════════════════════════════════════════════════════════
  // 🎫 IN-SCREEN PAYMENT MODAL STATE (v2.6.614)
  // For unregistered users joining a partner's team directly from
  // the Partners tab — no navigation away.
  // ═══════════════════════════════════════════════════════════════
  const [regPaymentTarget, setRegPaymentTarget] = useState(null);
  const [paymentTeamCode, setPaymentTeamCode] = useState('');
  const [paymentPartnerRequestId, setPaymentPartnerRequestId] = useState(null);
  const [paymentPartnerName, setPaymentPartnerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset payment modal state when target clears
  useEffect(() => {
    if (!regPaymentTarget) {
      setPaymentTeamCode('');
      setPaymentPartnerRequestId(null);
      setPaymentPartnerName('');
      setIsProcessing(false);
    }
  }, [regPaymentTarget]);


  React.useEffect(() => {
    if (routeParams?.createPartnerRequest && routeParams?.tournamentId) {
      setNewLinkedTournament(routeParams.tournamentId);
      if (routeParams.prefilledMessage) {
        setNewComment(routeParams.prefilledMessage);
      }
      if (routeParams.sport) {
        setNewSport(routeParams.sport);
      }
      setIsLocked(true);
      setIsModalVisible(true);
      
      // Clear params to prevent modal from re-opening if user switches tabs and returns
      navigation.setParams({ 
        createPartnerRequest: undefined, 
        tournamentId: undefined, 
        prefilledMessage: undefined,
        sport: undefined
      });
    }
  }, [routeParams, navigation]);

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

  // Auto-select tournament ONLY when navigating from route params (handled in the routeParams effect above).
  // When user clicks "Post a Request" manually, tournament defaults to "None" — they can pick one if they want.

  // Premium auto-fill message pools — randomly picked so every post feels unique
  const REGISTERED_MESSAGES = [
    (code) => `Hey! I'm registered and ready to compete 🏆\nMy Team Code: ${code}\n\nUse this code when you register — once your payment goes through, we're officially paired up. Let's make it happen!`,
    (code) => `Already signed up and looking for a strong partner 💪\nTeam Code: ${code}\n\nJust enter this code during registration and complete payment — we'll be matched instantly. Let's dominate the court!`,
    (code) => `Registered and waiting for the right partner 🎯\nUse my Team Code: ${code}\n\nOnce you register with this code and pay your entry, we're locked in as a team. Excited to play together!`,
    (code) => `All set on my end — just need a doubles partner! 🔥\nMy Team Code: ${code}\n\nRegister for the tournament using this code. After payment, we're automatically paired. Let's go for the win!`,
    (code) => `I've secured my spot — looking for someone competitive to team up with 🏸\nTeam Code: ${code}\n\nEnter this code at registration, complete your payment, and we're a team. See you on the court!`,
    (code) => `Spot booked, partner needed! 🚀\nTeam Code: ${code}\n\nUse this code during sign-up and pay your share — we'll be instantly matched. Let's bring our A-game!`,
  ];

  const SEEKING_MESSAGES = [
    `Looking for a competitive doubles partner for this tournament 🎯\n\nIf you're up for it, register and let's team up. Drop me a message if you have any questions!`,
    `Need a reliable partner to compete in this doubles tournament 🏆\n\nLet's register together and aim for the top. Reach out if you're interested!`,
    `Searching for a doubles teammate who's ready to compete 💪\n\nIf you're looking to play, let's pair up and make a strong team. Message me!`,
    `Open to teaming up with a skilled player for this event 🔥\n\nRegister for the tournament and let's partner up — I'm committed and ready to play!`,
    `Looking for someone who takes doubles seriously 🏸\n\nIf you want to compete and have fun, let's team up for this one. Looking forward to connecting!`,
    `Doubles partner wanted — let's make this tournament count! 🚀\n\nI'm registered and ready. If you're keen, sign up and we'll pair up. Let's do this!`,
  ];

  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
           const message = myTeamCode 
             ? pickRandom(REGISTERED_MESSAGES)(myTeamCode)
             : pickRandom(SEEKING_MESSAGES);
           
           // Only auto-fill if empty or if it was a previous auto-filled message
           if (!newComment || !newComment.trim()) {
             setNewComment(message);
           }
        }
      }
    }
  }, [newLinkedTournament, eligibleTournaments, isModalVisible, routeParams]);

  const filteredRequests = useMemo(() => {
    console.log("[DEBUG] Raw partner requests in DoublesPartnerBoard:", JSON.stringify(requests));
    return requests.filter(req => {
      if (req.status !== 'active') return false;
      if (filterSport !== 'All' && req.sport !== filterSport) return false;
      if (filterCity && !req.city.toLowerCase().includes(filterCity.toLowerCase())) return false;
      if (req.targetGender && req.targetGender !== 'All') {
        if (!user.gender || req.targetGender.toLowerCase() !== user.gender.toLowerCase()) {
          return false;
        }
      }
      
      if (req.linkedTournamentId) {
        const linkedT = tournaments?.find(t => t.id === req.linkedTournamentId);
        if (linkedT) {
          const isUserRegistered = linkedT.registeredPlayerIds?.includes(user.id) || linkedT.pendingPaymentPlayerIds?.includes(user.id);
          
          // 1. Hide if the CURRENT USER viewing the board already has a full team
          let hasFullTeam = false;
          if (isUserRegistered && linkedT.doublesTeams) {
             const userTeam = linkedT.doublesTeams.find(team => String(team.player1Id) === String(user.id) || String(team.player2Id) === String(user.id));
             if (userTeam && userTeam.player1Id && userTeam.player2Id) {
               hasFullTeam = true;
             }
          }
          if (hasFullTeam) return false;

          // 2. Hide if the CREATOR of the request already has a full team
          let creatorHasFullTeam = false;
          if (linkedT.doublesTeams) {
             const creatorTeam = linkedT.doublesTeams.find(team => String(team.player1Id) === String(req.creatorId) || String(team.player2Id) === String(req.creatorId));
             if (creatorTeam && creatorTeam.player1Id && creatorTeam.player2Id) {
               creatorHasFullTeam = true;
             }
          }
          if (creatorHasFullTeam) return false;
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
    
    if (newLinkedTournament) {
      const existingRequest = requests.find(r => r.creatorId === user.id && r.linkedTournamentId === newLinkedTournament && r.status === 'active');
      if (existingRequest) {
        Alert.alert('Duplicate Request', 'You have already posted a request for a partner for this tournament.');
        return;
      }
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
      setIsLocked(false);
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
    const isAcademyUser = item.creatorRole === 'academy';
    const trueSkillRating = item.creatorRating || 1200;
    const creatorStats = item.creatorStats || { wins: 0, losses: 0 };

    // Look up creator's avatar from players store as fallback for old requests
    const creatorPlayer = (players || []).find(p => p.id === item.creatorId);
    const avatarUri = item.creatorImage || creatorPlayer?.avatar || creatorPlayer?.image || null;

    // Format date as dd/mm/yyyy hh:mm AM/PM
    const createdDate = new Date(item.createdAt);
    const dd = String(createdDate.getDate()).padStart(2, '0');
    const mm = String(createdDate.getMonth() + 1).padStart(2, '0');
    const yyyy = createdDate.getFullYear();
    let hours = createdDate.getHours();
    const minutes = String(createdDate.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const formattedDate = `${dd}/${mm}/${yyyy} at ${hours}:${minutes} ${ampm}`;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userInfo}>
            <SafeAvatar uri={avatarUri} name={item.creatorName} size={44} />
            <View style={styles.userNameContainer}>
              <Text style={styles.creatorName}>
                {item.creatorName} {isAcademyUser && <Ionicons name="school" size={14} color="#3B82F6" />}
              </Text>
              <Text style={styles.timeAgo}>{formattedDate}</Text>
            </View>
          </View>
          {isMine && (
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
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
            <Ionicons name="star" size={12} color="#16A34A" />
            <Text style={[styles.badgeText, { color: '#16A34A' }]}>Rating: {trueSkillRating}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}>
            <Ionicons name="trophy" size={12} color="#3B82F6" />
            <Text style={[styles.badgeText, { color: '#3B82F6' }]}>{creatorStats.wins}W - {creatorStats.losses}L</Text>
          </View>
        </View>
        {item.comment ? <Text style={styles.commentText}>"{item.comment}"</Text> : null}

        {item.linkedTournamentId && (
          <TouchableOpacity 
            style={styles.tournamentLinkBadge}
            onPress={() => navigation.navigate('Explore', { openTournamentId: item.linkedTournamentId })}
          >
            <Ionicons name="trophy-outline" size={14} color="#D97706" />
            <Text style={styles.tournamentLinkText} numberOfLines={1}>For: {tournaments?.find(t => t.id === item.linkedTournamentId)?.title || tournaments?.find(t => t.id === item.linkedTournamentId)?.name || 'Tournament'}</Text>
          </TouchableOpacity>
        )}
        
        {!isMine && (
          <TouchableOpacity 
            style={item.linkedTournamentId ? styles.registerTeamBtn : styles.connectBtn}
            onPress={async () => {
              if (item.linkedTournamentId) {
                const t = tournaments?.find(tx => tx.id === item.linkedTournamentId);
                const isUserRegistered = t?.registeredPlayerIds?.some(id => String(id).toLowerCase() === String(user.id).toLowerCase()) 
                  || t?.pendingPaymentPlayerIds?.some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
                
                let targetTeamCode = null;
                if (t?.doublesTeams) {
                  const creatorTeam = t.doublesTeams.find(team => String(team.player1Id) === String(item.creatorId) || String(team.player2Id) === String(item.creatorId));
                  if (creatorTeam) {
                    targetTeamCode = creatorTeam.teamCode;
                  }
                }
                
                if (isUserRegistered && targetTeamCode) {
                  // 🤝 [DIRECT_JOIN] (v2.6.613): Both players already paid — join team directly, no payment needed.
                  Alert.alert(
                    'Join Team', 
                    `You're already registered. Join this team directly — no extra payment needed!`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Join Team Now', 
                        onPress: async () => {
                          const result = await onJoinTeam(item.linkedTournamentId, targetTeamCode);
                          if (result && result.success) {
                            Alert.alert('Team Matched! 🎉', result.message || 'You have been paired with your partner!');
                          }
                        }
                      }
                    ]
                  );
                } else if (isUserRegistered) {
                  // Registered but no team code available — fall back to tournament page
                  Alert.alert(
                    'Join Team', 
                    `You are already registered. Go to the tournament details to join this team using their code.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Go to Tournament', 
                        onPress: () => {
                          navigation.navigate('Explore', { openTournamentId: item.linkedTournamentId, teamCode: targetTeamCode });
                        }
                      }
                    ]
                  );
                } else {
                  // 🎫 [IN_SCREEN_PAY] (v2.6.614): Open premium center-screen modal
                  // instead of navigating away to Explore.
                  setPaymentTeamCode(targetTeamCode || '');
                  setPaymentPartnerRequestId(item.id);
                  setPaymentPartnerName(item.creatorName || 'Partner');
                  setRegPaymentTarget(t);
                }
              } else {
                onConnect(item);
              }
            }}
          >
            <Ionicons name={item.linkedTournamentId ? "link" : "chatbubble-outline"} size={16} color="#FFF" />
            <Text style={styles.connectBtnText}>
               {item.linkedTournamentId ? (() => {
                 const t = tournaments?.find(tx => tx.id === item.linkedTournamentId);
                 const isReg = t?.registeredPlayerIds?.some(id => String(id).toLowerCase() === String(user.id).toLowerCase()) 
                   || t?.pendingPaymentPlayerIds?.some(id => String(id).toLowerCase() === String(user.id).toLowerCase());
                 return isReg ? 'Join Team' : 'Register to Join Team';
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
          <TextInput style={styles.searchInput} placeholder="Search by city or area..." placeholderTextColor="#94A3B8" value={filterCity} onChangeText={setFilterCity} />
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

        <TouchableOpacity style={styles.addBtn} onPress={() => { 
          setNewSport(Sport.BADMINTON);
          setNewCity('');
          setNewSkill(SkillLevel.INTERMEDIATE);
          setNewComment('');
          setNewLinkedTournament(null);
          setIsLocked(false); 
          setIsModalVisible(true); 
        }}>
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
            <TouchableOpacity onPress={() => { setIsModalVisible(false); setIsLocked(false); }} style={styles.closeBtn}>
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
                      style={[styles.modalChip, newSport === s && styles.modalChipActive, isLocked && { opacity: 0.5 }]}
                      onPress={() => { if (!isLocked) setNewSport(s); }}
                      disabled={isLocked}
                    >
                      <Text style={[styles.modalChipText, newSport === s && styles.modalChipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Linked Tournament (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tournamentScroll}>
                  <TouchableOpacity 
                    style={[styles.modalChip, !newLinkedTournament && styles.modalChipActive, isLocked && { opacity: 0.5 }]}
                    onPress={() => { if (!isLocked) setNewLinkedTournament(null); }}
                    disabled={isLocked}
                  >
                    <Text style={[styles.modalChipText, !newLinkedTournament && styles.modalChipTextActive]}>None</Text>
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
                        style={[styles.modalChip, newLinkedTournament === t.id && styles.modalChipActive, (hasFullTeam || isLocked) && { opacity: 0.5 }]}
                        onPress={() => {
                          if (isLocked) return;
                          if (!hasFullTeam) setNewLinkedTournament(t.id);
                          else Alert.alert('Team Full', 'You already have a full team for this tournament.');
                        }}
                        disabled={isLocked}
                      >
                        <Text style={[styles.modalChipText, newLinkedTournament === t.id && styles.modalChipTextActive]}>{t.title || t.name} ({t.format})</Text>
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

      {/* ═══════════════════════════════════════════════════════════════
          🎫 PREMIUM IN-SCREEN PAYMENT MODAL (v2.6.614)
          Opens center-screen with team code pre-filled for unregistered
          users joining a partner's team directly from Partners tab.
         ═══════════════════════════════════════════════════════════════ */}
      <Modal transparent animationType="fade" visible={!!regPaymentTarget}>
        <View style={pmStyles.overlay}>
          <View style={pmStyles.container}>
            {/* Header Gradient */}
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              style={pmStyles.header}
            >
              <View style={pmStyles.headerTop}>
                <View style={pmStyles.headerBadge}>
                  <Ionicons name="people" size={14} color="#F59E0B" />
                  <Text style={pmStyles.headerBadgeText}>TEAM REGISTRATION</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRegPaymentTarget(null)}
                  style={pmStyles.closeBtn}
                >
                  <Ionicons name="close" size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <Text style={pmStyles.tournamentTitle} numberOfLines={2}>
                {regPaymentTarget?.title || regPaymentTarget?.name || 'Tournament'}
              </Text>
              <View style={pmStyles.headerMeta}>
                <View style={pmStyles.metaChip}>
                  <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                  <Text style={pmStyles.metaText}>{regPaymentTarget?.date || '—'}</Text>
                </View>
                <View style={pmStyles.metaChip}>
                  <Ionicons name="trophy-outline" size={12} color="#94A3B8" />
                  <Text style={pmStyles.metaText}>{regPaymentTarget?.format || 'Doubles'}</Text>
                </View>
              </View>
              {/* Partner Info Row */}
              <View style={pmStyles.partnerRow}>
                <Ionicons name="link" size={14} color="#22D3EE" />
                <Text style={pmStyles.partnerText}>
                  Joining <Text style={pmStyles.partnerName}>{paymentPartnerName}</Text>'s team
                </Text>
              </View>
            </LinearGradient>

            <ScrollView style={pmStyles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {/* Team Code (Pre-filled & Locked) */}
              {paymentTeamCode ? (
                <View style={pmStyles.teamCodeSection}>
                  <Text style={pmStyles.sectionLabel}>TEAM CODE</Text>
                  <View style={pmStyles.teamCodeDisplay}>
                    <Ionicons name="key" size={16} color="#6366F1" />
                    <Text style={pmStyles.teamCodeValue}>{paymentTeamCode}</Text>
                    <View style={pmStyles.autoFilledBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                      <Text style={pmStyles.autoFilledText}>Auto-filled</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Payment Summary */}
              <View style={pmStyles.summaryCard}>
                <View style={pmStyles.summaryRow}>
                  <View style={pmStyles.summaryCol}>
                    <Text style={pmStyles.sectionLabel}>YOUR SHARE</Text>
                    <Text style={pmStyles.priceValue}>
                      ₹{regPaymentTarget ? Math.round(regPaymentTarget.entryFee / 2) : 0}
                    </Text>
                    <Text style={pmStyles.priceSubtext}>Half of ₹{regPaymentTarget?.entryFee || 0} entry</Text>
                  </View>
                  <View style={pmStyles.summaryDivider} />
                  <View style={[pmStyles.summaryCol, { alignItems: 'flex-end' }]}>
                    <Text style={pmStyles.sectionLabel}>WALLET BALANCE</Text>
                    <Text style={[
                      pmStyles.priceValue,
                      { color: (user?.credits || 0) >= Math.round((regPaymentTarget?.entryFee || 0) / 2) ? '#16A34A' : '#EF4444' }
                    ]}>
                      ₹{user?.credits || 0}
                    </Text>
                    {(user?.credits || 0) < Math.round((regPaymentTarget?.entryFee || 0) / 2) && (
                      <Text style={pmStyles.insufficientText}>Insufficient</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* NOTE: No "Register partner too" option here — this modal is specifically
                 for joining an EXISTING team (filling the player2 slot). The team already
                 has player1 (the request creator). */}
            </ScrollView>

            {/* Payment Actions */}
            <View style={pmStyles.actions}>
              <TouchableOpacity
                disabled={(user?.credits || 0) < Math.round((regPaymentTarget?.entryFee || 0) / 2) || isProcessing}
                onPress={async () => {
                  setIsProcessing(true);
                  try {
                    const cost = Math.round(regPaymentTarget.entryFee / 2);
                    const result = await onRegister(
                      regPaymentTarget,
                      'credits',
                      cost,
                      false,
                      null,
                      null,
                      paymentTeamCode.trim() || null,
                      null
                    );
                    if (result && result.success) {
                      setRegPaymentTarget(null);
                      setTimeout(() => {
                        Alert.alert(
                          'Team Matched! 🎉',
                          `You've joined ${paymentPartnerName}'s team! You're now paired up and ready to compete.`
                        );
                      }, 300);
                    }
                  } catch (e) {
                    console.error('[DoublesPartnerBoard] Payment Error:', e);
                    Alert.alert('Error', `Could not complete registration: ${e.message || 'Please try again.'}`);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                style={[
                  pmStyles.payBtn,
                  ((user?.credits || 0) < Math.round((regPaymentTarget?.entryFee || 0) / 2) || isProcessing) && pmStyles.payBtnDisabled
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="wallet" size={18} color="#FFF" />
                    <Text style={pmStyles.payBtnText}>
                      Pay ₹{Math.round((regPaymentTarget?.entryFee || 0) / 2)} with Wallet
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                disabled={isProcessing}
                onPress={async () => {
                  setIsProcessing(true);
                  try {
                    const cost = Math.round(regPaymentTarget.entryFee / 2);
                    const result = await onRegister(
                      regPaymentTarget,
                      'upi',
                      cost,
                      false,
                      null,
                      null,
                      paymentTeamCode.trim() || null,
                      null
                    );
                    if (result && result.success) {
                      setRegPaymentTarget(null);
                      setTimeout(() => {
                        Alert.alert(
                          'Registration Initiated! 🎉',
                          `Your UPI payment is pending verification. Once confirmed, you'll be paired with ${paymentPartnerName}.`
                        );
                      }, 300);
                    }
                  } catch (e) {
                    console.error('[DoublesPartnerBoard] UPI Payment Error:', e);
                    Alert.alert('Error', `Could not complete registration: ${e.message || 'Please try again.'}`);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                style={[pmStyles.upiBtn, isProcessing && pmStyles.payBtnDisabled]}
              >
                <Ionicons name="card" size={18} color="#FFF" />
                <Text style={pmStyles.payBtnText}>Pay with UPI</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRegPaymentTarget(null)}
                style={pmStyles.cancelLink}
              >
                <Text style={pmStyles.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};


export default DoublesPartnerBoard;
