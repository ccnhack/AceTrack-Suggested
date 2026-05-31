import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import CoachBookingService from '../services/CoachBookingService';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

const PREDEFINED_SLOTS = [
  { startTime: '08:00', endTime: '09:00' },
  { startTime: '09:00', endTime: '10:00' },
  { startTime: '10:00', endTime: '11:00' },
  { startTime: '11:00', endTime: '12:00' },
  { startTime: '12:00', endTime: '13:00' },
  { startTime: '13:00', endTime: '14:00' },
  { startTime: '14:00', endTime: '15:00' },
  { startTime: '15:00', endTime: '16:00' },
  { startTime: '16:00', endTime: '17:00' },
  { startTime: '17:00', endTime: '18:00' },
  { startTime: '18:00', endTime: '19:00' },
  { startTime: '19:00', endTime: '20:00' },
];

export default function CoachAvailabilityManager({ visible, onClose }) {
  const { user } = useAuth();
  const [availability, setAvailability] = useState(user?.availability || []);
  const [selectedDay, setSelectedDay] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSlot = (slot) => {
    const exists = availability.some(
      a => a.dayOfWeek === selectedDay && a.startTime === slot.startTime && a.endTime === slot.endTime
    );

    if (exists) {
      setAvailability(availability.filter(
        a => !(a.dayOfWeek === selectedDay && a.startTime === slot.startTime && a.endTime === slot.endTime)
      ));
    } else {
      setAvailability([...availability, { ...slot, dayOfWeek: selectedDay }]);
    }
  };

  const handleApplyToAllDays = () => {
    const currentDaySlots = availability.filter(a => a.dayOfWeek === selectedDay);
    const newAvailability = [];
    DAYS_OF_WEEK.forEach(day => {
      currentDaySlots.forEach(slot => {
        newAvailability.push({ ...slot, dayOfWeek: day.id });
      });
    });
    setAvailability(newAvailability);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await CoachBookingService.updateCoachAvailability(user.id, availability);
      if (res.success) {
        Alert.alert('Success', 'Availability updated successfully.');
        onClose();
      } else {
        Alert.alert('Error', res.error || 'Failed to update availability.');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const isSlotActive = (slot) => {
    return availability.some(
      a => a.dayOfWeek === selectedDay && a.startTime === slot.startTime && a.endTime === slot.endTime
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Manage Availability</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
              {DAYS_OF_WEEK.map((day) => (
                <TouchableOpacity
                  key={day.id}
                  style={[styles.dayChip, selectedDay === day.id && styles.dayChipActive]}
                  onPress={() => setSelectedDay(day.id)}
                >
                  <Text style={[styles.dayLabel, selectedDay === day.id && styles.dayLabelActive]}>
                    {day.label}
                  </Text>
                  {availability.some(a => a.dayOfWeek === day.id) && (
                    <View style={styles.dotIndicator} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.slotsContainer}>
              <Text style={styles.sectionTitle}>Available Slots for {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label}</Text>
              
              <View style={styles.slotGrid}>
                {PREDEFINED_SLOTS.map((slot, index) => {
                  const active = isSlotActive(slot);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.slotChip, active && styles.slotChipActive]}
                      onPress={() => toggleSlot(slot)}
                    >
                      <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                        {slot.startTime} - {slot.endTime}
                      </Text>
                      {active && (
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={styles.checkIcon} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.applyAllBtn}
              onPress={handleApplyToAllDays}
            >
              <Ionicons name="copy-outline" size={18} color="#6366F1" />
              <Text style={styles.applyAllBtnText}>Apply to All Days</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Availability</Text>
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
    minHeight: '50%',
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
  daysScroll: {
    marginBottom: 24,
  },
  dayChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 70,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dayChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: '#6366F1',
  },
  dayLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayLabelActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  slotsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: '45%',
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
  checkIcon: {
    marginLeft: 8,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  applyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    gap: 8,
  },
  applyAllBtnText: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#334155',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
