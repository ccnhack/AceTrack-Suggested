import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { colors } from '../theme/designSystem';

export const OTPVerificationModal = ({
  showVerifyModal,
  setShowVerifyModal,
  verificationCode,
  setVerificationCode,
  isVerifying,
  setIsVerifying,
  onVerifyAccount,
  onUpdateUser,
  user,
  isNested = false
}) => {
  if (!showVerifyModal) return null;
  
  const otpContent = (
    <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
      <View style={styles.otpModalContent}>
        <View style={styles.otpIconContainer}>
          <Ionicons name={showVerifyModal === 'email' ? "mail-unread" : "chatbubble-ellipses"} size={32} color="#EF4444" />
        </View>
        <Text style={styles.otpTitle}>Verify {showVerifyModal === 'email' ? 'Email' : 'Phone'}</Text>
        <Text style={styles.otpDescription}>
          We've sent a 6-digit verification code to your {showVerifyModal === 'email' ? 'email address' : 'phone number'}.
        </Text>
        
        <TextInput 
          style={styles.otpInput}
          placeholder="123456"
          placeholderTextColor="#CBD5E1"
          maxLength={6}
          keyboardType="number-pad"
          value={verificationCode}
          onChangeText={setVerificationCode}
          autoFocus={true}
          selectionColor="#3B82F6"
        />
        
        <View style={styles.otpActions}>
          <TouchableOpacity 
            style={[styles.otpVerifyBtn, (verificationCode.length !== 6 || isVerifying) && styles.disabledBtn]}
            disabled={verificationCode.length !== 6 || isVerifying}
            onPress={() => {
              setIsVerifying(true);
              // Simulate API call
              setTimeout(() => {
                const type = showVerifyModal;
                if (onVerifyAccount) {
                  onVerifyAccount(type);
                } else {
                  onUpdateUser({
                    ...user,
                    [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true
                  });
                }
                setShowVerifyModal(null);
                setVerificationCode('');
                setIsVerifying(false);
                Alert.alert("Success", `${type === 'email' ? 'Email' : 'Phone'} verified successfully!`);
              }, 1500);
            }}
          >
            <Text style={styles.otpVerifyText}>{isVerifying ? 'Verifying...' : 'Verify'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.otpCancelBtn}
            onPress={() => {
              setShowVerifyModal(null);
              setVerificationCode('');
            }}
          >
            <Text style={styles.otpCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (isNested) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
        {otpContent}
      </View>
    );
  }

  return (
    <Modal visible={!!showVerifyModal} animationType="fade" transparent={true} onRequestClose={() => setShowVerifyModal(null)}>
      {otpContent}
    </Modal>
  );
};

export const CalendarWidget = ({
  isCalendarModalVisible,
  setIsCalendarModalVisible,
  selectedCalendarDate,
  setSelectedCalendarDate,
  currentMonth,
  setCurrentMonth,
  filteredEvents,
  markedDates,
  getCalendarTitle
}) => {
  if (!isCalendarModalVisible) return null;

  return (
    <Modal visible={isCalendarModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsCalendarModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.calendarModalContent}>
          <View style={styles.walletModalHeader}>
            <Text style={styles.walletModalTitle}>Schedule</Text>
            <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)} style={styles.walletModalClose}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <Calendar
            current={currentMonth + '-01'}
            onMonthChange={(month) => {
              setCurrentMonth(month.dateString.substring(0, 7));
              setSelectedCalendarDate(null);
            }}
            onDayPress={(day) => {
              setSelectedCalendarDate(day.dateString === selectedCalendarDate ? null : day.dateString);
            }}
            markedDates={markedDates}
            theme={{
              backgroundColor: '#ffffff',
              calendarBackground: '#ffffff',
              textSectionTitleColor: '#64748B',
              selectedDayBackgroundColor: colors.primary.base,
              selectedDayTextColor: '#ffffff',
              todayTextColor: colors.primary.base,
              dayTextColor: '#0F172A',
              textDisabledColor: '#CBD5E1',
              dotColor: colors.primary.base,
              selectedDotColor: '#ffffff',
              arrowColor: colors.primary.base,
              monthTextColor: '#0F172A',
              textDayFontWeight: '500',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 14,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 12
            }}
          />

          <View style={styles.eventsSection}>
            <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 16 }]}>{getCalendarTitle()}</Text>
            {filteredEvents.length > 0 ? (
              filteredEvents.map(event => (
                <View key={event.id} style={styles.eventCard}>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateDay}>{event.date.split('-')[2]}</Text>
                    <Text style={styles.dateMonth}>
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventSport}>{event.sport}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-clear-outline" size={32} color="#94A3B8" />
                <Text style={styles.emptyStateText}>No events on this date</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  calendarModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
    width: '100%',
  },
  eventsSection: {
    marginTop: 25,
    marginBottom: 10,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 15,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary.base,
  },
  dateMonth: {
    fontSize: 10,
    color: '#64748B',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  eventInfo: {
    paddingLeft: 15,
    justifyContent: 'center',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  eventSport: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateText: {
    color: '#94A3B8',
    marginTop: 10,
    fontSize: 14,
  },
  walletModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walletModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  walletModalClose: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  otpModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 40,
    elevation: 20,
  },
  otpIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  otpTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  otpDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  otpInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 20,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 12,
    textAlign: 'center',
    color: '#0F172A',
    marginBottom: 32,
  },
  otpActions: {
    width: '100%',
    gap: 12,
  },
  otpVerifyBtn: {
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  otpVerifyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  otpCancelBtn: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  otpCancelText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
});
