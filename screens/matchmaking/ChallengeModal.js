import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import styles from "./MatchmakingScreen.styles";
import { Sport } from '../../types';
import { TimeSlotItem, VenueItem } from '../../components/MatchmakingSubComponents';

export const ChallengeModal = (props) => {
  const { 
    isChallengeModalVisible, setIsChallengeModalVisible, selectedOpponent, selectedSport, setSelectedSport, 
    challengeDate, setChallengeDate, challengeMarkedDates, TIME_SLOTS, challengeTime, setChallengeTime, 
    isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues, 
    selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, isSubmitting, confirmChallenge, colors,
    expandedSlot, setExpandedSlot, getCommonSports, getUserPreferredSport, isTimeInPast, 
    venueDropdownSearchQuery, setVenueDropdownSearchQuery, matchmaking, user, role, getOpponentName
  } = props;
  
  return (
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
              <Pressable onPress={() => { if (expandedSlot) setExpandedSlot(null); }}>
                <Text style={styles.sectionLabel}>Select Sport</Text>
              <View style={styles.sportGrid}>
                {selectedOpponent && getCommonSports(selectedOpponent).map((s, index) => {
                  const isPreferred = s === getUserPreferredSport();
                  return (
                    <TouchableOpacity
                      key={`sport-${index}`}
                      style={[styles.sportTag, selectedSport === s && styles.sportTagActive]}
                      onPress={() => setSelectedSport(s)}
                    >
                      <Text style={[styles.sportTagText, selectedSport === s && styles.sportTagTextActive]}>
                        {s} {isPreferred ? '⭐' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Select Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   minDate={new Date().toISOString().split('T')[0]}
                   onDayPress={(day) => {
                      setChallengeDate(day.dateString);
                    }}
                   markedDates={challengeMarkedDates}
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
                  {TIME_SLOTS.map((slot, index) => {
                    const isBlocked = isTimeSlotBlocked(challengeDate, slot, selectedOpponent?.id);
                    const isInPast = isTimeInPast(challengeDate, slot);
                    const isExpanded = expandedSlot === slot;
                    const slotHour = slot.split(':')[0];
                    const slotAmPm = slot.slice(-2);
                    const isSelBase = challengeTime && challengeTime.split(':')[0] === slotHour && challengeTime.slice(-2) === slotAmPm;
                    
                    return (
                      <TimeSlotItem 
                        key={`slot-challenge-${index}`}
                        index={index}
                        slot={slot}
                        isBlocked={isBlocked}
                        isInPast={isInPast}
                        isSelBase={isSelBase}
                        isExpanded={isExpanded}
                        onExpand={setExpandedSlot}
                        onSelect={Object.assign((time) => {
                          setChallengeTime(time);
                          setExpandedSlot(null);
                        }, { targetTime: challengeTime })}
                        styles={styles}
                      />
                    );
                  })}
              </View>

              <Text style={styles.sectionLabel}>Proposed Venue</Text>
              <View style={styles.venueSection}>
                {isFetchingVenues ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Fetching Nearby Venues...</Text>
                  </View>
                ) : nearbyVenues.length > 0 ? (
                  <View style={styles.venueDropdownContainer}>
                     <View style={styles.venueDropdownSearchBox}>
                       <Ionicons name="search" size={16} color="#94A3B8" />
                       <TextInput 
                         style={styles.venueDropdownSearchInput}
                         placeholder="Search fetched venues..."
                         value={venueDropdownSearchQuery}
                         onChangeText={setVenueDropdownSearchQuery}
                         placeholderTextColor="#94A3B8"
                       />
                       {venueDropdownSearchQuery !== '' && (
                         <TouchableOpacity onPress={() => setVenueDropdownSearchQuery('')}>
                           <Ionicons name="close-circle" size={16} color="#94A3B8" />
                         </TouchableOpacity>
                       )}
                     </View>
                     <ScrollView style={[styles.venueList, { height: 200 }]} nestedScrollEnabled={true}>
                        {nearbyVenues
                            .filter(v => {
                               const q = (venueDropdownSearchQuery || "").toLowerCase();
                               const matchesSearch = (v.venueName?.toLowerCase() || "").includes(q) || 
                                                    (v.area?.toLowerCase() || "").includes(q) || 
                                                    (v.sport?.toLowerCase() || "").includes(q);
                               
                               const targetSport = (selectedSport || 'All').toLowerCase();
                               const matchesSport = (v.sport?.toLowerCase() || "").includes(targetSport) || v.sport === "" || !v.sport;
                               
                               return matchesSearch && matchesSport;
                            })
                          .slice(0, 15) // Performance: Limit rendered venues
                          .map((venue, idx) => (
                            <VenueItem 
                              key={`venue-${idx}`}
                              venue={venue}
                              isSelected={selectedAcademyForVenue?.venueName === venue.venueName}
                              selectedSport={selectedSport}
                              onSelect={setSelectedAcademyForVenue}
                              styles={styles}
                            />
                        ))}
                     </ScrollView>
                  </View>
                ) : (
                  <View style={styles.emptyVenueContainer}>
                    <Text style={styles.emptyVenueText}>No Local Venues Found Matching Your Search</Text>
                  </View>
                )}
              </View>

              <View style={styles.upcomingChallengesSection}>
                <Text style={styles.sectionLabel}>Upcoming Challenges</Text>
                {matchmaking.filter(m => {
                  const mDate = m.proposedDate || m.time?.split(',')[0]?.trim();
                  const mTime = m.proposedTime || m.time?.split(',')[1]?.trim();
                  return ((m.senderId === user?.id && m.receiverId === selectedOpponent?.id) ||
                         (m.senderId === selectedOpponent?.id && m.receiverId === user?.id)) &&
                        (m.status === 'Pending' || m.status === 'Accepted') &&
                        (!challengeDate || mDate === challengeDate) &&
                        !isTimeInPast(mDate, mTime);
                }).length === 0 ? (
                  <Text style={styles.emptyUpcomingText}>
                    {challengeDate ? `No Challenges For ${challengeDate}` : 'No Upcoming Challenges With This Player'}
                  </Text>
                ) : (
                  matchmaking.filter(m => {
                    const mDate = m.proposedDate || m.time?.split(',')[0]?.trim();
                    const mTime = m.proposedTime || m.time?.split(',')[1]?.trim();
                    return ((m.senderId === user?.id && m.receiverId === selectedOpponent?.id) ||
                           (m.senderId === selectedOpponent?.id && m.receiverId === user?.id)) &&
                          (m.status === 'Pending' || m.status === 'Accepted') &&
                          (!challengeDate || mDate === challengeDate) &&
                          !isTimeInPast(mDate, mTime);
                  }).sort((a, b) => new Date(a.proposedDate || a.time?.split(',')[0]) - new Date(b.proposedDate || b.time?.split(',')[0]))
                   .map((m, idx) => (
                    <View key={`upcoming-${idx}`} style={styles.upcomingChallengeRow}>
                      <View style={styles.challengeMeta}>
                        <Text style={styles.challengeTimeText}>
                          {m.proposedTime || m.time?.split(',')[1]?.trim() || 'TBD'}
                        </Text>
                        <Text style={styles.challengeDateText}>
                          {m.proposedDate || m.time?.split(',')[0]?.trim()}
                        </Text>
                      </View>
                      <View style={styles.challengeInfoMain}>
                        <View>
                          <Text style={styles.challengeOpponentText}>{role === 'coach' ? 'Booked by ' : 'vs '}{getOpponentName(m)}</Text>
                          <Text style={styles.challengeSportText}>{m.sport}</Text>
                        </View>
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: m.status === 'Accepted' ? '#DCFCE7' : '#FEF3C7' }
                        ]}>
                          <Text style={[
                            styles.statusBadgeText, 
                            { color: m.status === 'Accepted' ? '#16A34A' : '#D97706' }
                          ]}>{m.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <TouchableOpacity 
                testID="matchmaking.challenge.submit"
                style={styles.confirmBtn} 
                onPress={confirmChallenge}
              >
                <Text style={styles.confirmBtnText}>Send Challenge Request</Text>
                <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 10 }} />
              </TouchableOpacity>
              <View style={{ height: 40 }} />
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
  );
};
