import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import styles from "./MatchmakingScreen.styles";

export const CounterModal = (props) => {
  const { isCounterModalVisible, setIsCounterModalVisible, selectedChallenge, getOpponentName,
    counterDate, setCounterDate, counterMarkedDates, TIME_SLOTS, counterTime, setCounterTime,
    isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues,
    selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, counterComment, setCounterComment,
    isSubmitting, submitCounterProposal, colors } = props;
  
  return (
      <Modal visible={isCounterModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>COUNTER PROPOSAL</Text>
                <Text style={styles.modalTitle}>{getOpponentName(selectedChallenge)}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCounterModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => { if (expandedSlot) setExpandedSlot(null); }}>
                <Text style={styles.sectionLabel}>Proposed Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   minDate={new Date().toISOString().split('T')[0]}
                   onDayPress={(day) => {
                      setCounterDate(day.dateString);
                    }}
                   markedDates={counterMarkedDates}
                    theme={{ todayTextColor: '#6366F1', selectedDayBackgroundColor: '#6366F1', textDayFontSize: 13 }}
                 />
              </View>

              <Text style={styles.sectionLabel}>Proposed Time</Text>
              <View style={styles.timeSlots}>
                  {TIME_SLOTS.map((slot, index) => {
                    const isBlocked = isTimeSlotBlocked(counterDate, slot, selectedChallenge?.academyId);
                    const isInPast = isTimeInPast(counterDate, slot);
                    const isExpanded = expandedSlot === slot;
                    const slotHour = slot.split(':')[0];
                    const slotAmPm = slot.slice(-2);
                    const isSelBase = counterTime && counterTime.split(':')[0] === slotHour && counterTime.slice(-2) === slotAmPm;
                    
                    return (
                      <TimeSlotItem 
                        key={`slot-counter-${index}`}
                        index={index}
                        slot={slot}
                        isBlocked={isBlocked}
                        isInPast={isInPast}
                        isSelBase={isSelBase}
                        isExpanded={isExpanded}
                        onExpand={setExpandedSlot}
                        onSelect={Object.assign((time) => {
                          setCounterTime(time);
                          setExpandedSlot(null);
                        }, { targetTime: counterTime })}
                        styles={styles}
                      />
                    );
                  })}
              </View>

              <Text style={styles.sectionLabel}>Proposed Venue</Text>
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
                        {MOCK_ACADEMIES.filter(a => {
                          const matchesSearch = a.name.toLowerCase().includes(venueSearchQuery.toLowerCase());
                          const supportsSport = a.managedSports?.includes(selectedChallenge?.sport);
                          return matchesSearch && supportsSport;
                        }).map((academy, index) => {
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
                          placeholder="Search Fetched Venues..."
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
                               const targetSport = (selectedChallenge?.sport || 'All').toLowerCase();
                               const matchesSport = (v.sport?.toLowerCase() || "").includes(targetSport) || v.sport === "" || !v.sport;
                               return matchesSearch && matchesSport;
                            })
                            .slice(0, 15) // Performance: Limit rendered venues
                            .map((venue, idx) => (
                             <VenueItem 
                                key={`venue-counter-${idx}`}
                                venue={venue}
                                isSelected={selectedAcademyForVenue?.venueName === venue.venueName}
                                selectedSport={selectedChallenge?.sport}
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
              )}

              <Text style={styles.sectionLabel}>Comment (Optional)</Text>
              <TextInput
                style={[styles.searchInput, { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#F8FAFC', fontSize: 14, color: '#0F172A' }]}
                placeholder="Add any details or requests for your counter..."
                placeholderTextColor="#94A3B8"
                value={counterComment}
                onChangeText={setCounterComment}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.confirmBtn} onPress={submitCounterProposal}>
                <Text style={styles.confirmBtnText}>Submit Counter proposal</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
  );
};
