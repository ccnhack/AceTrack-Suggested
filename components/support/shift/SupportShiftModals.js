import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Animated, Platform, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, roundToNearest30 } from '../../../hooks/useSupportShift';

const SupportShiftModals = (props) => {
  const { 
    currentUser, showCheckinModal, setShowCheckinModal, shiftCheckinRounded, shiftCheckoutDue,
    checkinLoading, handleCheckin, handleMuteForToday, showResumeLeaveModal, setShowResumeLeaveModal,
    activeLeave, isLateFromLeave, handleCancelShortLeave, shortLeaveLoading, showShortLeaveModal,
    setShowShortLeaveModal, shortLeaveForm, setShortLeaveForm, handleShortLeaveSubmit, showAllLeavesModal,
    setShowAllLeavesModal, upcomingShortLeaves, shiftStyles, showCheckoutBanner, checkoutCountdown, 
    checkoutLoading, handleCheckout, bannerPulse
  } = props;

  const renderResumeLeaveModal = () => {
    if (!showResumeLeaveModal || !activeLeave) return null;
    return (
      <Modal transparent animationType="fade" visible={showResumeLeaveModal} onRequestClose={() => setShowResumeLeaveModal(false)}>
        <View style={shiftStyles.modalOverlay}>
          <View style={shiftStyles.modalCard}>
            <LinearGradient colors={isLateFromLeave ? ['#EF4444', '#B91C1C'] : ['#F59E0B', '#D97706']} style={shiftStyles.modalHeader}>
              <Ionicons name={isLateFromLeave ? "warning-outline" : "time-outline"} size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>Resume Your Shift</Text>
            </LinearGradient>
            <View style={shiftStyles.modalBody}>
              <Text style={[shiftStyles.modalText, { textAlign: 'center', marginBottom: 20 }]}>
                Welcome back! You are currently on a short leave ({activeLeave.startTime} - {activeLeave.endTime}).
                {isLateFromLeave ? " Your leave is currently overdue." : " Are you ready to resume your shift early?"}
              </Text>
              
              <TouchableOpacity 
                style={[shiftStyles.checkinBtn, { marginBottom: 12 }]}
                onPress={() => {
                  setShowResumeLeaveModal(false);
                  handleCancelShortLeave(activeLeave.id, true);
                }}
                disabled={shortLeaveLoading}
              >
                <LinearGradient colors={['#10B981', '#059669']} style={shiftStyles.checkinBtnGradient}>
                  <Ionicons name="play-circle-outline" size={22} color="#FFF" />
                  <Text style={shiftStyles.checkinBtnText}>{shortLeaveLoading ? 'Resuming...' : 'Yes, Resume Shift Now'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[shiftStyles.muteBtn, { marginTop: 0 }]}
                onPress={() => setShowResumeLeaveModal(false)}
              >
                <Text style={shiftStyles.muteBtnText}>Not Yet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderCheckinModal = () => {
    if (!showCheckinModal || !currentUser || currentUser.role !== 'support') return null;
    const now = new Date();
    const rounded = roundToNearest30(now);
    const checkoutDuePreview = new Date(rounded.getTime() + 8 * 60 * 60 * 1000);

    return (
      <Modal transparent animationType="fade" visible={showCheckinModal}>
        <View style={shiftStyles.modalOverlay}>
          <View style={shiftStyles.modalCard}>
            <LinearGradient colors={['#6366F1', '#4F46E5']} style={shiftStyles.modalHeader}>
              <Ionicons name="time-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening'}!</Text>
              <Text style={shiftStyles.modalSubtitle}>Ready to start your shift?</Text>
            </LinearGradient>

            <View style={shiftStyles.modalBody}>
              <View style={shiftStyles.timeRow}>
                <View style={shiftStyles.timeBlock}>
                  <Text style={shiftStyles.timeLabel}>Current Time</Text>
                  <Text style={shiftStyles.timeValue}>{formatTime(now)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#94A3B8" />
                <View style={shiftStyles.timeBlock}>
                  <Text style={shiftStyles.timeLabel}>Check-In As</Text>
                  <Text style={[shiftStyles.timeValue, { color: '#6366F1' }]}>{formatTime(rounded)}</Text>
                </View>
              </View>

              <View style={shiftStyles.shiftInfoRow}>
                <Ionicons name="briefcase-outline" size={16} color="#64748B" />
                <Text style={shiftStyles.shiftInfoText}>8-hour shift · Checkout due by {formatTime(checkoutDuePreview)}</Text>
              </View>

              <TouchableOpacity style={shiftStyles.checkinBtn} onPress={handleCheckin} disabled={checkinLoading}>
                <LinearGradient colors={['#10B981', '#059669']} style={shiftStyles.checkinBtnGradient}>
                  <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                  <Text style={shiftStyles.checkinBtnText}>{checkinLoading ? 'Checking in...' : 'Check In Now'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={shiftStyles.notNowBtn} onPress={() => setShowCheckinModal(false)}>
                <Text style={shiftStyles.notNowText}>Not Now</Text>
              </TouchableOpacity>

              <TouchableOpacity style={shiftStyles.muteBtn} onPress={handleMuteForToday}>
                <Ionicons name="notifications-off-outline" size={14} color="#94A3B8" />
                <Text style={shiftStyles.muteText}>Mute for Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderShortLeaveModal = () => {
    if (!showShortLeaveModal) return null;
    return (
      <Modal transparent animationType="fade" visible={showShortLeaveModal} onRequestClose={() => setShowShortLeaveModal(false)}>
        <View style={shiftStyles.modalOverlay}>
          <View style={shiftStyles.modalCard}>
            <LinearGradient colors={['#F59E0B', '#D97706']} style={shiftStyles.modalHeader}>
              <Ionicons name="cafe-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>Request Short Leave</Text>
            </LinearGradient>
            <View style={shiftStyles.modalBody}>
              {Platform.OS === 'web' ? (
                <View>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Date</Text>
                  <input type="date" value={shortLeaveForm.date} onChange={e => setShortLeaveForm({...shortLeaveForm, date: e.target.value})} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', width: '100%', marginBottom: 16 }} />
                  <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                    <View style={{ flex: 1 }}><Text style={{ fontSize: 11, color: '#64748B' }}>Start</Text><input type="time" value={shortLeaveForm.startTime} onChange={e => setShortLeaveForm({...shortLeaveForm, startTime: e.target.value})} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', width: '100%' }} /></View>
                    <View style={{ flex: 1 }}><Text style={{ fontSize: 11, color: '#64748B' }}>End</Text><input type="time" value={shortLeaveForm.endTime} onChange={e => setShortLeaveForm({...shortLeaveForm, endTime: e.target.value})} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', width: '100%' }} /></View>
                  </View>
                </View>
              ) : (
                <View>
                  <TextInput style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }} placeholder="Date YYYY-MM-DD" value={shortLeaveForm.date} onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, date: val }))} />
                  <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                    <TextInput style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }} placeholder="Start HH:MM" value={shortLeaveForm.startTime} onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, startTime: val }))} />
                    <TextInput style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }} placeholder="End HH:MM" value={shortLeaveForm.endTime} onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, endTime: val }))} />
                  </View>
                </View>
              )}
              <TextInput style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', height: 100, marginBottom: 20 }} placeholder="Reason for leave..." multiline value={shortLeaveForm.reason} onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, reason: val }))} />
              
              <TouchableOpacity style={shiftStyles.checkinBtn} onPress={handleShortLeaveSubmit} disabled={shortLeaveLoading}>
                <LinearGradient colors={['#10B981', '#059669']} style={shiftStyles.checkinBtnGradient}>
                  <Text style={shiftStyles.checkinBtnText}>{shortLeaveLoading ? 'Submitting...' : 'Submit Request'}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={shiftStyles.notNowBtn} onPress={() => setShowShortLeaveModal(false)}>
                <Text style={shiftStyles.notNowText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAllLeavesModal = () => {
    if (!showAllLeavesModal) return null;
    return (
      <Modal transparent animationType="fade" visible={showAllLeavesModal} onRequestClose={() => setShowAllLeavesModal(false)}>
        <View style={shiftStyles.modalOverlay}>
          <View style={[shiftStyles.modalCard, { maxHeight: '80%' }]}>
            <LinearGradient colors={['#3B82F6', '#2563EB']} style={shiftStyles.modalHeader}>
              <Ionicons name="list-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>My Leaves</Text>
            </LinearGradient>
            <View style={shiftStyles.modalBody}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {upcomingShortLeaves.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: '#64748B', padding: 20 }}>No leave requests found.</Text>
                ) : (
                  upcomingShortLeaves.map((leave, idx) => (
                    <View key={idx} style={{ backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>{leave.date} ({leave.startTime} - {leave.endTime})</Text>
                      <Text style={{ fontSize: 13, color: '#475569', fontStyle: 'italic', marginBottom: 8 }}>"{leave.reason}"</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: leave.status === 'approved' ? '#10B981' : leave.status === 'pending' ? '#F59E0B' : '#64748B' }}>{leave.status.toUpperCase()}</Text>
                        {(leave.status === 'pending' || leave.status === 'approved') && (
                          <TouchableOpacity onPress={() => handleCancelShortLeave(leave.id)} disabled={shortLeaveLoading} style={{ padding: 6 }}>
                            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const bannerBgColor = bannerPulse ? bannerPulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(245, 158, 11, 0.12)', 'rgba(245, 158, 11, 0.22)'] }) : 'rgba(245, 158, 11, 0.12)';

  const renderCheckoutBanner = () => {
    if (!showCheckoutBanner) return null;
    return (
      <Animated.View style={[shiftStyles.checkoutBanner, { backgroundColor: bannerBgColor }]}>
        <View style={shiftStyles.checkoutBannerContent}>
          <View style={shiftStyles.checkoutBannerLeft}>
            <View style={shiftStyles.checkoutIconCircle}>
              <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={shiftStyles.checkoutTitle}>{checkoutCountdown}</Text>
            </View>
          </View>
          <View style={shiftStyles.checkoutActions}>
            <TouchableOpacity style={shiftStyles.checkoutBtn} onPress={() => handleCheckout(false)} disabled={checkoutLoading}>
              <Ionicons name="log-out-outline" size={14} color="#FFF" />
              <Text style={shiftStyles.checkoutBtnText}>{checkoutLoading ? '...' : 'Check Out'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <>
      {renderCheckinModal()}
      {renderResumeLeaveModal()}
      {renderShortLeaveModal()}
      {renderAllLeavesModal()}
      {renderCheckoutBanner()}
    </>
  );
};

export default SupportShiftModals;
