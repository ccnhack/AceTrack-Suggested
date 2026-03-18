import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Modal, TextInput, Alert, Dimensions,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoManagement } from '../components/VideoManagement';
import PlayerDashboardView from '../components/PlayerDashboardView';
import ParticipantsModal from '../components/ParticipantsModal';
import PureJSDateTimePicker from '../components/PureJSDateTimePicker';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';

const { width, height } = Dimensions.get('window');

export const AcademyScreen = ({ 
  academyId, user, tournaments, players, matchVideos, matches, evaluations,
  onSaveTournament, onUpdateTournament, onSaveVideo, onCancelVideo, onRequestDeletion,
  onUpdateUser, onReplyTicket, onUpdateTicketStatus, onTopUp, onRegister, onReschedule, onLogTrace,
  setPlayers, isSyncing, onBatchUpdate
}) => {
  const [subTab, setSubTab] = useState('tournaments');
  const [tFilter, setTFilter] = useState('upcoming');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingT, setEditingT] = useState(null);
  const [viewingPlayersFor, setViewingPlayersFor] = useState(null);

  // Coach Assignment State
  const [coachAssignmentType, setCoachAssignmentType] = useState(null);
  const [selectedAcademyCoachId, setSelectedAcademyCoachId] = useState(null);
  const [otherCoachName, setOtherCoachName] = useState('');
  const [otherCoachEmail, setOtherCoachEmail] = useState('');
  const [otherCoachPhone, setOtherCoachPhone] = useState('');
  const [visibleOtps, setVisibleOtps] = useState(new Set());
  const [selectedDate, setSelectedDate] = useState('');

  // Diagnostic Logs for Actions
  useEffect(() => {
    logger.logAction('Academy Tab Changed', { tab: subTab });
  }, [subTab]);

  useEffect(() => {
    logger.logAction('Tournament Filter Changed', { filter: tFilter });
  }, [tFilter]);

  useEffect(() => {
    onLogTrace('Dashboard Access', 'academy', academyId, {
      academyName: user?.name,
      totalTournamentsAvailable: tournaments?.length,
      myTournamentsCount: tournaments.filter(t => t.creatorId === academyId).length,
    });
  }, [academyId, user]);

  // Form Fields State
  const [formTitle, setFormTitle] = useState('');
  const [formSport, setFormSport] = useState(Sport.Tennis);
  const [formSkill, setFormSkill] = useState(SkillLevel.Beginner);
  const [formVenue, setFormVenue] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formRegDeadline, setFormRegDeadline] = useState('');
  const [formTime, setFormTime] = useState('09:00 AM');
  const [formFee, setFormFee] = useState('');
  const [formMaxPlayers, setFormMaxPlayers] = useState('');
  const [formStructure, setFormStructure] = useState(TournamentStructure.SingleElimination);
  const [formFormat, setFormFormat] = useState(TournamentFormat.Singles);
  const [formPrize, setFormPrize] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Picker States
  const [activePicker, setActivePicker] = useState(null); // 'sport', 'skill', 'structure', 'format', 'coach', 'date', 'deadline', 'time'

  useEffect(() => {
    if (editingT) {
      setFormTitle(editingT.title || '');
      setFormSport(editingT.sport || Sport.Tennis);
      setFormSkill(editingT.skillLevel || SkillLevel.Beginner);
      setFormVenue(editingT.location || '');
      setFormDate(editingT.date || '');
      setFormRegDeadline(editingT.registrationDeadline || '');
      setFormTime(editingT.time || '09:00 AM');
      setFormFee(editingT.entryFee?.toString() || '');
      setFormMaxPlayers(editingT.maxPlayers?.toString() || '');
      setFormStructure(editingT.structure || TournamentStructure.SingleElimination);
      setFormFormat(editingT.format || TournamentFormat.Singles);
      setFormPrize(editingT.prizePool || '');
      setFormDescription(editingT.description || '');
      setSelectedDate(editingT.date || '');
      setCoachAssignmentType(editingT.coachAssignmentType || null);
      
      if (editingT.coachAssignmentType === 'academy') {
        if (editingT.invitedCoachDetails) {
            setSelectedAcademyCoachId('other');
            setOtherCoachName(editingT.invitedCoachDetails.name);
            setOtherCoachEmail(editingT.invitedCoachDetails.email);
            setOtherCoachPhone(editingT.invitedCoachDetails.phone || '');
        } else {
            setSelectedAcademyCoachId(editingT.assignedCoachId || null);
        }
      }
    } else {
      resetForm();
    }
  }, [editingT, isFormOpen]);

  const resetForm = () => {
    setFormTitle('');
    setFormSport(Sport.Tennis);
    setFormSkill(SkillLevel.Beginner);
    setFormVenue('');
    setFormDate('');
    setFormRegDeadline('');
    setFormTime('09:00 AM');
    setFormFee('');
    setFormMaxPlayers('');
    setFormStructure(TournamentStructure.SingleElimination);
    setFormFormat(TournamentFormat.Singles);
    setFormPrize('');
    setFormDescription('');
    setSelectedDate('');
    setCoachAssignmentType(null);
    setSelectedAcademyCoachId(null);
    setOtherCoachName('');
    setOtherCoachEmail('');
    setOtherCoachPhone('');
  };

  const autofillTestData = () => {
    const testId = Math.floor(Math.random() * 9000) + 1000;
    setFormTitle(`Test Tournament ${testId}`);
    setFormSport(Sport.Tennis);
    setFormSkill(SkillLevel.Intermediate);
    setFormVenue("Olympic Sports Complex");
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const dateStr = tomorrow.toISOString().split('T')[0];
    setFormDate(dateStr);
    setSelectedDate(dateStr);
    
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);
    setFormRegDeadline(deadline.toISOString().split('T')[0]);
    
    setFormTime("09:00 AM");
    setFormFee("500");
    setFormMaxPlayers("16");
    setFormStructure(TournamentStructure.SingleElimination);
    setFormFormat(TournamentFormat.Singles);
    setFormPrize("₹5000 + Trophy");
    setFormDescription("Verification tournament for sync testing.");
    setCoachAssignmentType('platform');
  };

  const myTournaments = tournaments.filter(t => 
    t && String(t.creatorId).replace(/_/g, '').toLowerCase() === String(academyId).replace(/_/g, '').toLowerCase()
  );
  const participantIds = new Set(myTournaments.flatMap(t => [
    ...(t.registeredPlayerIds || []), 
    ...(t.pendingPaymentPlayerIds || []),
    ...Object.keys(t.playerStatuses || {})
  ].filter(pid => pid && String(pid).toLowerCase() !== 'test')));
  const myParticipants = players.filter(p => participantIds.has(p.id));

  const filteredTournaments = myTournaments.filter(t => {
      const tDate = new Date(t.date);
      const today = new Date();
      today.setHours(0,0,0,0);
      if (tFilter === 'upcoming') {
        return t.status !== 'completed' && !t.tournamentConcluded && (tDate >= today || t.tournamentStarted);
      } else {
        return t.status === 'completed' || t.tournamentConcluded || (tDate < today && !t.tournamentStarted);
      }
  });

  const isReadOnly = (editingT?.date ? new Date(editingT.date).getTime() < new Date().setHours(0,0,0,0) : false) || editingT?.status === 'completed' || editingT?.tournamentConcluded;

  const handleFormSubmit = () => {
    if (isReadOnly) return;
    
    if (!coachAssignmentType) {
      Alert.alert("Error", "Please select a coach assignment option.");
      return;
    }

    if (coachAssignmentType === 'academy' && !selectedAcademyCoachId) {
      Alert.alert("Error", "Please select an academy coach.");
      return;
    }

    if (coachAssignmentType === 'academy' && selectedAcademyCoachId === 'other' && (!otherCoachName || !otherCoachEmail)) {
      Alert.alert("Error", "Please provide the name and email for the other coach.");
      return;
    }

    if (formRegDeadline > formDate) {
        Alert.alert("Error", "Registration deadline cannot be after the tournament date.");
        return;
    }

    let coachStatus = undefined;
    let assignedCoachId = undefined;
    let invitedCoachDetails = undefined;
    let startOtp = editingT?.startOtp;
    let endOtp = editingT?.endOtp;

    if (coachAssignmentType === 'platform') {
      coachStatus = 'Awaiting Coach Confirmation';
    } else if (coachAssignmentType === 'academy') {
      if (selectedAcademyCoachId === 'other') {
        coachStatus = 'Pending Coach Registration';
        invitedCoachDetails = { name: otherCoachName, email: otherCoachEmail, phone: otherCoachPhone };
        Alert.alert("Success", `Invitation email sent to ${otherCoachEmail}`);
      } else {
        coachStatus = 'Coach Assigned - Academy';
        assignedCoachId = selectedAcademyCoachId;
        if (!startOtp) startOtp = Math.floor(100000 + Math.random() * 900000).toString();
        if (!endOtp) endOtp = Math.floor(100000 + Math.random() * 900000).toString();
      }
    }

    const newT = {
      id: editingT?.id || `t_${Date.now()}`,
      title: formTitle,
      sport: formSport,
      location: formVenue,
      date: formDate,
      time: formTime,
      registrationDeadline: formRegDeadline,
      skillLevel: formSkill,
      structure: formStructure,
      format: formFormat,
      entryFee: Number(formFee),
      prizePool: formPrize,
      minMatches: Number(editingT?.minMatches || 1),
      maxPlayers: Number(formMaxPlayers),
      registeredPlayerIds: editingT?.registeredPlayerIds || [],
      pendingPaymentPlayerIds: editingT?.pendingPaymentPlayerIds || [],
      status: editingT?.status || 'upcoming',
      description: formDescription,
      creatorId: academyId,
      coachAssignmentType,
      coachStatus,
      assignedCoachId,
      invitedCoachDetails,
      startOtp,
      endOtp,
      tournamentStarted: editingT?.tournamentStarted || false,
      ratingsModified: editingT?.ratingsModified || false
    };

    if (editingT) {
        onUpdateTournament(newT);
    } else {
        onSaveTournament(newT);
    }
    setIsFormOpen(false);
    setEditingT(null);
    resetForm();
  };

  const renderPickerModal = () => {
    if (!activePicker) return null;

    let options = [];
    let currentVal = '';
    let setter = null;

    switch (activePicker) {
        case 'sport':
            options = Object.values(Sport);
            currentVal = formSport;
            setter = setFormSport;
            break;
        case 'skill':
            options = Object.values(SkillLevel);
            currentVal = formSkill;
            setter = setFormSkill;
            break;
        case 'structure':
            options = Object.values(TournamentStructure);
            currentVal = formStructure;
            setter = setFormStructure;
            break;
        case 'format':
            options = Object.values(TournamentFormat);
            currentVal = formFormat;
            setter = setFormFormat;
            break;
        case 'coach':
            options = players.filter(p => p.role === 'coach' && p.academyId === academyId && p.isApprovedCoach).map(c => ({ id: c.id, name: c.name }));
            options.push({ id: 'other', name: '+ Other Coach (Invite)' });
            currentVal = selectedAcademyCoachId;
            setter = setSelectedAcademyCoachId;
            break;
        case 'date':
            return (
                <Modal transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.pickerSheet}>
                            <View style={[styles.pickerHeader, { marginBottom: 12 }]}>
                                <Text style={styles.pickerTitle}>Select Date</Text>
                                <TouchableOpacity onPress={() => setActivePicker(null)}>
                                    <Ionicons name="close" size={24} color="#0F172A" />
                                </TouchableOpacity>
                            </View>
                            <PureJSDateTimePicker 
                                mode="date"
                                value={formDate}
                                minDate={(() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 4);
                                    const year = d.getFullYear();
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const day = String(d.getDate()).padStart(2, '0');
                                    return `${year}-${month}-${day}`;
                                })()}
                                onChange={(val) => { setFormDate(val); setActivePicker(null); }}
                            />
                        </View>
                    </View>
                </Modal>
            );
        case 'deadline':
            return (
                <Modal transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.pickerSheet}>
                            <View style={[styles.pickerHeader, { marginBottom: 12 }]}>
                                <Text style={styles.pickerTitle}>Select Deadline</Text>
                                <TouchableOpacity onPress={() => setActivePicker(null)}>
                                    <Ionicons name="close" size={24} color="#0F172A" />
                                </TouchableOpacity>
                            </View>
                            <PureJSDateTimePicker 
                                mode="date"
                                value={formRegDeadline}
                                minDate={(() => {
                                    const d = new Date();
                                    const year = d.getFullYear();
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const day = String(d.getDate()).padStart(2, '0');
                                    return `${year}-${month}-${day}`;
                                })()}
                                maxDate={formDate || undefined}
                                onChange={(val) => { setFormRegDeadline(val); setActivePicker(null); }}
                            />
                        </View>
                    </View>
                </Modal>
            );
        case 'time':
            return (
                <Modal transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.pickerSheet}>
                            <View style={[styles.pickerHeader, { marginBottom: 12 }]}>
                                <Text style={styles.pickerTitle}>Select Time</Text>
                                <TouchableOpacity onPress={() => setActivePicker(null)}>
                                    <Ionicons name="close" size={24} color="#0F172A" />
                                </TouchableOpacity>
                            </View>
                            <PureJSDateTimePicker 
                                mode="time"
                                value={formTime}
                                onChange={(val) => { setFormTime(val); }}
                            />
                            <TouchableOpacity 
                                onPress={() => setActivePicker(null)} 
                                style={[styles.saveBtn, { marginTop: 20, width: '100%' }]}
                            >
                                <Text style={styles.saveBtnText}>Confirm Time</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            );
    }

    return (
        <Modal transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Select {activePicker}</Text>
                        <TouchableOpacity onPress={() => setActivePicker(null)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        {options.map((opt) => {
                            const val = typeof opt === 'string' ? opt : opt.id;
                            const label = typeof opt === 'string' ? opt : opt.name;
                            return (
                                <TouchableOpacity 
                                    key={val} 
                                    onPress={() => { setter(val); setActivePicker(null); }}
                                    style={styles.pickerItem}
                                >
                                    <Text style={[styles.pickerItemText, currentVal === val && styles.pickerItemTextActive]}>{label}</Text>
                                    {currentVal === val && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Academy Hub</Text>
          <Text style={styles.subtitle}>Manage your events & scouts</Text>
        </View>
        {subTab === 'tournaments' && (
          <TouchableOpacity 
            onPress={() => { setEditingT(null); setIsFormOpen(true); }}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setSubTab('tournaments')} style={[styles.tab, subTab === 'tournaments' && styles.tabActive]}>
          <Text style={[styles.tabText, subTab === 'tournaments' && styles.tabTextActive]}>Tournaments</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSubTab('videos')} style={[styles.tab, subTab === 'videos' && styles.tabActive]}>
          <Text style={[styles.tabText, subTab === 'videos' && styles.tabTextActive]}>Videos</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSubTab('insights')} style={[styles.tab, subTab === 'insights' && styles.tabActive]}>
          <Text style={[styles.tabText, subTab === 'insights' && styles.tabTextActive]}>Scout Feed</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        {subTab === 'tournaments' && (
          <View>
            <View style={styles.filterRow}>
              <TouchableOpacity onPress={() => setTFilter('upcoming')} style={[styles.filterBtn, tFilter === 'upcoming' && styles.filterBtnActive]}>
                <Text style={[styles.filterBtnText, tFilter === 'upcoming' && styles.filterBtnTextActive]}>Upcoming</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTFilter('past')} style={[styles.filterBtn, tFilter === 'past' && styles.filterBtnActive]}>
                <Text style={[styles.filterBtnText, tFilter === 'past' && styles.filterBtnTextActive]}>Past</Text>
              </TouchableOpacity>
            </View>

            {filteredTournaments.map(t => (
              <View key={t.id} style={[styles.tCard, tFilter === 'past' && styles.tCardPast]}>
                <View style={styles.tCardHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.tTitle}>{t.title}</Text>
                    <Text style={styles.tMeta}>{t.date} • {t.location}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => { setEditingT(t); setIsFormOpen(true); }}
                    style={styles.editBtn}
                  >
                    <Ionicons name={tFilter === 'past' ? "eye" : "create"} size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {(t.coachStatus === 'Coach Assigned' || t.coachStatus === 'Coach Assigned - Academy') && t.assignedCoachId && (
                    <View style={styles.coachBanner}>
                        <View style={styles.coachInfo}>
                            <Text style={styles.coachLabel}>Coach Assigned</Text>
                            <Text style={styles.coachName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                        </View>
                        {tFilter === 'upcoming' && t.status !== 'completed' && !t.tournamentConcluded && (
                            <View style={styles.otpSection}>
                                {visibleOtps.has(t.id) ? (
                                    <View style={styles.otpRow}>
                                        <View style={styles.otpBox}>
                                            <Text style={styles.otpLabel}>Start</Text>
                                            <Text style={styles.otpValue}>{t.startOtp || 'N/A'}</Text>
                                        </View>
                                        <View style={styles.otpBox}>
                                            <Text style={styles.otpLabel}>End</Text>
                                            <Text style={styles.otpValue}>{t.endOtp || 'N/A'}</Text>
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity 
                                        onPress={() => setVisibleOtps(prev => new Set(prev).add(t.id))}
                                        style={styles.viewOtpBtn}
                                    >
                                        <Text style={styles.viewOtpBtnText}>VIEW OTP</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                )}

                <View style={styles.tCardFooter}>
                  <View style={styles.statsRow}>
                    <TouchableOpacity onPress={() => setViewingPlayersFor(t)} style={styles.statItem}>
                        <Text style={styles.statLabel}>Players</Text>
                        <Text style={styles.statValue}>{(t.registeredPlayerIds || []).filter(Boolean).length}/{t.maxPlayers}</Text>
                    </TouchableOpacity>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Entry</Text>
                        <Text style={styles.statValue}>₹{t.entryFee}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, tFilter === 'past' ? styles.statusBadgePast : styles.statusBadgeActive]}>
                    <Text style={[styles.statusBadgeText, tFilter === 'past' ? styles.statusBadgeTextPast : styles.statusBadgeTextActive]}>
                        {tFilter === 'past' ? 'Completed' : t.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            {filteredTournaments.length === 0 && (
                <View style={styles.emptyView}>
                    {isSyncing ? (
                        <ActivityIndicator size="large" color="#6366F1" />
                    ) : (
                        <Text style={styles.emptyText}>No {tFilter} tournaments found</Text>
                    )}
                </View>
            )}
          </View>
        )}

        {subTab === 'videos' && (
          <VideoManagement 
            academyId={academyId} 
            tournaments={tournaments} 
            players={players} 
            matchVideos={matchVideos} 
            matches={matches}
            onSaveVideo={onSaveVideo}
            onCancelVideo={onCancelVideo}
            onRequestDeletion={onRequestDeletion}
            onLogTrace={onLogTrace}
          />
        )}

        {subTab === 'insights' && (
          <PlayerDashboardView players={myParticipants} tournaments={myTournaments} title="Scout Feed" />
        )}
      </ScrollView>

      {/* Forms & Modals */}
      <ParticipantsModal 
        tournament={viewingPlayersFor} 
        players={players} 
        evaluations={evaluations}
        onClose={() => setViewingPlayersFor(null)} 
        onAddPlayer={(name, phone) => {
          if (!viewingPlayersFor) return;
          const player = players.find(p => p.name.toLowerCase() === name.toLowerCase() && p.phone === phone);
          if (!player) {
            Alert.alert("Error", 'Player not found in the app.');
            return;
          }
          if (viewingPlayersFor.registeredPlayerIds.includes(player.id) || viewingPlayersFor.pendingPaymentPlayerIds?.includes(player.id)) {
            Alert.alert("Info", 'Player is already registered.');
            return;
          }
          const currentCount = (viewingPlayersFor.registeredPlayerIds || []).filter(Boolean).length;
          if (currentCount >= viewingPlayersFor.maxPlayers) {
            Alert.alert("Error", 'Tournament is full.');
            return;
          }
          const updatedTournament = {
            ...viewingPlayersFor,
            pendingPaymentPlayerIds: [...(viewingPlayersFor.pendingPaymentPlayerIds || []), player.id]
          };
          
          // Notification logic
          const notification = {
            id: `notif_${Date.now()}`,
            title: 'Tournament Invitation',
            message: `${user?.name || 'Academy'} has successfully added you to ${viewingPlayersFor.title}. Please Complete the payment to join.`,
            date: new Date().toISOString(),
            read: false,
            type: 'tournament_invite',
            tournamentId: viewingPlayersFor.id
          };
          const updatedPlayer = { 
            ...player, 
            notifications: [notification, ...(player.notifications || [])] 
          };

          // Use BATCH UPDATE to send both changes in one cloud sync
          // This prevents race conditions and ensures atomic visibility on server
          logger.logAction('Adding Player to Tournament (Batch)', { player: player.name, tournament: viewingPlayersFor.title });
          
          const updatedTournaments = tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t);
          const updatedPlayers = players.map(p => String(p.id).toLowerCase() === String(updatedPlayer.id).toLowerCase() ? updatedPlayer : p);
          
          onBatchUpdate({
            tournaments: updatedTournaments,
            players: updatedPlayers
          });

          setViewingPlayersFor(updatedTournament);
          Alert.alert("Success", `Player ${player.name} added. They must complete payment to confirm registration.`);
        }}
      />

      {/* Tournament Form Modal */}
      <Modal visible={isFormOpen} animationType="slide">
        <SafeAreaView style={styles.modalScroll}>
            <View style={styles.formHeader}>
                <View style={[styles.flex, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={styles.formTitle}>
                        {isReadOnly ? 'Tournament Details' : (editingT ? 'Edit Tournament' : 'Host New Event')}
                    </Text>
                    {!isReadOnly && !editingT && (
                        <TouchableOpacity onPress={autofillTestData} style={styles.autofillBtn}>
                            <Text style={styles.autofillBtnText}>Autofill Test</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity onPress={() => setIsFormOpen(false)} style={styles.formCloseBtn}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : null}
                style={styles.flex}
            >
                <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Title</Text>
                        <TextInput 
                            value={formTitle}
                            onChangeText={setFormTitle}
                            editable={!isReadOnly}
                            style={styles.formInput}
                        />
                    </View>

                    <View style={styles.gridRow}>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Sport</Text>
                            <TouchableOpacity 
                                disabled={isReadOnly}
                                onPress={() => setActivePicker('sport')}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formSport}</Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Skill</Text>
                            <TouchableOpacity 
                                disabled={isReadOnly}
                                onPress={() => setActivePicker('skill')}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formSkill}</Text>
                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Venue</Text>
                        <TextInput 
                            value={formVenue}
                            onChangeText={setFormVenue}
                            editable={!isReadOnly}
                            style={styles.formInput}
                        />
                    </View>

                    <View style={styles.gridRow}>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Date</Text>
                            <TouchableOpacity 
                                disabled={isReadOnly}
                                onPress={() => setActivePicker('date')}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formDate || 'Select Date'}</Text>
                                <Ionicons name="calendar-outline" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Deadline</Text>
                            <TouchableOpacity 
                                disabled={isReadOnly}
                                onPress={() => setActivePicker('deadline')}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formRegDeadline || 'Select Deadline'}</Text>
                                <Ionicons name="time-outline" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Time</Text>
                        <TouchableOpacity 
                            disabled={isReadOnly}
                            onPress={() => setActivePicker('time')}
                            style={styles.pickerBtn}
                        >
                            <Text style={styles.pickerBtnText}>{formTime}</Text>
                            <Ionicons name="time" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.gridRow}>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Fee (₹)</Text>
                            <TextInput 
                                value={formFee}
                                onChangeText={setFormFee}
                                editable={!isReadOnly}
                                keyboardType="numeric"
                                style={styles.formInput}
                            />
                        </View>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Max Players</Text>
                            <TextInput 
                                value={formMaxPlayers}
                                onChangeText={setFormMaxPlayers}
                                editable={!isReadOnly}
                                keyboardType="numeric"
                                style={styles.formInput}
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Structure</Text>
                        <TouchableOpacity 
                            disabled={isReadOnly}
                            onPress={() => setActivePicker('structure')}
                            style={styles.pickerBtn}
                        >
                            <Text style={styles.pickerBtnText}>{formStructure}</Text>
                            <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Format</Text>
                        <TouchableOpacity 
                            disabled={isReadOnly}
                            onPress={() => setActivePicker('format')}
                            style={styles.pickerBtn}
                        >
                            <Text style={styles.pickerBtnText}>{formFormat}</Text>
                            <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Prize Pool</Text>
                        <TextInput 
                            value={formPrize}
                            onChangeText={setFormPrize}
                            editable={!isReadOnly}
                            placeholder="e.g. ₹5000 + Medal"
                            style={styles.formInput}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Description</Text>
                        <TextInput 
                            value={formDescription}
                            onChangeText={setFormDescription}
                            editable={!isReadOnly}
                            multiline
                            style={[styles.formInput, styles.textArea]}
                        />
                    </View>

                    {!isReadOnly && (
                        <View style={styles.coachAssignmentSection}>
                            <Text style={styles.coachSectionTitle}>Coach Assignment</Text>
                            <View style={styles.assignmentBtnRow}>
                                <TouchableOpacity 
                                    onPress={() => setCoachAssignmentType('academy')}
                                    style={[styles.assignmentBtn, coachAssignmentType === 'academy' && styles.assignmentBtnActive]}
                                >
                                    <Text style={[styles.assignmentBtnText, coachAssignmentType === 'academy' && styles.assignmentBtnTextActive]}>Use Academy Coach</Text>
                                    {coachAssignmentType === 'academy' && <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />}
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    onPress={() => setCoachAssignmentType('platform')}
                                    style={[styles.assignmentBtn, coachAssignmentType === 'platform' && styles.assignmentBtnActive]}
                                >
                                    <Text style={[styles.assignmentBtnText, coachAssignmentType === 'platform' && styles.assignmentBtnTextActive]}>Request Platform Coach</Text>
                                    {coachAssignmentType === 'platform' && <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />}
                                </TouchableOpacity>
                            </View>

                            {coachAssignmentType === 'academy' && (
                                <View style={styles.academyCoachForm}>
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.fieldLabel}>Select Coach</Text>
                                        <TouchableOpacity onPress={() => setActivePicker('coach')} style={styles.pickerBtn}>
                                            <Text style={styles.pickerBtnText}>
                                                {selectedAcademyCoachId === 'other' ? 'Other Coach (Invite)' : (players.find(p => p.id === selectedAcademyCoachId)?.name || 'Select a coach...')}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                    {selectedAcademyCoachId === 'other' && (
                                        <View style={styles.otherCoachFields}>
                                            <TextInput placeholder="Coach Full Name" value={otherCoachName} onChangeText={setOtherCoachName} style={styles.formInput} />
                                            <TextInput placeholder="Coach Email Address" value={otherCoachEmail} onChangeText={setOtherCoachEmail} keyboardType="email-address" style={styles.formInput} />
                                            <TextInput placeholder="Coach Phone (Optional)" value={otherCoachPhone} onChangeText={setOtherCoachPhone} keyboardType="phone-pad" style={styles.formInput} />
                                        </View>
                                    )}
                                </View>
                            )}

                            {coachAssignmentType === 'platform' && (
                                <View style={styles.platformCoachInfo}>
                                    <Ionicons name="information-circle" size={20} color="#3B82F6" />
                                    <Text style={styles.platformInfoText}>A request will be broadcasted to all elite platform coaches. The first available coach to confirm will be assigned.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    <View style={styles.formFooter}>
                        {!isReadOnly && (
                            <TouchableOpacity onPress={handleFormSubmit} style={styles.saveBtn}>
                                <Text style={styles.saveBtnText}>Save Event</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => setIsFormOpen(false)} style={styles.cancelBtn}>
                            <Text style={styles.cancelBtnText}>{isReadOnly ? 'Close' : 'Cancel'}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
        {renderPickerModal()}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  addBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterBtnActive: {
    backgroundColor: '#0F172A',
  },
  filterBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  tCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tCardPast: {
    opacity: 0.7,
    backgroundColor: '#F8FAFC',
  },
  tCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  tTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  tMeta: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  editBtn: {
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  coachBanner: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  coachInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  coachLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#3B82F6',
    textTransform: 'uppercase',
  },
  coachName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  otpSection: {
    minHeight: 40,
    justifyContent: 'center',
  },
  viewOtpBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewOtpBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3B82F6',
    letterSpacing: 1,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 12,
  },
  otpBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  otpLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  otpValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2,
  },
  tCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    gap: 2,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgePast: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusBadgeTextActive: {
    color: '#EF4444',
  },
  statusBadgeTextPast: {
    color: '#64748B',
  },
  emptyView: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  modalScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  formCloseBtn: {
    padding: 4,
  },
  formContent: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingLeft: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pickerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  coachAssignmentSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 16,
  },
  coachSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  assignmentBtnRow: {
    gap: 10,
  },
  assignmentBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  assignmentBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  assignmentBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  assignmentBtnTextActive: {
    color: '#1E40AF',
  },
  academyCoachForm: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 24,
    gap: 16,
  },
  otherCoachFields: {
    gap: 12,
  },
  platformCoachInfo: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 20,
    gap: 12,
    alignItems: 'center',
  },
  platformInfoText: {
    flex: 1,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E40AF',
    lineHeight: 16,
  },
  formFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingBottom: 40,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  cancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 100,
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  pickerList: {
    padding: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 4,
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  pickerItemTextActive: {
    color: '#3B82F6',
  },
  flex: { flex: 1 },
  autofillBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  autofillBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6366F1',
    textTransform: 'uppercase',
  },
});

export default AcademyScreen;
