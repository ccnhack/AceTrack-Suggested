import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, Alert, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';
import { Sport } from '../types';
import { Calendar } from 'react-native-calendars';

// Mock tournament hostings to check for busy slots
const MOCK_ACADEMY_TOURNAMENTS = [
  { id: 't1', academyId: 'a1', date: '2026-03-27', startTime: '10:00 AM', duration: 4 }, // 10 AM to 2 PM
  { id: 't2', academyId: 'a2', date: '2026-03-28', startTime: '02:00 PM', duration: 4 }, // 2 PM to 6 PM
];

const TIME_SLOTS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM'
];

const MOCK_PLAYERS = [
  { id: '1', name: 'Rahul S.', sport: 'Badminton', level: 'Intermediate', dist: '1.2 km', image: 'https://i.pravatar.cc/150?u=rahul' },
  { id: '2', name: 'Sneha K.', sport: 'Table Tennis', level: 'Advanced', dist: '3.5 km', image: 'https://i.pravatar.cc/150?u=sneha' },
  { id: '3', name: 'Amit V.', sport: 'Badminton', level: 'Beginner', dist: '0.8 km', image: 'https://i.pravatar.cc/150?u=amit' },
];

const MOCK_ACADEMIES = [
  { id: 'a1', name: 'Elite Smashers', managedSports: ['Badminton', 'Cricket'], level: 'Pro Academy', dist: '5 km', phone: '+91 98765 43210', image: 'https://i.pravatar.cc/150?u=elite' },
  { id: 'a2', name: 'Net Kings', managedSports: ['Table Tennis'], level: 'Intermediate', dist: '12 km', phone: '+91 87654 32109', image: 'https://i.pravatar.cc/150?u=netkings' },
  { id: 'a3', name: 'Victory Arena', managedSports: ['Badminton', 'Table Tennis'], level: 'Top Rated', dist: '8 km', phone: '+91 76543 21098', image: 'https://i.pravatar.cc/150?u=victory' },
];

