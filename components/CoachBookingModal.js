import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import CoachBookingService from '../services/CoachBookingService';

export default function CoachBookingModal({ visible, onClose, coach }) {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate next 7 days
  const nextDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      dateString: d.toISOString().split('T')[0],
      dayOfWeek: d.getDay(),
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    };
  });

  const getAvailableSlotsForDate = (dateInfo) => {
    if (!coach?.availability || coach.availability.length === 0) {
      return []; // Coach hasn't set availability
    }
    // Filter slots matching this dayOfWeek
    const slots = coach.availability.filter(a => a.dayOfWeek === dateInfo.dayOfWeek);
    return slots;
  };

  const handleBookSlot = async () => {
    if (!selectedDate || !selectedSlot) return;

    setIsSubmitting(true);
    try {
      const res = await CoachBookingService.requestBooking(
        coach.id,
        user.id,
        selectedDate.dateString,
        `${selectedSlot.startTime} - ${selectedSlot.endTime}`,
        ''
      );

      if (res.success) {
        Alert.alert("Booking Requested", "Your booking request has been sent to the coach. They will review and confirm it soon.");
        onClose();
      } else {
        Alert.alert("Error", res.error || "Failed to submit booking.");
      }
    } catch (e) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableSlots = selectedDate ? getAvailableSlotsForDate(selectedDate) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Book Session with {coach?.name}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            <Text style={styles.sectionTitle}>Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
              {nextDays.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.dateChip, selectedDate?.dateString === d.dateString && styles.dateChipActive]}
                  onPress={() => {
                    setSelectedDate(d);
                    setSelectedSlot(null);
                  }}
                >
                  <Text style={[styles.dateLabel, selectedDate?.dateString === d.dateString && styles.dateLabelActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {selectedDate && (
              <View style={styles.slotsContainer}>
                <Text style={styles.sectionTitle}>Available Slots</Text>
                {availableSlots.length > 0 ? (
                  <View style={styles.slotGrid}>
                    {availableSlots.map((slot, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.slotChip,
                          selectedSlot === slot && styles.slotChipActive
                        ]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <Text style={[
                          styles.slotLabel,
                          selectedSlot === slot && styles.slotLabelActive
                        ]}>
                          {slot.startTime} - {slot.endTime}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No available slots for this day.</Text>
                )}
              </View>
            )}

            {selectedSlot && (
              <View style={styles.summaryContainer}>
                <Text style={styles.summaryTitle}>Booking Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Coach:</Text>
                  <Text style={styles.summaryValue}>{coach?.name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Date:</Text>
                  <Text style={styles.summaryValue}>{selectedDate.label}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Time:</Text>
                  <Text style={styles.summaryValue}>{selectedSlot.startTime} - {selectedSlot.endTime}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cost:</Text>
                  <Text style={styles.summaryValue}>1 Session Credit</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.bookBtn, (!selectedDate || !selectedSlot || isSubmitting) && styles.bookBtnDisabled]}
              onPress={handleBookSlot}
              disabled={!selectedDate || !selectedSlot || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.bookBtnText}>Confirm Booking Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 24,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  dateScroll: {
    marginBottom: 24,
  },
  dateChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: '#6366F1',
  },
  dateLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  dateLabelActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
  slotsContainer: {
    marginBottom: 24,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slotChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  slotChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  slotLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  slotLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    fontStyle: 'italic',
  },
  summaryContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  summaryTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  summaryValue: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  bookBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  bookBtnDisabled: {
    backgroundColor: '#334155',
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
