import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const ChangePasswordModal = (props) => {
  const { showChangePassword, setShowChangePassword, passwordForm, setPasswordForm, handleChangePassword, isChangingPassword, showPasswordMap, setShowPasswordMap } = props;
  
  return (
        <Modal visible={showChangePassword} animationType="fade" transparent={true} onRequestClose={() => setShowChangePassword(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardView}
            >
              <View style={styles.editModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Change Password</Text>
                  <TouchableOpacity onPress={() => setShowChangePassword(false)} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Current Password</Text>
                    </View>
                    <TextInput 
                      style={styles.input}
                      value={oldPassword}
                      onChangeText={setOldPassword}
                      placeholder="••••••••"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>New Password</Text>
                    </View>
                    <TextInput 
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="••••••••"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>Confirm New Password</Text>
                    </View>
                    <TextInput 
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="••••••••"
                      secureTextEntry
                    />
                  </View>

                  <TouchableOpacity 
                     onPress={async () => {
                       const safeAlert = (title, msg) => Alert.alert(title, msg);

                       if (!oldPassword || !newPassword || !confirmPassword) {
                         safeAlert("Error", "Please fill all fields");
                         return;
                       }
                       if (newPassword !== confirmPassword) {
                         safeAlert("Error", "New passwords do not match");
                         return;
                       }
                       if (newPassword.length < 8) {
                         safeAlert("Error", "New password must be at least 8 characters");
                         return;
                       }
                       
                       try {
                         const token = await storage.getItem('userToken');
                         const headers = { 
                           'Content-Type': 'application/json',
                           'x-ace-api-key': config.PUBLIC_APP_ID
                         };
                         if (token) headers['Authorization'] = `Bearer ${token}`;

                         const response = await fetch(`${activeApiUrl}/api/v1/auth/change-password`, {
                           method: 'POST',
                           headers,
                           credentials: 'include',
                           body: JSON.stringify({ oldPassword, newPassword })
                         });

                         const data = await response.json();

                         if (response.ok && data.success) {
                           logger.logAction('PASSWORD_CHANGE_SUCCESS');
                           setShowChangePassword(false);
                           setOldPassword('');
                           setNewPassword('');
                           setConfirmPassword('');
                           Alert.alert("Success", "Password changed successfully!");
                         } else {
                           safeAlert("Error", data.error || "Failed to change password");
                         }
                       } catch (e) {
                         safeAlert("Network Error", e.message);
                       }
                     }}
                     style={styles.saveBtn}
                  >
                    <Text style={styles.saveBtnText}>Update Password</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowChangePassword(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
  );
};