export default function MatchmakingScreen({ user }) {
  const role = user?.role || 'user';
  const [activeTab, setActiveTab] = useState(role === 'coach' ? 'New Bookings' : 'Challenge'); // Challenge, Requested, Accepted, History
  const [sentRequests, setSentRequests] = useState([
    { 
        id: 'sent_mock_1', 
        name: 'Kabir L. (Elite Smashers)', 
        sport: 'Badminton', 
        // Main fields reflect the LATEST proposal (from user)
        proposedDate: '2026-03-30', // User responded with 30th March
        proposedTime: '01:00 PM', 
        location: 'Elite Smashers',
        status: 'Countered', 
        hasUserResponse: true,
        userResponseStatus: 'CounterProposed', // User suggested new slot
        userProposedDate: '2026-03-30', 
        userProposedTime: '01:00 PM',
        // Coach's last proposal tracked separately
        coachLastProposedDate: '2026-03-27', 
        coachLastProposedTime: '11:00 AM'
    }
  ]);
  const [receivedRequests, setReceivedRequests] = useState([
    { id: 'r1', academyId: 'a1', name: 'Aaryan Sharma', sport: 'Tennis', time: 'Mar 26, 12:00 PM', status: 'Pending' }
  ]);
  const [acceptedMatches, setAcceptedMatches] = useState([
    { id: 'm1', name: 'Rohan G.', sport: 'Cricket', time: 'Mar 28, 4:00 PM', location: 'Active Stadium' }
  ]);
  const [history, setHistory] = useState([
    { id: 'h1', name: 'Sameer P.', sport: 'Badminton', result: 'Won 21-18, 21-15', date: 'Mar 20, 2024' }
  ]);

  const [isChallengeModalVisible, setIsChallengeModalVisible] = useState(false);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isCounterModalVisible, setIsCounterModalVisible] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [challengeDate, setChallengeDate] = useState('');
  const [challengeTime, setChallengeTime] = useState('');
  const [selectedSport, setSelectedSport] = useState('');
  const [counterDate, setCounterDate] = useState('');
  const [counterTime, setCounterTime] = useState('');
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [selectedAcademyForVenue, setSelectedAcademyForVenue] = useState(null);
  const [negotiatedVenue, setNegotiatedVenue] = useState('opponent');
  const [expandedSlot, setExpandedSlot] = useState(null);

  const parseTime = (timeStr) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
    return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  };

  const isTimeSlotBlocked = (date, timeSlot, academyId) => {
    if (!date || !academyId) return false; // Cannot check without date or academyId
    const slotMinutes = parseTime(timeSlot);
    return MOCK_ACADEMY_TOURNAMENTS.some(t => {
      if (t.date !== date || t.academyId !== academyId) return false;
      const startMinutes = parseTime(t.startTime);
      const endMinutes = startMinutes + t.duration * 60;
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  const mySports = user?.managedSports || (user?.certifiedSports) || [Sport.BADMINTON];

  const getCommonSports = (opponent) => {
    if (role !== 'academy') return [opponent.sport];
    const opponentSports = opponent.managedSports || [];
    return mySports.filter(s => opponentSports.includes(s));
  };

  const handleChallenge = (opponent) => {
    const common = getCommonSports(opponent);
    if (common.length === 0) {
      Alert.alert("No Matching Sports", "You and this academy don't share any managed sports.");
      return;
    }
    setSelectedOpponent(opponent);
    setSelectedSport(common[0]);
    setIsChallengeModalVisible(true);
  };

  const confirmChallenge = () => {
    if (!challengeDate || !challengeTime || !selectedSport) {
      Alert.alert("Error", "Please fill all details");
      return;
    }
    setSentRequests([...sentRequests, {
      id: `sent_${Date.now()}`,
      ...selectedOpponent,
      proposedDate: challengeDate,
      proposedTime: challengeTime,
      sport: selectedSport
    }]);
    setIsChallengeModalVisible(false);
    setChallengeDate('');
    setChallengeTime('');
    Alert.alert("Challenge Sent!", `Your request to ${selectedOpponent.name} has been sent.`);
  };

  const handleAcceptChallenge = (req) => {
    setReceivedRequests(prev => prev.filter(r => r.id !== req.id));
    setAcceptedMatches(prev => [...prev, {
      ...req,
      status: 'Accepted',
      hasUserResponse: false,
      time: req.time || `${req.proposedDate}, ${req.proposedTime}`,
      location: req.location || 'Academy Grounds'
    }]);
    Alert.alert("Match Accepted", `You have confirmed the match with ${req.name}.`);
  };

  const openDetails = (challenge) => {
    setSelectedChallenge(challenge);
    setIsDetailsModalVisible(true);
  };

  const handleCounter = (req) => {
    setSelectedChallenge(req);
    setCounterDate(req.proposedDate || '');
    setCounterTime(req.proposedTime || '');
    setVenueSearchQuery('');
    setSelectedAcademyForVenue(null);
    setNegotiatedVenue('opponent');
    setIsCounterModalVisible(true);
    setIsDetailsModalVisible(false);
  };

  const getNextAvailableSlot = (date, currentSlot, academyId) => {
    const currentIndex = TIME_SLOTS.indexOf(currentSlot);
    if (currentIndex === -1) return "Check calendar";
    for (let i = currentIndex + 1; i < TIME_SLOTS.length; i++) {
        if (!isTimeSlotBlocked(date, TIME_SLOTS[i], academyId)) {
            return TIME_SLOTS[i];
        }
    }
    return "Next day";
  };

  const submitCounterProposal = () => {
    if (!counterDate || !counterTime) {
      Alert.alert("Error", "Please select date and time");
      return;
    }
    const venueLabel = role === 'coach' 
        ? (selectedAcademyForVenue ? selectedAcademyForVenue.name : 'Coach-suggested Venue')
        : (negotiatedVenue === 'own' ? 'Our Academy Grounds' : ((selectedChallenge?.name || 'Opponent') + ' Grounds'));
    
    const counteredItem = {
      ...selectedChallenge,
      proposedDate: counterDate,
      proposedTime: counterTime,
      location: venueLabel,
      coachLastProposedDate: counterDate,
      coachLastProposedTime: counterTime,
      status: 'Countered',
      hasUserResponse: false
    };

    if (role === 'coach') {
      const isAlreadyInSent = sentRequests.some(r => r.id === selectedChallenge.id);
      if (isAlreadyInSent) {
          setSentRequests(prev => prev.map(r => r.id === selectedChallenge.id ? counteredItem : r));
      } else {
          setReceivedRequests(prev => prev.filter(r => r.id !== selectedChallenge.id));
          setSentRequests(prev => [...prev, counteredItem]);
      }
    } else {
      setReceivedRequests(prev => prev.map(r => r.id === selectedChallenge.id ? counteredItem : r));
    }

    setIsCounterModalVisible(false);
    Alert.alert("Counter Proposal Sent", `You suggested ${counterDate} at ${counterTime} at ${venueLabel}.`);
  };

  const handleConfirmBooking = (req) => {
    setSentRequests(prev => prev.filter(r => r.id !== req.id));
    setAcceptedMatches(prev => [...prev, {
      ...req,
      status: 'Accepted',
      hasUserResponse: false,
      // Overwrite the base details with those agreed during negotiation
      proposedDate: req.userProposedDate || req.proposedDate,
      proposedTime: req.userProposedTime || req.proposedTime,
      location: req.location || 'Academy Grounds',
      time: `${req.userProposedDate || req.proposedDate}, ${req.userProposedTime || req.proposedTime}`
    }]);
    Alert.alert("Booking Confirmed", `You have finalized the booking with ${req.name}.`);
  };

  const handleCancelBooking = (req) => {
    Alert.alert(
      "Cancel Booking",
      `Are you sure you want to cancel the booking with ${req.name}? This action cannot be undone.`,
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: () => {
            setAcceptedMatches(prev => prev.filter(m => m.id !== req.id));
            setIsDetailsModalVisible(false);
            Alert.alert("Booking Cancelled", "The booking has been successfully removed.");
          }
        }
      ]
    );
  };

  const renderOpponent = ({ item }) => {
    const isAcademy = role === 'academy';
    const isSent = sentRequests.some(r => r.id === item.id);

    return (
      <View style={styles.card}>
        <Image source={{ uri: item.image }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.details}>{isAcademy ? (item.managedSports?.join(', ')) : item.sport} • {item.level}</Text>
          <Text style={styles.dist}><Ionicons name="location" size={12} /> {item.dist}</Text>
        </View>
        <TouchableOpacity
          style={[styles.btn, isSent && styles.btnSent]}
          onPress={() => isSent ? null : handleChallenge(item)}
        >
          <Text style={styles.btnText}>{isSent ? 'Requested' : 'Challenge'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRequested = () => {
    const counteredRequests = sentRequests.filter(req => req.status === 'Countered');
    const actualSentRequests = sentRequests.filter(req => req.status !== 'Countered');

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {(role === 'coach' || receivedRequests.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{role === 'coach' ? 'Booking Requests' : 'Received Challenges'}</Text>
            {receivedRequests.length === 0 ? (
                <Text style={[styles.emptyText, { textAlign: 'center', marginTop: 30, marginBottom: 20, fontSize: 13 }]}>No Requests Received</Text>
            ) : (
              receivedRequests.map(req => (
                <TouchableOpacity key={req.id} style={styles.requestCard} onPress={() => openDetails(req)}>
                  <View style={styles.info}>
                    <Text style={styles.name}>{req.name}</Text>
                    <Text style={[styles.details, req.status === 'Counter Proposed' && { color: '#D97706' }]}>
                      {req.sport} • {req.time || (req.proposedDate + ' @ ' + req.proposedTime)}
                      {req.status === 'Counter Proposed' ? ' (Negotiating)' : ''}
                    </Text>
                  </View>
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                      <Text style={styles.smallBtnText}>Counter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#22C55E' }]} onPress={() => handleAcceptChallenge(req)}>
                      <Text style={styles.smallBtnText}>{role === 'coach' ? 'Confirm' : 'Accept'}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Dedicated Countered Section */}
        {counteredRequests.length > 0 && (
          <View style={[styles.section, { marginTop: 20 }]}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Countered</Text>
                {role === 'coach' && counteredRequests.some(r => r.hasUserResponse) && (
                    <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                        <Text style={styles.badgeText}>{counteredRequests.filter(r => r.hasUserResponse).length} NEW RESPONSE</Text>
                    </View>
                )}
            </View>
            {counteredRequests.map(req => (
              <TouchableOpacity key={req.id} style={[styles.requestCard, { borderLeftColor: '#F59E0B' }]} onPress={() => openDetails(req)}>
                <View style={styles.info}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{req.name}</Text>
                      {req.hasUserResponse && (
                          <View style={styles.responseTag}>
                              <Text style={styles.responseTagText}>USER RESPONDED</Text>
                          </View>
                      )}
                  </View>
                  <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status}</Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                    <Text style={styles.smallBtnText}>Counter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      style={[styles.smallBtn, { backgroundColor: (role === 'coach' ? (req.hasUserResponse ? '#22C55E' : '#E2E8F0') : '#F1F5F9') }]} 
                      onPress={() => role === 'coach' ? (req.hasUserResponse ? handleConfirmBooking(req) : null) : handleCounter(req)}
                  >
                      <Text style={[styles.smallBtnText, { color: (role === 'coach' ? (req.hasUserResponse ? '#fff' : '#94A3B8') : '#333') }]}>
                        {role === 'coach' ? 'Confirm' : 'Accept'}
                      </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.section, { marginTop: counteredRequests.length > 0 ? 20 : 0 }]}>
          <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sent Requests</Text>
          </View>
          {actualSentRequests.length === 0 && <Text style={styles.emptyText}>No pending requests sent.</Text>}
          {actualSentRequests.map(req => (
            <TouchableOpacity key={req.id} style={styles.requestCard} onPress={() => openDetails(req)}>
               <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{req.name}</Text>
                  <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status || 'Pending'}</Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                    <Text style={styles.smallBtnText}>Counter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]} 
                    onPress={() => setSentRequests(sentRequests.filter(r => r.id !== req.id))}
                  >
                    <Text style={[styles.smallBtnText, { color: '#EF4444' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderAccepted = () => (
    <View style={styles.tabContent}>
      {acceptedMatches.length === 0 && <Text style={styles.emptyText}>No accepted matches yet.</Text>}
      {acceptedMatches.map(match => (
        <TouchableOpacity key={match.id} style={styles.acceptedCard} onPress={() => openDetails(match)}>
          <View style={styles.acceptedHeader}>
             <Ionicons name="calendar" size={20} color={designSystem.colors.primary} />
             <Text style={styles.acceptedTime}>{match.time}</Text>
          </View>
          <Text style={styles.acceptedTitle}>{role === 'coach' ? 'Booked by ' : 'vs '}{match.name}</Text>
          <Text style={styles.acceptedDetail}>{match.sport} • {match.location}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderHistory = () => (
    <View style={styles.tabContent}>
      {history.length === 0 && <Text style={styles.emptyText}>No match history found.</Text>}
      {history.map(item => (
        <TouchableOpacity key={item.id} style={styles.historyCard} onPress={() => openDetails(item)}>
          <View>
            <Text style={styles.historyName}>{item.name}</Text>
            <Text style={styles.historyDetail}>{item.sport} • {item.date}</Text>
          </View>
          <Text style={styles.historyResult}>{item.result}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const filteredOpponents = role === 'academy'
    ? MOCK_ACADEMIES.filter(a => a.id !== user?.id && a.managedSports.some(s => mySports.includes(s)))
    : MOCK_PLAYERS;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{role === 'coach' ? 'Coach Bookings' : (role === 'academy' ? 'Academy Matchmaking' : 'Matchmaking')}</Text>
        <View style={styles.tabs}>
           {(role === 'coach' ? ['New Bookings', 'Accepted', 'History'] : ['Challenge', 'Requested', 'Accepted', 'History']).map(tab => (
             <TouchableOpacity
               key={tab}
               style={[styles.tab, activeTab === tab && styles.activeTab]}
               onPress={() => {
                 setActiveTab(tab);
               }}
             >
               <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
             </TouchableOpacity>
           ))}
        </View>
      </View>

      {(activeTab === 'Challenge' && role !== 'coach') && (
        <FlatList
          data={filteredOpponents}
          renderItem={renderOpponent}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No matching {role === 'academy' ? 'academies' : 'players'} found near you.</Text>}
        />
      )}
      {(activeTab === 'Requested' || (role === 'coach' && activeTab === 'New Bookings')) && renderRequested()}
      {activeTab === 'Accepted' && renderAccepted()}
      {activeTab === 'History' && renderHistory()}

      {/* Challenge Propose Modal */}
      <Modal visible={isChallengeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>PROPOSE CHALLENGE</Text>
                <Text style={styles.modalTitle}>{selectedOpponent?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsChallengeModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionLabel}>Select Sport</Text>
              <View style={styles.sportGrid}>
                {selectedOpponent && getCommonSports(selectedOpponent).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sportTag, selectedSport === s && styles.sportTagActive]}
                    onPress={() => setSelectedSport(s)}
                  >
                    <Text style={[styles.sportTagText, selectedSport === s && styles.sportTagTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Select Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   onDayPress={(day) => setChallengeDate(day.dateString)}
                   markedDates={{ 
                     ...MOCK_ACADEMY_TOURNAMENTS.reduce((acc, t) => {
                        if (t.academyId === selectedOpponent?.id) {
                          acc[t.date] = { marked: true, dotColor: '#EF4444' };
                        }
                        return acc;
                     }, {}),
                     [challengeDate]: { selected: true, selectedColor: '#6366F1' } 
                   }}
                   theme={{
                     todayTextColor: '#6366F1',
                     selectedDayBackgroundColor: '#6366F1',
                     arrowColor: '#6366F1',
                     textDayFontSize: 13,
                     textMonthFontSize: 14,
                     textDayHeaderFontSize: 12,
                   }}
                 />
              </View>
              <Text style={styles.sectionLabel}>Proposed Time</Text>
              <View style={styles.timeSlots}>
                  {TIME_SLOTS.map(slot => {
                    const isBlocked = isTimeSlotBlocked(challengeDate, slot, selectedOpponent?.id);
                    const isExpanded = expandedSlot === slot;
                    const isSelBase = (challengeTime.startsWith(slot.substring(0, 2)) && challengeTime.endsWith(slot.substring(5)));
                    
                    return (
                      <View key={slot} style={[styles.slotWrapper, { zIndex: isExpanded ? 100 : 1 }]}>
                        <TouchableOpacity 
                          disabled={isBlocked}
                          style={[
                            styles.slotBtn, 
                            isSelBase && styles.slotBtnActive,
                            isBlocked && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', opacity: 0.5 }
                          ]}
                          onPress={() => setExpandedSlot(isExpanded ? null : slot)}
                        >
                          <Text style={[
                            styles.slotText, 
                            isSelBase && styles.slotTextActive,
                            isBlocked && { color: '#94A3B8' }
                          ]}>{slot}</Text>
                        </TouchableOpacity>

                        {isExpanded && !isBlocked && (
                          <View style={styles.subIntervalsPopup}>
                             {[':00', ':15', ':30', ':45'].map(mins => {
                               const fullTime = slot.replace(':00', mins);
                               const isSel = challengeTime === fullTime;
                               return (
                                 <TouchableOpacity 
                                   key={mins}
                                   style={[styles.subBtn, isSel && styles.subBtnActive]}
                                   onPress={() => {
                                     setChallengeTime(fullTime);
                                     setExpandedSlot(null);
                                   }}
                                 >
                                   <Text style={[styles.subBtnText, isSel && styles.subBtnTextActive]}>{fullTime}</Text>
                                 </TouchableOpacity>
                               );
                             })}
                          </View>
                        )}
                      </View>
                    );
                  })}
              </View>

              <TouchableOpacity style={styles.confirmBtn} onPress={confirmChallenge}>
                <Text style={styles.confirmBtnText}>Send Challenge Request</Text>
                <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 10 }} />
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Booking Details Modal */}
      <Modal visible={isDetailsModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 'auto', paddingBottom: 40 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>{role === 'coach' ? 'BOOKING DETAILS' : 'CHALLENGE DETAILS'}</Text>
                <Text style={styles.modalTitle}>{selectedChallenge?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailsGrid}>
               <View style={styles.detailItem}>
                 <Ionicons name="trophy-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Sport</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.sport}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="calendar-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Date</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.proposedDate || selectedChallenge?.time?.split(',')[0]}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="time-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Time</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.proposedTime || selectedChallenge?.time?.split(',')[1]}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="location-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Location</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.location || selectedChallenge?.dist || 'Local Arena'}</Text>
                 </View>
               </View>
                <View style={styles.detailItem}>
                 <Ionicons name="call-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Contact</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.phone || '+91 1234567890'}</Text>
                 </View>
               </View>

                {/* Only show negotiation details if NOT yet accepted */}
                {selectedChallenge?.status !== 'Accepted' && (
                    <>
                        {selectedChallenge?.hasUserResponse && (
                            <View style={[styles.detailItem, { width: '100%', backgroundColor: '#EEF2FF', borderColor: '#6366F1', borderWidth: 1 }]}>
                                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#6366F1" />
                                <View>
                                    <Text style={[styles.detailLabel, { color: '#6366F1' }]}>
                                        {selectedChallenge?.userResponseStatus === 'Accepted' ? 'Response Status' : "User's Preferred Slot"}
                                    </Text>
                                    <Text style={styles.detailValue}>
                                        {selectedChallenge?.userResponseStatus === 'Accepted' 
                                            ? 'User accepted your proposal' 
                                            : `${selectedChallenge.userProposedDate} at ${selectedChallenge.userProposedTime}`}
                                    </Text>
                                </View>
                            </View>
                        )}
                       {selectedChallenge?.status === 'Countered' && (
                            <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F0FDF4', borderColor: '#22C55E', borderWidth: 1, marginTop: 10 }]}>
                                <Ionicons name="send-outline" size={20} color="#16A34A" />
                                <View>
                                    <Text style={[styles.detailLabel, { color: '#16A34A' }]}>Your Last Counter</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedChallenge.coachLastProposedDate || selectedChallenge.proposedDate} at {selectedChallenge.coachLastProposedTime || selectedChallenge.proposedTime} • {selectedChallenge.location}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </>
                )}
            </View>

            <View style={styles.modalActionRow}>
              {receivedRequests.some(r => r.id === selectedChallenge?.id) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Proposal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => {
                      handleAcceptChallenge(selectedChallenge);
                      setIsDetailsModalVisible(false);
                    }}
                  >
                    <Text style={styles.actionBtnText}>{role === 'coach' ? 'Confirm' : 'Accept Match'}</Text>
                  </TouchableOpacity>
                </>
              )}
              {role === 'coach' && sentRequests.some(r => r.id === selectedChallenge?.id) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: selectedChallenge?.hasUserResponse ? '#22C55E' : '#F1F5F9' }]}
                    onPress={() => {
                        if (selectedChallenge?.hasUserResponse) {
                            handleConfirmBooking(selectedChallenge);
                            setIsDetailsModalVisible(false);
                        }
                    }}
                  >
                    <Text style={[styles.actionBtnText, { color: selectedChallenge?.hasUserResponse ? '#fff' : '#94A3B8' }]}>Confirm Booking</Text>
                  </TouchableOpacity>
                </>
              )}
              {selectedChallenge?.status === 'Accepted' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' }]}
                    onPress={() => handleCancelBooking(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>Cancel Booking</Text>
                  </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginTop: 10 }]} onPress={() => setIsDetailsModalVisible(false)}>
              <Text style={[styles.confirmBtnText, { color: '#64748B' }]}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Counter Proposal Modal */}
      <Modal visible={isCounterModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>COUNTER PROPOSAL</Text>
                <Text style={styles.modalTitle}>{selectedChallenge?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCounterModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionLabel}>Proposed Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   onDayPress={(day) => setCounterDate(day.dateString)}
                   markedDates={{ 
                     ...MOCK_ACADEMY_TOURNAMENTS.reduce((acc, t) => {
                        if (t.academyId === selectedChallenge?.academyId) {
                          acc[t.date] = { marked: true, dotColor: '#EF4444' };
                        }
                        return acc;
                     }, {}),
                     [counterDate]: { selected: true, selectedColor: '#6366F1' } 
                   }}
                    theme={{ todayTextColor: '#6366F1', selectedDayBackgroundColor: '#6366F1', textDayFontSize: 13 }}
                 />
              </View>

              <Text style={styles.sectionLabel}>Proposed Time</Text>
              <View style={styles.timeSlots}>
                 {TIME_SLOTS.map(slot => {
                    const isBlocked = isTimeSlotBlocked(counterDate, slot, selectedChallenge?.academyId);
                    const isExpanded = expandedSlot === slot;
                    const isSelBase = (counterTime.startsWith(slot.substring(0, 2)) && counterTime.endsWith(slot.substring(5)));
                    
                    return (
                      <View key={slot} style={[styles.slotWrapper, { zIndex: isExpanded ? 100 : 1 }]}>
                        <TouchableOpacity
                          disabled={isBlocked}
                          style={[
                            styles.slotBtn,
                            isSelBase && styles.slotBtnActive,
                            isBlocked && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', opacity: 0.5 }
                          ]}
                          onPress={() => setExpandedSlot(isExpanded ? null : slot)}
                        >
                          <Text style={[
                            styles.slotText,
                            isSelBase && styles.slotTextActive,
                            isBlocked && { color: '#94A3B8' }
                          ]}>{slot}</Text>
                        </TouchableOpacity>

                        {isExpanded && !isBlocked && (
                          <View style={styles.subIntervalsPopup}>
                             {[':00', ':15', ':30', ':45'].map(mins => {
                               const fullTime = slot.replace(':00', mins);
                               const isSel = counterTime === fullTime;
                               return (
                                 <TouchableOpacity 
                                   key={mins}
                                   style={[styles.subBtn, isSel && styles.subBtnActive]}
                                   onPress={() => {
                                     setCounterTime(fullTime);
                                     setExpandedSlot(null);
                                   }}
                                 >
                                   <Text style={[styles.subBtnText, isSel && styles.subBtnTextActive]}>{fullTime}</Text>
                                 </TouchableOpacity>
                               );
                             })}
                          </View>
                        )}
                      </View>
                    );
                 })}
              </View>

              <Text style={styles.sectionLabel}>{role === 'coach' ? 'Search Venue Academy' : 'Proposed Venue'}</Text>
              {role === 'coach' ? (
                <View style={styles.venueSearchContainer}>
                    <View style={styles.searchBox}>
                      <Ionicons name="search" size={20} color="#94A3B8" />
                      <TextInput 
                        style={styles.searchInput}
                        placeholder="Find an available academy..."
                        value={venueSearchQuery}
                        onChangeText={setVenueSearchQuery}
                      />
                    </View>
                    <ScrollView style={styles.venueResults} nestedScrollEnabled>
                        {MOCK_ACADEMIES.filter(a => a.name.toLowerCase().includes(venueSearchQuery.toLowerCase())).map(academy => {
                            const isBusy = isTimeSlotBlocked(counterDate, counterTime, academy.id);
                            const isSelected = selectedAcademyForVenue?.id === academy.id;
                            const nextSlot = isBusy ? getNextAvailableSlot(counterDate, counterTime, academy.id) : null;

                            return (
                                <TouchableOpacity 
                                  key={academy.id}
                                  disabled={isBusy}
                                  style={[
                                      styles.venueResultItem, 
                                      isSelected && styles.venueResultSelected,
                                      isBusy && { opacity: 0.6 }
                                  ]}
                                  onPress={() => setSelectedAcademyForVenue(academy)}
                                >
                                    <View>
                                        <Text style={[styles.venueName, isBusy && { color: '#94A3B8' }]}>{academy.name}</Text>
                                        <Text style={styles.venueLoc}>{academy.level} • {academy.dist}</Text>
                                        {isBusy && (
                                            <Text style={styles.busyLabel}>Blocked • Next: {nextSlot}</Text>
                                        )}
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
                                    {isBusy && <Ionicons name="time-outline" size={20} color="#94A3B8" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
              ) : (
                <View style={styles.venueRow}>
                  <TouchableOpacity
                    style={[styles.venueBtn, negotiatedVenue === 'opponent' && styles.venueBtnActive]}
                    onPress={() => setNegotiatedVenue('opponent')}
                  >
                    <Ionicons name="business" size={20} color={negotiatedVenue === 'opponent' ? '#6366F1' : '#94A3B8'} />
                    <Text style={[styles.venueText, negotiatedVenue === 'opponent' && styles.venueTextActive]}>{selectedChallenge?.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.venueBtn, negotiatedVenue === 'own' && styles.venueBtnActive]}
                    onPress={() => setNegotiatedVenue('own')}
                  >
                    <Ionicons name="home" size={20} color={negotiatedVenue === 'own' ? '#6366F1' : '#94A3B8'} />
                    <Text style={[styles.venueText, negotiatedVenue === 'own' && styles.venueTextActive]}>Our Academy</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.confirmBtn} onPress={submitCounterProposal}>
                <Text style={styles.confirmBtnText}>Submit Counter proposal</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 24, fontWeight: '900', color: designSystem.colors.primary, marginBottom: 15 },
  tabs: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '600', color: '#666' },
  activeTabText: { color: designSystem.colors.primary },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginTop: 20 },
  detailItem: { width: '45%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 12 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  modalActionRow: { flexDirection: 'row', gap: 12, marginTop: 25 },
  venueSearchContainer: { marginTop: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  venueResults: { maxHeight: 200, marginTop: 12 },
  venueResultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 8 },
  venueResultSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  venueName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  venueLoc: { fontSize: 12, color: '#64748B', marginTop: 2 },
  busyLabel: { fontSize: 11, fontWeight: '700', color: '#EF4444', marginTop: 4 },
  list: { padding: 15 },
  card: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', 
    padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#333' },
  details: { fontSize: 12, color: '#666', marginTop: 2 },
  dist: { fontSize: 11, color: designSystem.colors.primary, marginTop: 4, fontWeight: '600' },
  btn: { backgroundColor: designSystem.colors.primary, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8 },
  btnSent: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tabContent: { flex: 1, padding: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  responseTag: { backgroundColor: '#F0F9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BAE6FD' },
  responseTagText: { fontSize: 9, fontWeight: '900', color: '#0369A1' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: designSystem.colors.primary },
  actionRow: { flexDirection: 'row', gap: 10 },
  smallBtn: { backgroundColor: '#f0f0f0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: '#333' },
  acceptedCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 3 },
  acceptedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  acceptedTime: { fontSize: 12, color: '#666', fontWeight: '600' },
  acceptedTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  acceptedDetail: { fontSize: 13, color: '#666', marginTop: 4 },
  historyCard: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10 
  },
  historyName: { fontSize: 15, fontWeight: '700', color: '#333' },
  historyDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  historyResult: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 15 },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sportTag: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, backgroundColor: '#f0f0f0' },
  sportTagActive: { backgroundColor: designSystem.colors.primary },
  sportTagText: { fontSize: 13, fontWeight: '600', color: '#666' },
  sportTagTextActive: { color: '#fff' },
  confirmBtn: { backgroundColor: designSystem.colors.primary, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 30 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalLabel: { fontSize: 10, fontWeight: '900', color: '#6366F1', letterSpacing: 2, marginBottom: 4 },
  modalClose: { padding: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 25 },
  calendarContainer: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  timeSlots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  slotWrapper: { width: '23%', position: 'relative' },
  slotBtn: { backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 2, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  slotBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  slotText: { fontSize: 11, fontWeight: '900', color: '#64748B', textAlign: 'center' },
  slotTextActive: { color: '#6366F1' },
  subIntervalsPopup: {
    position: 'absolute',
    top: 55,
    left: 0,
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  subBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  subBtnActive: {
    backgroundColor: '#6366F1',
  },
  subBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  subBtnTextActive: {
    color: '#FFF',
  },
  actionBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  venueRow: { flexDirection: 'column', gap: 10 },
  venueBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', gap: 12 },
  venueBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  venueText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  venueTextActive: { color: '#0F172A' }
});
