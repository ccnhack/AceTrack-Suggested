import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./ProfileScreen.styles";
import { OTPVerificationModal } from '../../components/ProfileSubComponents';

export const EditProfileModal = (props) => {
  const { 
    showEditProfile, setShowEditProfile, user, onUpdateUser, 
    editName, setEditName, editEmail, setEditEmail, editPhone, setEditPhone,
    editAvatar, editManagedSports, setEditManagedSports,
    isSportsDropdownOpen, setIsSportsDropdownOpen, Sport,
    showVerifyModal, setShowVerifyModal, verificationCode, setVerificationCode,
    isVerifying, setIsVerifying, onVerifyAccount 
  } = props;
  
  return (
        <Modal visible={showEditProfile} animationType="fade" transparent={true} onRequestClose={() => setShowEditProfile(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardView}
            >
              <View style={styles.editModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Profile Details</Text>
                  <TouchableOpacity onPress={() => setShowEditProfile(false)} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Full Name</Text>
                    </View>
                    <TextInput 
                      style={styles.input}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Enter name"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Username</Text>
                      <View style={styles.inlineVerifiedBadge}>
                        <Ionicons name="lock-closed" size={10} color="#94A3B8" />
                        <Text style={[styles.verifiedText, { color: '#94A3B8' }]}>Permanent</Text>
                      </View>
                    </View>
                    <TextInput 
                      style={[styles.input, styles.disabledInput]}
                      value={user.username || user.id}
                      editable={false}
                    />
                  </View>

              {user.role === 'academy' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Managed Sports</Text>
                  <TouchableOpacity 
                    onPress={() => setIsSportsDropdownOpen(!isSportsDropdownOpen)}
                    style={styles.dropdownButton}
                  >
                    <Text style={styles.dropdownButtonText}>
                      {editManagedSports.length > 0 
                        ? editManagedSports.join(', ') 
                        : 'Select Sports'}
                    </Text>
                    <Ionicons name={isSportsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                  </TouchableOpacity>
                  
                  {isSportsDropdownOpen && (
                    <View style={styles.dropdownList}>
                      {Object.values(Sport).map(s => {
                        const isSelected = editManagedSports.includes(s);
                        return (
                          <TouchableOpacity
                            key={s}
                            onPress={() => {
                              const newSports = isSelected
                                ? editManagedSports.filter(sport => sport !== s)
                                : [...editManagedSports, s];
                              setEditManagedSports(newSports);
                            }}
                            style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                          >
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>{s}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}


                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Email Address</Text>
                      {user.role !== 'admin' && user?.role !== 'admin' && user?.id !== 'admin' && user?.id !== 'admin_sys' && (
                        user.isEmailVerified ? (
                          <View style={styles.inlineVerifiedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                            <Text style={styles.verifiedText}>Verified</Text>
                          </View>
                        ) : (
                          <TouchableOpacity 
                            style={styles.inlineVerifyBtn}
                            onPress={() => {
                              setShowVerifyModal('email');
                            }}
                          >
                            <Text style={styles.verifyBtnText}>Verify Now</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                    <TextInput 
                      style={[styles.input, user.isEmailVerified && styles.disabledInput]}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder="john@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!user.isEmailVerified}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Phone Number</Text>
                      {user.role !== 'admin' && user?.role !== 'admin' && user?.id !== 'admin' && user?.id !== 'admin_sys' && (
                        user.isPhoneVerified ? (
                          <View style={styles.inlineVerifiedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                            <Text style={styles.verifiedText}>Verified</Text>
                          </View>
                        ) : (
                          <TouchableOpacity 
                            style={styles.inlineVerifyBtn}
                            onPress={() => {
                              setShowVerifyModal('phone');
                            }}
                          >
                            <Text style={styles.verifyBtnText}>Verify Now</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                    <TextInput 
                      style={[styles.input, user.isPhoneVerified && styles.disabledInput]}
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder="+91 9876543210"
                      keyboardType="phone-pad"
                      editable={!user.isPhoneVerified}
                    />
                  </View>

                  <TouchableOpacity 
                    onPress={() => {
                      onUpdateUser({ 
                        ...user, 
                        name: editName, 
                        email: editEmail, 
                        phone: editPhone,
                        avatar: editAvatar, // CRITICAL FIX: Ensure avatar persists during name/email saves
                        managedSports: editManagedSports
                      });
                      setShowEditProfile(false);
                      Alert.alert("Success", "Profile updated successfully!");
                    }}
                    style={styles.saveBtn}
                  >
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowEditProfile(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
          <OTPVerificationModal 
            showVerifyModal={showVerifyModal}
            setShowVerifyModal={setShowVerifyModal}
            verificationCode={verificationCode}
            setVerificationCode={setVerificationCode}
            isVerifying={isVerifying}
            setIsVerifying={setIsVerifying}
            onVerifyAccount={onVerifyAccount}
            onUpdateUser={onUpdateUser}
            user={user}
            isNested={true}
          />
        </Modal>
  );
};
