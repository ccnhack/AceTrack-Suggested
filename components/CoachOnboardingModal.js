import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, Modal, 
  TextInput, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CoachOnboardingModal = ({ user, academies, onComplete, isEditMode, onClose }) => {
  const [isActiveCoach, setIsActiveCoach] = useState(user.academyId ? 'yes' : (isEditMode ? 'no' : null));
  const [selectedAcademyId, setSelectedAcademyId] = useState(user.academyId || '');
  const [showAcademyPicker, setShowAcademyPicker] = useState(false);
  
  // New Academy Details
  const [academyName, setAcademyName] = useState('');
  const [location, setLocation] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = () => {
    if (isActiveCoach === 'no') {
      onComplete(null);
      return;
    }
    
    if (selectedAcademyId === 'other') {
      onComplete('other', {
        name: academyName,
        location: location,
        pincode: pincode,
        phone: phone,
      });
    } else {
      onComplete(selectedAcademyId);
    }
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.modalContent}>
            {isEditMode && onClose && (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.header}>
                <View style={styles.iconBox}>
                  <Ionicons name="people" size={32} color="#3B82F6" />
                </View>
                <Text style={styles.title}>
                  {isEditMode ? 'Update Affiliation' : 'Welcome, Coach!'}
                </Text>
                <Text style={styles.subtitle}>
                  {isEditMode ? 'Modify your academy details' : 'Complete your registration'}
                </Text>
              </View>

              <View style={styles.questionSection}>
                <Text style={styles.question}>Are you currently an active coach at an academy?</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    onPress={() => setIsActiveCoach('yes')}
                    style={[styles.toggleBtn, isActiveCoach === 'yes' && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, isActiveCoach === 'yes' && styles.toggleBtnTextActive]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setIsActiveCoach('no')}
                    style={[styles.toggleBtn, isActiveCoach === 'no' && styles.toggleBtnDark]}
                  >
                    <Text style={[styles.toggleBtnText, isActiveCoach === 'no' && styles.toggleBtnTextActive]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isActiveCoach === 'yes' && (
                <View style={styles.academySection}>
                  <Text style={styles.label}>Select Academy</Text>
                  <TouchableOpacity 
                    onPress={() => setShowAcademyPicker(true)} 
                    style={styles.pickerTrigger}
                  >
                    <Text style={[styles.pickerValue, !selectedAcademyId && styles.pickerPlaceholder]}>
                      {selectedAcademyId === 'other' ? 'Other (Add New Academy)' : (academies.find(a => a.id === selectedAcademyId)?.name || 'Choose an academy...')}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                  </TouchableOpacity>

                  {selectedAcademyId === 'other' && (
                    <View style={styles.newAcademyForm}>
                      <Text style={styles.formTitle}>New Academy Details</Text>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Academy Name</Text>
                        <TextInput 
                          placeholder="e.g. Elite Tennis Academy"
                          value={academyName}
                          onChangeText={setAcademyName}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Location</Text>
                        <TextInput 
                          placeholder="e.g. Indiranagar, Bangalore"
                          value={location}
                          onChangeText={setLocation}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Pincode</Text>
                        <TextInput 
                          placeholder="e.g. 560038"
                          value={pincode}
                          onChangeText={setPincode}
                          keyboardType="numeric"
                          maxLength={6}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Contact Phone Number</Text>
                        <TextInput 
                          placeholder="e.g. +91 9876543210"
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity 
                onPress={handleSubmit}
                disabled={!isActiveCoach || (isActiveCoach === 'yes' && !selectedAcademyId)}
                style={[styles.submitBtn, (!isActiveCoach || (isActiveCoach === 'yes' && !selectedAcademyId)) && styles.submitBtnDisabled]}
              >
                <Text style={styles.submitBtnText}>
                  {isEditMode ? 'Update Affiliation' : 'Complete Registration'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Custom Picker Modal */}
      <Modal visible={showAcademyPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Academy</Text>
              <TouchableOpacity onPress={() => setShowAcademyPicker(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {academies.map(a => (
                <TouchableOpacity 
                  key={a.id} 
                  onPress={() => {
                    setSelectedAcademyId(a.id);
                    setShowAcademyPicker(false);
                  }}
                  style={styles.pickerItem}
                >
                  <Text style={styles.pickerItemText}>{a.name}</Text>
                  {selectedAcademyId === a.id && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                  onPress={() => {
                    setSelectedAcademyId('other');
                    setShowAcademyPicker(false);
                  }}
                  style={[styles.pickerItem, styles.pickerItemOther]}
                >
                  <Text style={[styles.pickerItemText, {color: '#3B82F6'}]}>+ Other (Add New Academy)</Text>
                  {selectedAcademyId === 'other' && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 20,
  },
  scroll: {
    padding: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconBox: {
    width: 64,
    height: 64,
    backgroundColor: '#EFF6FF',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 8,
    textAlign: 'center',
  },
  questionSection: {
    marginBottom: 32,
  },
  question: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  toggleBtnDark: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  academySection: {
    gap: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingLeft: 4,
  },
  pickerTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  pickerPlaceholder: {
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  newAcademyForm: {
    backgroundColor: '#F8FAFC',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 12,
    gap: 16,
  },
  formTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  submitBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 32,
    elevation: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
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
  pickerItemOther: {
    backgroundColor: '#EFF6FF',
    marginTop: 8,
  }
});

export default CoachOnboardingModal;
