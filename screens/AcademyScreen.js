import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Modal, TextInput, Alert, Dimensions,
  KeyboardAvoidingView, Platform, ActivityIndicator, LayoutAnimation
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { Ionicons } from '@expo/vector-icons';
import { VideoManagement } from '../components/VideoManagement';
import PlayerDashboardView from '../components/PlayerDashboardView';
import ParticipantsModal from '../components/ParticipantsModal';
import PureJSDateTimePicker from '../components/PureJSDateTimePicker';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';
import BroadcastTools from '../components/BroadcastTools';
import { AcademyAnalytics } from '../components/AcademyAnalytics';
import { formatDateIST } from '../utils/tournamentUtils';
import { AcademyTournamentCard } from '../components/AcademySubComponents';
import AcademyMembersPanel from '../components/AcademyMembersPanel';
import CourtManager from '../components/CourtManager';
import { useAuth } from '../context/AuthContext';
import { usePlayersStore } from '../stores';
import { useTournamentsStore } from '../stores';
import { useVideoStore } from '../stores';
import { useSync } from '../context/SyncContext';
import { useSupportStore } from '../stores';
import TournamentService from '../services/TournamentService';
import { useEvaluationsStore } from '../stores';

export const AcademyScreen = () => {
  const { currentUser: user, userRole, onUpdateUser, onTopUp, onRegisterUser: onRegister } = useAuth();
  const academyId = user?.id; 
  const { tournaments, onSaveTournament, onUpdateTournament, onReschedule, onDeleteTournament } = useTournamentsStore();
  const { players, setPlayers } = usePlayersStore();
  const { matchVideos, matches, onSaveVideo, onCancelVideo, onRequestDeletion } = useVideoStore();
  const { evaluations } = useEvaluationsStore();
  const { isSyncing, serverClockOffset, onLogTrace } = useSync();
  const { onReplyTicket, onUpdateTicketStatus } = useSupportStore();
  
  // onBatchUpdate -> syncAndSaveData from SyncContext
  const { syncAndSaveData: onBatchUpdate } = useSync();
  const [subTab, setSubTab] = useState('tournaments'); // Default to events
  const [tFilter, setTFilter] = useState('upcoming');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingT, setEditingT] = useState(null);
  const [viewingTournamentId, setViewingTournamentId] = useState(null);

  const handleTabChange = (newTab) => {
    if (!newTab || newTab === subTab) return;
    
    // 🛡️ [Reflective Safety] Ensure we don't crash if LayoutAnimation or Haptics fails
    try {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      console.warn('[AcademyScreen] UI feedback failed:', e);
    }
    
    setSubTab(newTab);
  };

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
      myTournamentsCount: tournaments.filter(t => TournamentService.normalizeId(t.creatorId) === TournamentService.normalizeId(academyId)).length,
    });
  }, [academyId, user, tournaments]);

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
  const [formSponsorName, setFormSponsorName] = useState('');
  const [formSponsorLogoUrl, setFormSponsorLogoUrl] = useState('');

  // Picker States
  const [activePicker, setActivePicker] = useState(null); // 'sport', 'skill', 'structure', 'format', 'coach', 'date', 'deadline', 'time'

  useEffect(() => {
    if (editingT) {
      setFormTitle(editingT.title || '');
      setFormSport(editingT.sport || Sport.Tennis);
      setFormSkill(editingT.skillLevel || SkillLevel.Beginner);
      setFormVenue(editingT.venue || editingT.location || '');
      setFormDate(editingT.date || '');
      setFormRegDeadline(editingT.registrationDeadline || '');
      setFormTime(editingT.time || '09:00 AM');
      setFormFee(editingT.entryFee?.toString() || '');
      setFormMaxPlayers(editingT.maxPlayers?.toString() || '');
      setFormStructure(editingT.structure || TournamentStructure.SingleElimination);
      setFormFormat(editingT.format || TournamentFormat.Singles);
      setFormPrize(editingT.prizePool || '');
      setFormDescription(editingT.description || '');
      setFormSponsorName(editingT.sponsorName || '');
      setFormSponsorLogoUrl(editingT.sponsorLogoUrl || '');
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
    
    // Autopopulate Venue with Academy Name and Location/Area
    const academyName = user?.name || '';
    const academyArea = user?.area || user?.location || user?.city || '';
    const initialVenue = academyArea ? `${academyName}, ${academyArea}` : academyName;
    setFormVenue(initialVenue);

    setFormDate('');
    setFormRegDeadline('');
    setFormTime('09:00 AM');
    setFormFee('');
    setFormMaxPlayers('');
    setFormStructure(TournamentStructure.SingleElimination);
    setFormFormat(TournamentFormat.Singles);
    setFormPrize('');
    setFormDescription('');
    setFormSponsorName('');
    setFormSponsorLogoUrl('');
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
    t && TournamentService.normalizeId(t.creatorId) === TournamentService.normalizeId(academyId)
  );
  const participantIds = new Set(myTournaments.flatMap(t => [
    ...(t.registeredPlayerIds || []), 
    ...(t.pendingPaymentPlayerIds || []),
    ...(t.waitlistedPlayerIds || []),
    ...Object.keys(t.playerStatuses || {})
  ].filter(pid => !!pid)));
  const myParticipants = players.filter(p => participantIds.has(p.id));

  const filteredTournaments = myTournaments.filter(t => {
      // Robust, timezone-agnostic date comparison using YYYY-MM-DD strings
      const todayStr = new Date(Date.now() + (serverClockOffset || 0)).toISOString().split('T')[0];
      const isPast = t.date < todayStr;
      
      if (tFilter === 'upcoming') {
        return t.status !== 'completed' && !t.tournamentConcluded && (!isPast || t.tournamentStarted);
      } else {
        return t.status === 'completed' || t.tournamentConcluded || (isPast && !t.tournamentStarted);
      }
  });

  const nowSync = Date.now() + (serverClockOffset || 0);
  const isReadOnly = (editingT?.date ? new Date(editingT.date).getTime() < new Date(nowSync).setHours(0,0,0,0) : false) || editingT?.status === 'completed' || editingT?.tournamentConcluded;

  const handleFormSubmit = () => {
    if (isReadOnly || isSubmitting) return;
    setIsSubmitting(true);
    
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

    // Advanced Location Mapping: Format [Venue], [City], [State]
    // Fix: If formVenue already contains academyName or city, we handle gracefully
    const academyName = user?.name || 'Academy';
    const city = user?.city || 'Bangalore';
    const state = user?.state || 'Karnataka';
    
    let fullLocation = formVenue;
    if (!fullLocation.includes(city)) {
        fullLocation = `${fullLocation}, ${city}, ${state}`;
    }

    // Geocoding Simulation (Mapping to Lat/Lng)
    const getCoords = (loc) => {
      // Mock coordinates for demonstration
      if (loc.toLowerCase().includes('bangalore')) return { lat: 12.9716, lng: 77.5946 };
      if (loc.toLowerCase().includes('mumbai')) return { lat: 19.0760, lng: 72.8777 };
      if (loc.toLowerCase().includes('delhi')) return { lat: 28.6139, lng: 77.2090 };
      return { lat: 12.9716 + (Math.random() - 0.5) * 0.1, lng: 77.5946 + (Math.random() - 0.5) * 0.1 };
    };

    const coords = getCoords(fullLocation);

    const newT = {
      id: editingT?.id || `tournament_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      title: formTitle,
      sport: formSport,
      location: fullLocation,
      venue: formVenue,
      city: city,
      state: state,
      lat: coords.lat,
      lng: coords.lng,
      date: formDate,
      time: formTime,
      registrationDeadline: formRegDeadline,
      skillLevel: formSkill,
      structure: formStructure,
      format: formFormat,
      entryFee: Number(formFee),
      prizePool: formPrize,
      sponsorName: formSponsorName,
      sponsorLogoUrl: formSponsorLogoUrl,
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
    setTimeout(() => setIsSubmitting(false), 500); 
  };

  const handleClone = (t) => {
    setFormTitle(`${t.title} (Clone)`);
    setFormSport(t.sport);
    setFormSkill(t.skillLevel);
    setFormVenue(t.venue || t.location?.split(', ')[1] || '');
    
    // Default to today + 7 for clone
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const dateStr = d.toISOString().split('T')[0];
    setFormDate(dateStr);
    setSelectedDate(dateStr);
    
    setFormRegDeadline(t.registrationDeadline);
    setFormTime(t.time);
    setFormFee(t.entryFee?.toString());
    setFormMaxPlayers(t.maxPlayers?.toString());
    setFormStructure(t.structure);
    setFormFormat(t.format);
    setFormPrize(t.prizePool);
    setFormDescription(t.description);
    setFormSponsorName(t.sponsorName || '');
    setFormSponsorLogoUrl(t.sponsorLogoUrl || '');
    setCoachAssignmentType(t.coachAssignmentType);
    setSelectedAcademyCoachId(t.assignedCoachId);
    
    setEditingT(null); // Ensure it saves as NEW
    setIsFormOpen(true);
    Alert.alert("Template Loaded", "Configuration copied from " + t.title);
  };

  const exportToCSV = async () => {
    try {
      let csv = "Tournament,Sport,Date,Participants,Revenue\n";
      myTournaments.forEach(t => {
        const pCount = [...new Set([
          ...(t.registeredPlayerIds || []),
          ...(t.pendingPaymentPlayerIds || []),
          ...Object.keys(t.playerStatuses || {})
        ])].filter(pid => !!pid).length;
        const revenue = pCount * (t.entryFee || 0);
        csv += `"${t.title}","${t.sport}","${t.date}",${pCount},${revenue}\n`;
      });

      const filename = `${FileSystem.documentDirectory}AceTrack_Revenue_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(filename, csv);
      await Sharing.shareAsync(filename);
    } catch (e) {
      Alert.alert("Export Failed", e.message);
    }
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
        case 'coach': {
            let tDayOfWeek = -1;
            let tTime24 = '';
            if (formDate && formTime) {
                const d = new Date(formDate);
                if (!isNaN(d.getTime())) {
                    tDayOfWeek = d.getDay();
                    const parts = formTime.split(' ');
                    if (parts.length === 2) {
                        let [hours, minutes] = parts[0].split(':');
                        if (hours === '12') hours = '00';
                        if (parts[1].toUpperCase() === 'PM') hours = (parseInt(hours, 10) + 12).toString();
                        hours = hours.toString().padStart(2, '0');
                        tTime24 = `${hours}:${minutes}`;
                    } else {
                        tTime24 = formTime;
                    }
                }
            }

            options = players.filter(p => p.role === 'coach' && p.academyId === academyId && p.isApprovedCoach).map(c => {
                let nameLabel = c.name;
                if (tDayOfWeek !== -1 && tTime24) {
                    const avail = c.availability || [];
                    const isAvail = avail.some(slot => slot.dayOfWeek === tDayOfWeek && tTime24 >= slot.startTime && tTime24 < slot.endTime);
                    if (!isAvail) {
                        nameLabel = `${c.name} (Unavailable)`;
                    }
                }
                return { id: c.id, name: nameLabel };
            });
            options.push({ id: 'other', name: '+ Other Coach (Invite)' });
            currentVal = selectedAcademyCoachId;
            setter = setSelectedAcademyCoachId;
            break;
        }
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
                                <Text style={styles.pickerTitle}>Select Reg. Deadline</Text>
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
      {/* Premium Dashboard Header */}
      <View style={styles.premiumHeader}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.welcomeLabel}>WELCOME BACK,</Text>
            <Text style={styles.academyNameText}>{user?.name || 'Academy'}</Text>
          </View>
          {subTab === 'tournaments' && (
            <TouchableOpacity 
              testID="academy.createTournament.btn"
              onPress={() => { 
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setEditingT(null); 
                setIsFormOpen(true); 
              }}
              style={styles.premiumAddBtn}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsDashboard}>
          <TouchableOpacity 
            onPress={() => { handleTabChange('tournaments'); setTFilter('upcoming'); }}
            style={styles.dashStatCard}
          >
            <Text style={styles.dashStatVal}>
              {myTournaments.filter(t => {
                const todayStr = new Date(Date.now() + (serverClockOffset || 0)).toISOString().split('T')[0];
                const isPast = t.date < todayStr;
                return t.status !== 'completed' && !t.tournamentConcluded && (!isPast || t.tournamentStarted);
              }).length}
            </Text>
            <Text style={styles.dashStatLabel}>Active Events</Text>
          </TouchableOpacity>
          <View style={styles.dashStatDivider} />
          <TouchableOpacity 
            onPress={() => handleTabChange('insights')}
            style={styles.dashStatCard}
          >
            <Text style={styles.dashStatVal}>{myParticipants.length}</Text>
            <Text style={styles.dashStatLabel}>Total Players</Text>
          </TouchableOpacity>
          <View style={styles.dashStatDivider} />
          <TouchableOpacity 
            onPress={() => handleTabChange('videos')}
            style={styles.dashStatCard}
          >
            <Text style={styles.dashStatVal}>{matchVideos.filter(v => v.academyId === academyId).length}</Text>
            <Text style={styles.dashStatLabel}>Video Assets</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modern Segmented Tabs */}
      <View style={styles.segmentedTabContainer}>
        <View style={styles.segmentedTabBar}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <TouchableOpacity 
            onPress={() => handleTabChange('tournaments')} 
            style={[styles.segTab, subTab === 'tournaments' && styles.segTabActive]}
          >
            <Ionicons name="trophy" size={16} color={subTab === 'tournaments' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'tournaments' && styles.segTabTextActive]}>Events</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleTabChange('videos')} 
            style={[styles.segTab, subTab === 'videos' && styles.segTabActive]}
          >
            <Ionicons name="videocam" size={16} color={subTab === 'videos' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'videos' && styles.segTabTextActive]}>Media</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleTabChange('insights')} 
            style={[styles.segTab, subTab === 'insights' && styles.segTabActive]}
          >
            <Ionicons name="people" size={16} color={subTab === 'insights' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'insights' && styles.segTabTextActive]}>Scouts</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleTabChange('broadcast')} 
            style={[styles.segTab, subTab === 'broadcast' && styles.segTabActive]}
          >
            <Ionicons name="megaphone" size={16} color={subTab === 'broadcast' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'broadcast' && styles.segTabTextActive]}>Blast</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleTabChange('members')} 
            style={[styles.segTab, subTab === 'members' && styles.segTabActive]}
          >
            <Ionicons name="people-circle" size={16} color={subTab === 'members' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'members' && styles.segTabTextActive]}>Members</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleTabChange('courts')} 
            style={[styles.segTab, subTab === 'courts' && styles.segTabActive]}
          >
            <Ionicons name="tennisball" size={16} color={subTab === 'courts' ? colors.primary.base : colors.navy[400]} />
            <Text style={[styles.segTabText, subTab === 'courts' && styles.segTabTextActive]}>Courts</Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <ScrollView 
        testID="academy.scrollview"
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {subTab === 'tournaments' && (
          <View>
            <View style={styles.filterRow}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setTFilter('upcoming')} style={[styles.filterBtn, tFilter === 'upcoming' && styles.filterBtnActive]}>
                  <Text style={[styles.filterBtnText, tFilter === 'upcoming' && styles.filterBtnTextActive]}>Upcoming</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTFilter('past')} style={[styles.filterBtn, tFilter === 'past' && styles.filterBtnActive]}>
                  <Text style={[styles.filterBtnText, tFilter === 'past' && styles.filterBtnTextActive]}>Past</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={exportToCSV} style={styles.downloadFilterBtn}>
                <Ionicons name="download-outline" size={18} color="#6366F1" />
                <Text style={styles.downloadFilterText}>Export</Text>
              </TouchableOpacity>
            </View>

            {filteredTournaments.map((t, idx) => (
              <AcademyTournamentCard
                key={t.id}
                t={t}
                tFilter={tFilter}
                players={players}
                visibleOtps={visibleOtps}
                setVisibleOtps={setVisibleOtps}
                setEditingT={setEditingT}
                setIsFormOpen={setIsFormOpen}
                setViewingTournamentId={setViewingTournamentId}
                onDeleteTournament={onDeleteTournament}
                styles={styles}
              />
            ))}
            {filteredTournaments.length === 0 && (
                <View style={[styles.emptyView, { paddingBottom: 100 }]} testID="academy.tournaments.empty">
                    <View style={{ alignItems: 'center' }}>
                        <Ionicons name="alert-circle-outline" size={40} color="#94A3B8" />
                        <Text style={styles.emptyText}>No {tFilter} tournaments found</Text>
                    </View>
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
            serverClockOffset={serverClockOffset}
          />
        )}

        {subTab === 'insights' && (
          <PlayerDashboardView players={myParticipants} tournaments={myTournaments} title="Scout Feed" />
        )}

        {subTab === 'broadcast' && (
          <View style={styles.broadcastContainer}>
            <View style={styles.broadcastHeader}>
                <View style={styles.broadcastIconBg}>
                    <Ionicons name="megaphone" size={24} color="#6366F1" />
                </View>
                <View style={styles.flex}>
                    <Text style={styles.broadcastTitle}>Communication Center</Text>
                    <Text style={styles.broadcastSubtitle}>Send blast messages to all participants across your events.</Text>
                </View>
            </View>
            <View style={styles.broadcastCard}>
                <BroadcastTools 
                  tournaments={tournaments.filter(t => TournamentService.normalizeId(t.creatorId) === TournamentService.normalizeId(academyId))} 
                  serverClockOffset={serverClockOffset}
                />
            </View>
          </View>
        )}

        {subTab === 'members' && (
          <AcademyMembersPanel academyId={academyId} />
        )}

        {subTab === 'courts' && (
          <CourtManager />
        )}
      </ScrollView>

      {/* Forms & Modals */}
      {(() => {
        const viewingPlayersFor = tournaments.find(t => t.id === viewingTournamentId);
        return (
          <ParticipantsModal 
            tournament={viewingPlayersFor} 
            players={players} 
            matches={matches}
            evaluations={evaluations}
            onUpdateMatch={(updatedMatch) => {
               const newMatches = matches.map(m => m.id === updatedMatch.id ? updatedMatch : m);
               onBatchUpdate({ matches: newMatches });
            }}
            onClose={() => setViewingTournamentId(null)} 
            onAddPlayer={(name, phone) => {
              if (!viewingPlayersFor) return;
              const player = players.find(p => p.name.toLowerCase() === name.toLowerCase() && p.phone === phone);
              if (!player) {
                Alert.alert("Error", 'Player not found in the app.');
                return;
              }
              const pid = String(player.id).toLowerCase();
              const isReg = (viewingPlayersFor.registeredPlayerIds || []).some(id => String(id).toLowerCase() === pid);
              const isPending = (viewingPlayersFor.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === pid);
              const currentStatus = viewingPlayersFor.playerStatuses?.[player.id];

              if ((isReg || isPending) && currentStatus !== 'Opted-Out' && currentStatus !== 'Denied') {
                Alert.alert("Info", 'Player is already registered.');
                return;
              }
              const currentCount = (viewingPlayersFor.registeredPlayerIds || []).filter(Boolean).length;
              if (currentCount >= viewingPlayersFor.maxPlayers) {
                Alert.alert("Error", 'Tournament is full.');
                return;
              }

              const updatedStatuses = { ...(viewingPlayersFor.playerStatuses || {}) };
              delete updatedStatuses[player.id];

              const updatedTournament = {
                ...viewingPlayersFor,
                pendingPaymentPlayerIds: [...(viewingPlayersFor.pendingPaymentPlayerIds || []).filter(id => String(id).toLowerCase() !== pid), player.id],
                registeredPlayerIds: (viewingPlayersFor.registeredPlayerIds || []).filter(id => String(id).toLowerCase() !== pid),
                optedOutPlayerIds: (viewingPlayersFor.optedOutPlayerIds || []).filter(id => String(id).toLowerCase() !== pid),
                deniedPlayerIds: (viewingPlayersFor.deniedPlayerIds || []).filter(id => String(id).toLowerCase() !== pid),
                playerStatuses: updatedStatuses
              };
              
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

              logger.logAction('Adding Player to Tournament (Batch)', { player: player.name, tournament: viewingPlayersFor.title });
              
              const updatedTournaments = tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t);
              const updatedPlayers = players.map(p => String(p.id).toLowerCase() === String(updatedPlayer.id).toLowerCase() ? updatedPlayer : p);
              
              onBatchUpdate({
                tournaments: updatedTournaments,
                players: updatedPlayers
              });
              
              if (!__DEV__) {
                Alert.alert("Success", `Player ${player.name} added. They must complete payment to confirm registration.`);
              } else {
                console.log(`🧪 [TEST_DEBUG] Bypassing success alert for ${player.name}`);
              }
            }}
            onManageInterested={(playerId, action) => {
              if (!viewingPlayersFor) return;
              const player = players.find(p => p.id === playerId);
              if (!player) return;

              const pid = String(playerId).toLowerCase();
              let updatedTournament = { ...viewingPlayersFor };
              let updatedPlayer = { ...player };

              if (action === 'confirm') {
                updatedTournament = {
                  ...viewingPlayersFor,
                  interestedPlayerIds: (viewingPlayersFor.interestedPlayerIds || []).filter(id => String(id).toLowerCase() !== pid),
                  pendingPaymentPlayerIds: [...(viewingPlayersFor.pendingPaymentPlayerIds || []).filter(id => String(id).toLowerCase() !== pid), playerId]
                };

                const notification = {
                  id: `notif_${Date.now()}`,
                  title: 'Interest Confirmed!',
                  message: `${user?.name || 'Academy'} has confirmed your interest for ${viewingPlayersFor.title}. Please complete the payment to join.`,
                  date: new Date().toISOString(),
                  read: false,
                  type: 'tournament_invite',
                  tournamentId: viewingPlayersFor.id
                };
                updatedPlayer = {
                  ...player,
                  notifications: [notification, ...(player.notifications || [])]
                };

                onBatchUpdate({
                  tournaments: tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t),
                  players: players.map(p => String(p.id).toLowerCase() === pid ? updatedPlayer : p)
                });
                Alert.alert("Success", `${player.name} has been confirmed and notified to complete payment.`);
              } else if (action === 'reject') {
                updatedTournament = {
                  ...viewingPlayersFor,
                  interestedPlayerIds: (viewingPlayersFor.interestedPlayerIds || []).filter(id => String(id).toLowerCase() !== pid),
                  rejectedPlayerIds: [...(viewingPlayersFor.rejectedPlayerIds || []).filter(id => String(id).toLowerCase() !== pid), playerId]
                };
                onBatchUpdate({
                  tournaments: tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t)
                });
                Alert.alert("Response Recorded", "Player has been moved to the rejected list.");
              }
            }}
          />
        );
      })()}

      {/* Tournament Form Modal */}
      <Modal visible={isFormOpen} animationType="slide">
        <SafeAreaView style={styles.modalScroll}>
            <View style={styles.formHeader}>
                <View style={[styles.flex, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={styles.formTitle}>
                        {isReadOnly ? 'Tournament Details' : (editingT ? 'Edit Tournament' : 'Host New Event')}
                    </Text>
                    {!isReadOnly && !editingT && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity testID="academy.form.autofillBtn" onPress={autofillTestData} style={styles.autofillBtn}>
                                <Text style={styles.autofillBtnText}>Test Feed</Text>
                            </TouchableOpacity>
                        </View>
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
                <ScrollView testID="academy.form.scrollview" contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.fieldLabel}>Title</Text>
                        <TextInput 
                            testID="academy.form.title"
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
                            testID="academy.form.location"
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
                                testID="academy.form.dateBtn"
                                disabled={isReadOnly}
                                onPress={() => {
                                    if (__DEV__) {
                                        setFormDate("2026-10-10");
                                        setFormRegDeadline("2026-10-09");
                                        return;
                                    }
                                    setActivePicker('date');
                                }}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formDate || 'Select Date'}</Text>
                                <Ionicons name="calendar-outline" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Reg. Deadline</Text>
                            <TouchableOpacity 
                                disabled={isReadOnly}
                                onPress={() => setActivePicker('deadline')}
                                style={styles.pickerBtn}
                            >
                                <Text style={styles.pickerBtnText}>{formRegDeadline || 'Select Reg. Deadline'}</Text>
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
                                testID="academy.form.fee"
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
                                testID="academy.form.maxPlayers"
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

                    <View style={styles.gridRow}>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Sponsor Name</Text>
                            <TextInput 
                                value={formSponsorName}
                                onChangeText={setFormSponsorName}
                                editable={!isReadOnly}
                                style={styles.formInput}
                                placeholder="e.g. Wilson"
                            />
                        </View>
                        <View style={[styles.inputGroup, styles.flex]}>
                            <Text style={styles.fieldLabel}>Sponsor Logo URL</Text>
                            <TextInput 
                                value={formSponsorLogoUrl}
                                onChangeText={setFormSponsorLogoUrl}
                                editable={!isReadOnly}
                                style={styles.formInput}
                                placeholder="https://..."
                            />
                        </View>
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
                                    testID="academy.form.coachPlatformBtn"
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
                            <TouchableOpacity testID="academy.form.submitBtn" onPress={handleFormSubmit} style={styles.saveBtn}>
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

