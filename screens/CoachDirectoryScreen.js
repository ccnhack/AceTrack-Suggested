import React, { useState, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  Image, Modal, Alert, ScrollView, TextInput, SafeAreaView, Platform, LayoutAnimation
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import SafeAvatar from '../components/SafeAvatar';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { Calendar } from 'react-native-calendars';

import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';

export default function CoachDirectoryScreen({ navigation }) {
  const { currentUser: user, userRole: role, onUpdateUser } = useAuth();
  const { players, sendUserNotification } = usePlayers();
  const [search, setSearch] = useState('');
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState(null);
  const [expandedSlot, setExpandedSlot] = useState(null);
  
  const filteredCoaches = useMemo(() => {
    return (players || []).filter(p => p && p.role === 'coach')
      .filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()) || 
                   p.managedSports?.some(s => s.toLowerCase().includes(search.toLowerCase())));
  }, [players, search]);

  const handleBook = (coach) => {
    setSelectedCoach(coach);
    setSelectedDate('');
    setSelectedTime(null);
    setBookingModalVisible(true);
  };

  const confirmBookingRequest = () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert("Selection Required", "Please choose both a date and a time slot.");
      return;
    }

    const newBooking = {
      id: `book_${Date.now()}`,
      coachId: selectedCoach.id,
      coachName: selectedCoach.name,
      userId: user.id,
      userName: user.name,
      date: selectedDate,
      time: selectedTime,
      status: 'Requested', // Requested -> Confirmed -> Pending Payment -> Paid
      createdAt: new Date().toISOString()
    };

    const updatedUser = {
      ...user,
      bookings: [...(user.bookings || []), newBooking]
    };

    if (onUpdateUser) {
      onUpdateUser(updatedUser);
      
      // Send Notification to Coach
      if (sendUserNotification) {
        sendUserNotification(selectedCoach.id, {
          type: 'booking',
          title: 'New Booking Request',
          message: `${user.name} has requested a session on ${selectedDate} at ${selectedTime}.`,
        });
      }

      Alert.alert("Request Sent", `Booking request sent to ${selectedCoach.name}. You will be notified of the confirmation.`);
    }
    setBookingModalVisible(false);
  };

  const handleUpdateBookingStatus = (bookingId, newStatus) => {
    const updatedUser = {
      ...user,
      bookings: (user.bookings || []).map(b => b.id === bookingId ? { ...b, status: newStatus } : b)
    };
    if (onUpdateUser) {
      onUpdateUser(updatedUser);
      
      // Find the booking to get the userId for notification
      const booking = (user.bookings || []).find(b => b.id === bookingId);
      if (booking && sendUserNotification) {
        sendUserNotification(booking.userId, {
          type: 'booking',
          title: `Booking ${newStatus}`,
          message: `Your booking with ${user.name} for ${booking.date} has been ${newStatus.toLowerCase()}.`,
        });
      }
    }
  };

  const renderCoachCard = useCallback(({ item }) => (
    <TouchableOpacity style={styles.coachCard} onPress={() => handleBook(item)}>
      <SafeAvatar 
        uri={item.avatar} 
        name={item.name} 
        role={item.role} 
        size={64} 
        borderRadius={16} 
        style={styles.coachAvatar} 
      />
      <View style={styles.coachInfo}>
        <View style={styles.nameHeader}>
          <Text style={styles.coachName}>{item.name}</Text>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#F59E0B" />
            <Text style={styles.ratingText}>4.9</Text>
          </View>
        </View>
        <Text style={styles.specialties}>
          {item.managedSports?.join(' • ') || 'Multi-sport'} Specialist
        </Text>
        <View style={styles.experienceRow}>
           <Ionicons name="ribbon-outline" size={12} color="#6366F1" />
           <Text style={styles.expText}>8+ Years Experience</Text>
        </View>
      </View>
      <View style={styles.priceTag}>
        <Text style={styles.priceAmount}>₹1200</Text>
        <Text style={styles.priceUnit}>/HOUR</Text>
      </View>
    </TouchableOpacity>
  ), [handleBook]);

  const keyExtractor = useCallback(item => item.id, []);
  
  const getItemLayout = useCallback((data, index) => ({
    length: 112,
    offset: 112 * index,
    index,
  }), []);

  const renderDashboardBooking = (booking) => (
    <View key={booking.id} style={styles.dashboardCard}>
       <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{booking.userName || booking.coachName}</Text>
            <Text style={styles.cardDate}>{booking.date} @ {booking.time}</Text>
          </View>
          <View style={[styles.statusTag, 
            booking.status === 'Requested' && { backgroundColor: '#FEF3C7' },
            booking.status === 'Confirmed' && { backgroundColor: '#DCFCE7' },
            booking.status === 'Pending Payment' && { backgroundColor: '#FFEDD5' },
          ]}>
            <Text style={[styles.statusTagText,
              booking.status === 'Requested' && { color: '#D97706' },
              booking.status === 'Confirmed' && { color: '#16A34A' },
              booking.status === 'Pending Payment' && { color: '#EA580C' },
            ]}>{booking.status}</Text>
          </View>
       </View>
       
       {role === 'coach' && booking.status === 'Requested' && (
         <View style={styles.actionRow}>
           <TouchableOpacity 
             style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
             onPress={() => handleUpdateBookingStatus(booking.id, 'Confirmed')}
           >
             <Text style={styles.actionBtnText}>Confirm</Text>
           </TouchableOpacity>
           <TouchableOpacity 
             style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
             onPress={() => handleUpdateBookingStatus(booking.id, 'Declined')}
           >
             <Text style={styles.actionBtnText}>Decline</Text>
           </TouchableOpacity>
         </View>
       )}

       {role === 'user' && booking.status === 'Confirmed' && (
         <TouchableOpacity 
           style={styles.payBtn}
           onPress={() => handleUpdateBookingStatus(booking.id, 'Paid')}
         >
           <Text style={styles.payBtnText}>Pay & Finalize</Text>
         </TouchableOpacity>
       )}
    </View>
  );

  if (role === 'coach') {
    const coachBookings = (players || []).flatMap(p => p.bookings || []).filter(b => b.coachId === user.id);
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Management Hub</Text>
          <Text style={styles.pageSubtitle}>Track student bookings and schedule</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.statsGrid}>
             <View style={styles.statBox}>
               <Text style={styles.statNum}>{coachBookings.filter(b => b.status === 'Requested').length}</Text>
               <Text style={styles.statLab}>Requests</Text>
             </View>
             <View style={styles.statBox}>
               <Text style={styles.statNum}>{coachBookings.filter(b => b.status === 'Confirmed' || b.status === 'Paid').length}</Text>
               <Text style={styles.statLab}>Active Students</Text>
             </View>
          </View>

          <Text style={styles.sectionTitle}>Booking Requests</Text>
          {coachBookings.length > 0 ? (
            coachBookings.map(renderDashboardBooking)
          ) : (
            <Text style={styles.emptyText}>No pending requests at the moment.</Text>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Schedule Lock</Text>
          <View style={styles.calendarContainer}>
            <Calendar 
              markedDates={user.blockedDates || {}}
              onDayPress={(day) => {
                const dateStr = day.dateString;
                const isBlocked = user.blockedDates?.[dateStr];
                const updatedUser = {
                  ...user,
                  blockedDates: {
                    ...(user.blockedDates || {}),
                    [dateStr]: isBlocked ? null : { selected: true, marked: true, selectedColor: '#EF4444' }
                  }
                };
                if (onUpdateUser) onUpdateUser(updatedUser);
              }}
              theme={{
                 todayTextColor: '#6366F1',
                 selectedDayBackgroundColor: '#6366F1',
                 arrowColor: '#6366F1',
              }}
            />
            <Text style={styles.calendarHint}>Tap a date to block/unblock it for new bookings.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient 
        colors={[colors.primary.base, colors.primary.dark]} 
        style={styles.pageHeader}
      >
        <Text style={[styles.pageTitle, { color: '#FFFFFF' }]}>Coach Discovery</Text>
        <Text style={[styles.pageSubtitle, { color: 'rgba(255,255,255,0.8)' }]}>Expert guidance for your sporting career</Text>
        
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.navy[400]} />
          <TextInput 
            placeholder="Search by name or sport..."
            placeholderTextColor={colors.navy[400]}
            style={styles.searchInput}
            value={search}
            onChangeText={(txt) => {
                if (Platform.OS !== 'web' && txt.length === 1) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearch(txt);
            }}
          />
        </View>
      </LinearGradient>

      <FlashList 
        data={filteredCoaches}
        renderItem={renderCoachCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.coachList}
        getItemLayout={getItemLayout}
        estimatedItemSize={112}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <Ionicons name="people-outline" size={60} color="#E2E8F0" />
            <Text style={styles.emptyText}>No coaches matching your criteria.</Text>
          </View>
        }
      />

      {/* Booking Modal */}
      <Modal visible={bookingModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>BOOKING REQUEST</Text>
                <Text style={styles.modalTitle}>{selectedCoach?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setBookingModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.calendarBox}>
                 <Text style={styles.calLabel}>Select Preferred Date</Text>
                 <Calendar 
                   onDayPress={(day) => setSelectedDate(day.dateString)}
                   markedDates={{
                     ...(selectedCoach?.blockedDates || {}),
                     [selectedDate]: { selected: true, selectedColor: '#6366F1' }
                   }}
                   theme={{
                     todayTextColor: '#6366F1',
                     selectedDayBackgroundColor: '#6366F1',
                   }}
                 />
              </View>

              <Text style={styles.calLabel}>Select Time Slot</Text>
              <View style={styles.timeSlots}>
                 {['09:00 AM', '10:00 AM', '11:00 AM', '04:00 PM', '05:00 PM', '06:00 PM'].map((slot, index) => {
                   const isExpanded = expandedSlot === slot;
                   const slotHour = slot.split(':')[0];
                   const slotAmPm = slot.slice(-2);
                   const isSelBase = selectedTime && selectedTime.split(':')[0] === slotHour && selectedTime.slice(-2) === slotAmPm;

                   return (
                     <View key={`slot-${index}`} style={[styles.slotWrapper, { zIndex: isExpanded ? 100 : 1 }]}>
                       <TouchableOpacity 
                         style={[styles.slotBtn, isSelBase && styles.slotBtnActive]}
                         onPress={() => setExpandedSlot(isExpanded ? null : slot)}
                       >
                         <Text style={[styles.slotText, isSelBase && styles.slotTextActive]}>
                           {isSelBase ? selectedTime : slot}
                         </Text>
                       </TouchableOpacity>

                       {isExpanded && (
                         <View style={styles.subIntervalsPopup}>
                           {[':00', ':15', ':30', ':45'].map((mins, subIndex) => {
                             const fullTime = slot.replace(':00', mins);
                             const isSel = selectedTime === fullTime;
                             return (
                               <TouchableOpacity 
                                 key={`sub-${subIndex}`}
                                 style={[styles.subBtn, isSel && styles.subBtnActive]}
                                 onPress={() => {
                                   setSelectedTime(fullTime);
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

              <TouchableOpacity style={styles.confirmBtn} onPress={confirmBookingRequest}>
                <Text style={styles.confirmBtnText}>Request Booking</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.disclaimer}>No payment required at this stage.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  pageHeader: { padding: 24, paddingBottom: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, ...shadows.md },
  pageTitle: { ...typography.h1, textTransform: 'uppercase' },
  pageSubtitle: { fontSize: 13, marginTop: 4, fontWeight: '600' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, marginTop: 20, ...shadows.sm },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 14, color: colors.navy[900], fontWeight: '600', marginLeft: 10 },
  coachList: { padding: 20 },
  coachCard: { 
    flexDirection: 'row', 
    backgroundColor: '#FFFFFF', 
    borderRadius: borderRadius.xl, 
    padding: 16, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: colors.navy[100], 
    alignItems: 'center',
    ...shadows.sm 
  },
  coachAvatar: { width: 64, height: 64, borderRadius: 16 },
  coachInfo: { flex: 1, marginLeft: 16 },
  nameHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  coachName: { ...typography.h3, color: colors.navy[900] },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, gap: 4 },
  ratingText: { fontSize: 10, fontWeight: '900', color: '#D97706' },
  specialties: { fontSize: 12, color: colors.navy[500], fontWeight: '700', marginBottom: 6 },
  experienceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expText: { fontSize: 11, color: colors.primary.base, fontWeight: '800' },
  priceTag: { alignItems: 'flex-end', marginLeft: 10 },
  priceAmount: { fontSize: 16, fontWeight: '900', color: colors.navy[900] },
  priceUnit: { fontSize: 8, fontWeight: '900', color: colors.navy[400] },
  emptyView: { flex: 1, alignItems: 'center', marginTop: 100 },
  emptyText: { color: colors.navy[400], fontSize: 14, fontWeight: '700', marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: colors.navy[900] + 'B3', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, height: '90%', padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalLabel: { ...typography.micro, color: colors.primary.base },
  modalTitle: { ...typography.h2, color: colors.navy[900], marginTop: 4 },
  modalClose: { padding: 4 },
  calendarBox: { marginBottom: 24 },
  calLabel: { ...typography.micro, color: colors.navy[400], marginBottom: 12 },
  timeSlots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  slotWrapper: { width: '31%', position: 'relative' },
  slotBtn: { backgroundColor: colors.navy[100], paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, width: '100%', alignItems: 'center' },
  slotBtnActive: { backgroundColor: '#EEF2FF', borderColor: colors.primary.base, borderWidth: 1 },
  slotText: { fontSize: 12, fontWeight: '900', color: colors.navy[500] },
  slotTextActive: { color: colors.primary.base },
  subIntervalsPopup: {
    position: 'absolute',
    top: 55,
    left: 0,
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    ...shadows.lg,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: colors.navy[100],
  },
  subBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: colors.navy[50],
    alignItems: 'center',
  },
  subBtnActive: {
    backgroundColor: colors.primary.base,
  },
  subBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy[500],
  },
  subBtnTextActive: {
    color: '#FFF',
  },
  confirmBtn: { backgroundColor: colors.navy[900], paddingVertical: 18, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...shadows.md },
  confirmBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textTransform: 'uppercase' },
  disclaimer: { textAlign: 'center', color: colors.navy[400], fontSize: 11, marginTop: 12, fontWeight: '600' },
  content: { flex: 1, padding: 24 },
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 30 },
  statBox: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, borderRadius: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.navy[100] },
  statNum: { ...typography.h2, color: colors.navy[900] },
  statLab: { ...typography.micro, color: colors.navy[500], marginTop: 4 },
  sectionTitle: { ...typography.h3, color: colors.navy[900], textTransform: 'uppercase', marginBottom: 16 },
  dashboardCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.navy[100] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { ...typography.h3, color: colors.navy[900] },
  cardDate: { fontSize: 12, color: colors.navy[500], fontWeight: '700', marginTop: 2 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusTagText: { ...typography.micro, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  payBtn: { backgroundColor: colors.primary.base, paddingVertical: 14, borderRadius: 16, alignItems: 'center', marginTop: 15 },
  payBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  calendarContainer: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', padding: 10, borderWidth: 1, borderColor: colors.navy[100] },
  calendarHint: { textAlign: 'center', fontSize: 11, color: colors.navy[500], fontWeight: '600', padding: 10 }
});
