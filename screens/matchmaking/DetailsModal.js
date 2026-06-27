import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from '../../components/SafeAvatar';
import styles from "./MatchmakingScreen.styles";

export const DetailsModal = (props) => {
  const { 
    isDetailsModalVisible, setIsDetailsModalVisible, selectedChallenge, getOpponentName, getOpponentStats,
    getTournamentDetails, user, handleAcceptChallenge, handleAcceptCountered, handleCounter, handleDeclineChallenge, 
    handleCancelChallenge, setReportScoreMatch, colors, role, receivedRequests, sentRequests, handleConfirmBooking 
  } = props;
  return (
      <Modal visible={isDetailsModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 'auto', paddingBottom: 40 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>{role === 'coach' ? 'BOOKING DETAILS' : 'CHALLENGE DETAILS'}</Text>
                <Text style={styles.modalTitle}>{getOpponentName(selectedChallenge)}</Text>
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
                                        {selectedChallenge?.userResponseStatus === 'Accepted' ? 'Response Status' : "Opponent's Preferred Slot"}
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
                            <>
                                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, marginTop: 10 }]}>
                                    <Ionicons name="calendar-outline" size={20} color="#D97706" />
                                    <View>
                                        <Text style={[styles.detailLabel, { color: '#D97706' }]}>Original Challenger's Slot</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedChallenge.originalChallengerDate || selectedChallenge.proposedDate} at {selectedChallenge.originalChallengerTime || selectedChallenge.proposedTime}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F0FDF4', borderColor: '#22C55E', borderWidth: 1, marginTop: 10 }]}>
                                    <Ionicons name="send-outline" size={20} color="#16A34A" />
                                    <View>
                                        <Text style={[styles.detailLabel, { color: '#16A34A' }]}>Your Last Counter</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedChallenge.myCounterDate || selectedChallenge.proposedDate} at {selectedChallenge.myCounterTime || selectedChallenge.proposedTime} • {selectedChallenge.location}
                                        </Text>
                                    </View>
                                </View>
                                {selectedChallenge.counterComment && (
                                    <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderWidth: 1, marginTop: 10 }]}>
                                        <Ionicons name="chatbox-outline" size={20} color="#64748B" />
                                        <View>
                                            <Text style={[styles.detailLabel, { color: '#64748B' }]}>Counter Note</Text>
                                            <Text style={styles.detailValue}>{selectedChallenge.counterComment}</Text>
                                        </View>
                                    </View>
                                )}
                            </>
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
              {role !== 'coach' && sentRequests.some(r => r.id === selectedChallenge?.id && r.status === 'Countered') && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => {
                      handleAcceptCountered(selectedChallenge);
                      setIsDetailsModalVisible(false);
                    }}
                  >
                    <Text style={styles.actionBtnText}>Accept Match</Text>
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
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => setReportScoreMatch(selectedChallenge)}
                  >
                    <Text style={styles.actionBtnText}>Report Score</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' }]}
                    onPress={() => handleCancelBooking(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedChallenge?.status === 'Completed' && (
                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F0FDF4' }]}>
                   <Ionicons name="checkmark-done-circle" size={24} color="#16A34A" />
                   <View>
                     <Text style={[styles.detailLabel, { color: '#16A34A' }]}>Final Result</Text>
                     <Text style={styles.detailValue}>{selectedChallenge.resultText}</Text>
                   </View>
                </View>
              )}
            </View>

            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginTop: 10 }]} onPress={() => setIsDetailsModalVisible(false)}>
              <Text style={[styles.confirmBtnText, { color: '#64748B' }]}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
  );
};
