import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Modal, TextInput, Alert, Dimensions,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { VideoManagement } from '../components/VideoManagement';
import PlayerDashboardView from '../components/PlayerDashboardView';
import ParticipantsModal from '../components/ParticipantsModal';
import PureJSDateTimePicker from '../components/PureJSDateTimePicker';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';
import BroadcastTools from '../components/BroadcastTools';
import { AcademyAnalytics } from '../components/AcademyAnalytics';

const { width, height } = Dimensions.get('window');

export const AcademyScreen = ({ 
  academyId, user, tournaments, players, matchVideos, matches, evaluations,
  onSaveTournament, onUpdateTournament, onSaveVideo, onCancelVideo, onRequestDeletion,
  onUpdateUser, onReplyTicket, onUpdateTicketStatus, onTopUp, onRegister, onReschedule, onLogTrace,
  setPlayers, isSyncing, onBatchUpdate, onDeleteTournament
}) => {
  const [subTab, setSubTab] = useState('tournaments');
  const [tFilter, setTFilter] = useState('upcoming');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingT, setEditingT] = useState(null);
  const [viewingTournamentId, setViewingTournamentId] = useState(null);

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
  ].filter(pid => !!pid)));
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
      id: editingT?.id || `t_${Date.now()}`,
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
      {/* Premium Dashboard Header */}
      <View style={styles.premiumHeader}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.welcomeLabel}>Welcome back,</Text>
            <Text style={styles.academyNameText}>{user?.name || 'Academy'}</Text>
          </View>
            {/* Add button remains here for now as requested */}
            {subTab === 'tournaments' && (
              <TouchableOpacity 
                onPress={() => { setEditingT(null); setIsFormOpen(true); }}
                style={styles.premiumAddBtn}
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
        </View>

        <View style={styles.statsDashboard}>
          <View style={styles.dashStatCard}>
            <Text style={styles.dashStatVal}>{myTournaments.filter(t => t.status !== 'completed').length}</Text>
            <Text style={styles.dashStatLabel}>Active Events</Text>
          </View>
          <View style={styles.dashStatDivider} />
          <View style={styles.dashStatCard}>
            <Text style={styles.dashStatVal}>{myParticipants.length}</Text>
            <Text style={styles.dashStatLabel}>Total Players</Text>
          </View>
          <View style={styles.dashStatDivider} />
          <View style={styles.dashStatCard}>
            <Text style={styles.dashStatVal}>{matchVideos.filter(v => v.academyId === academyId).length}</Text>
            <Text style={styles.dashStatLabel}>Video Assets</Text>
          </View>
        </View>
      </View>

      {/* Modern Segmented Tabs */}
      <View style={styles.segmentedTabContainer}>
        <View style={styles.segmentedTabBar}>
          <TouchableOpacity 
            onPress={() => setSubTab('tournaments')} 
            style={[styles.segTab, subTab === 'tournaments' && styles.segTabActive]}
          >
            <Ionicons name="trophy" size={16} color={subTab === 'tournaments' ? '#6366F1' : '#94A3B8'} />
            <Text style={[styles.segTabText, subTab === 'tournaments' && styles.segTabTextActive]}>Events</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setSubTab('videos')} 
            style={[styles.segTab, subTab === 'videos' && styles.segTabActive]}
          >
            <Ionicons name="videocam" size={16} color={subTab === 'videos' ? '#6366F1' : '#94A3B8'} />
            <Text style={[styles.segTabText, subTab === 'videos' && styles.segTabTextActive]}>Media</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setSubTab('insights')} 
            style={[styles.segTab, subTab === 'insights' && styles.segTabActive]}
          >
            <Ionicons name="people" size={16} color={subTab === 'insights' ? '#6366F1' : '#94A3B8'} />
            <Text style={[styles.segTabText, subTab === 'insights' && styles.segTabTextActive]}>Scouts</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setSubTab('broadcast')} 
            style={[styles.segTab, subTab === 'broadcast' && styles.segTabActive]}
          >
            <Ionicons name="megaphone" size={16} color={subTab === 'broadcast' ? '#6366F1' : '#94A3B8'} />
            <Text style={[styles.segTabText, subTab === 'broadcast' && styles.segTabTextActive]}>Blast</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
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

            {filteredTournaments.map(t => (
              <View key={t.id} style={[styles.premiumCard, tFilter === 'past' && styles.tCardPast]}>
                <View style={styles.premiumCardBody}>
                  <View style={styles.tCardMainInfo}>
                    <View style={styles.sportBadgeSmall}>
                        <Ionicons 
                            name={t.sport === Sport.Tennis ? "tennisball" : (t.sport === Sport.Badminton ? "fitness" : "disc")} 
                            size={12} 
                            color="#6366F1" 
                        />
                        <Text style={styles.sportBadgeTextSmall}>{t.sport}</Text>
                    </View>
                    <Text style={styles.premiumTTitle}>{t.title}</Text>
                    <View style={styles.locationRow}>
                        <Ionicons name="location" size={12} color="#94A3B8" />
                        <Text style={styles.locationTextSmall} numberOfLines={1}>{t.location}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.tCardRightActions}>
                    <TouchableOpacity 
                        onPress={() => { setEditingT(t); setIsFormOpen(true); }}
                        style={styles.premiumEditBtn}
                    >
                        <Ionicons name={tFilter === 'past' ? "eye" : "create"} size={20} color="#6366F1" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.premiumTInfoGrid}>
                    <View style={styles.infoGridItem}>
                        <Text style={styles.infoGridLabel}>Date</Text>
                        <Text style={styles.infoGridValue}>{t.date}</Text>
                    </View>
                    <View style={styles.infoGridItem}>
                        <Text style={styles.infoGridLabel}>Participants</Text>
                        <Text style={styles.infoGridValue}>{(t.registeredPlayerIds || []).length} / {t.maxPlayers}</Text>
                    </View>
                    <View style={styles.infoGridItem}>
                        <Text style={styles.infoGridLabel}>Entry Fee</Text>
                        <Text style={styles.infoGridValue}>₹{t.entryFee}</Text>
                    </View>
                </View>

                {(t.coachStatus === 'Coach Assigned' || t.coachStatus === 'Coach Assigned - Academy') && t.assignedCoachId && (
                    <View style={styles.premiumCoachSection}>
                        <View style={styles.premiumCoachHeader}>
                            <View style={styles.premiumCoachAvatar}>
                                <Ionicons name="person" size={14} color="#6366F1" />
                            </View>
                            <View style={styles.flex}>
                                <Text style={styles.premiumCoachLabel}>Assigned Coach</Text>
                                <Text style={styles.premiumCoachName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                            </View>
                            {tFilter === 'upcoming' && t.status !== 'completed' && !t.tournamentConcluded && (
                                <View style={styles.premiumOtpTrigger}>
                                    {visibleOtps.has(t.id) ? (
                                        <TouchableOpacity 
                                            onPress={() => setVisibleOtps(prev => {
                                                const next = new Set(prev);
                                                next.delete(t.id);
                                                return next;
                                            })}
                                            style={styles.premiumOtpBox}
                                        >
                                            <Text style={styles.pOtpVal}>{t.startOtp}</Text>
                                            <View style={styles.pOtpLine} />
                                            <Text style={styles.pOtpVal}>{t.endOtp}</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity 
                                            onPress={() => setVisibleOtps(prev => new Set(prev).add(t.id))}
                                            style={styles.pViewOtpBtn}
                                        >
                                            <Text style={styles.pViewOtpText}>OTP</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.premiumCardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <TouchableOpacity 
                          onPress={() => setViewingTournamentId(t.id)}
                          style={styles.premiumPrimaryBtn}
                      >
                          <Text style={styles.premiumPrimaryBtnText}>Manage Roster</Text>
                          {t.interestedPlayerIds?.length > 0 && (
                            <View style={styles.interestBadge}>
                              <Text style={styles.interestBadgeText}>{t.interestedPlayerIds.length}</Text>
                            </View>
                          )}
                          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                      </TouchableOpacity>

                      {(t.registeredPlayerIds || []).length === 0 && (t.pendingPaymentPlayerIds || []).length === 0 && (
                        <TouchableOpacity 
                            onPress={() => {
                              Alert.alert(
                                "Delete Tournament",
                                "Are you sure you want to permanently delete this tournament?",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  { text: "Delete", style: "destructive", onPress: () => onDeleteTournament(t.id) }
                                ]
                              );
                            }}
                        >
                            <Text style={styles.footerDeleteButton}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    <View style={[styles.premiumStatusPill, tFilter === 'past' ? styles.statusPillPast : styles.statusPillActive]}>
                        <View style={[styles.statusDot, tFilter === 'past' ? { backgroundColor: '#94A3B8' } : { backgroundColor: '#EF4444' }]} />
                        <Text style={[styles.premiumStatusText, tFilter === 'past' ? { color: '#64748B' } : { color: '#EF4444' }]}>
                            {tFilter === 'past' ? 'Archived' : (t.status === 'upcoming' ? 'Upcoming' : t.status)}
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
                <BroadcastTools tournaments={tournaments.filter(t => t.creatorId === academyId)} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Forms & Modals */}
      {(() => {
        const viewingPlayersFor = tournaments.find(t => t.id === viewingTournamentId);
        return (
          <ParticipantsModal 
            tournament={viewingPlayersFor} 
            players={players} 
            evaluations={evaluations}
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
              Alert.alert("Success", `Player ${player.name} added. They must complete payment to confirm registration.`);
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
                            <TouchableOpacity onPress={autofillTestData} style={styles.autofillBtn}>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  premiumHeader: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  welcomeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  academyNameText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  premiumAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  statsDashboard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  dashStatCard: {
    flex: 1,
    alignItems: 'center',
  },
  dashStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  dashStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  dashStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  segmentedTabContainer: {
    paddingHorizontal: 20,
    marginTop: -20,
    zIndex: 20,
  },
  segmentedTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  segTabActive: {
    backgroundColor: '#EEF2FF',
  },
  segTabText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
  },
  segTabTextActive: {
    color: '#6366F1',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  downloadFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4
  },
  downloadFilterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6366F1'
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  premiumCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  premiumCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tCardMainInfo: {
    flex: 1,
    gap: 4,
  },
  sportBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  sportBadgeTextSmall: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6366F1',
    textTransform: 'uppercase',
  },
  premiumTTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  premiumEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumTInfoGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  infoGridItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoGridLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  infoGridValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    marginTop: 2,
  },
  premiumCoachSection: {
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  premiumCoachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumCoachAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumCoachLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#6366F1',
    textTransform: 'uppercase',
  },
  premiumCoachName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E40AF',
  },
  premiumOtpTrigger: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pViewOtpBtn: {
    paddingHorizontal: 4,
  },
  pViewOtpText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6366F1',
  },
  premiumOtpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pOtpVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  pOtpLine: {
    width: 1,
    height: 12,
    backgroundColor: '#E2E8F0',
  },
  premiumCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumPrimaryBtn: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
  },
  premiumPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 6,
  },
  footerDeleteButton: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    textDecorationLine: 'underline'
  },
  premiumStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillActive: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' },
  statusPillPast: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  interestBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10
  },
  interestBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900'
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  premiumStatusText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tCardPast: {
    opacity: 0.8,
    backgroundColor: '#F8FAFC',
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
  broadcastContainer: {
    paddingTop: 10,
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  broadcastIconBg: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  broadcastTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  broadcastSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  broadcastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
});

export default AcademyScreen;
