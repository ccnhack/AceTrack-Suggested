import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import logger from '../utils/logger';

const ProfileMenuSection = memo(({ 
  user,
  isUpdatingBinary,
  setIsUpdatingBinary,
  onEditProfile,
  onDiagnostics,
  onChangePassword,
  onReferral,
  onSupport,
  onCoachOnboarding,
  onLogout,
}) => {
  return (
    <View style={styles.menuSection}>
      {user.role === 'coach' && (
        <TouchableOpacity 
          onPress={onCoachOnboarding}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
            <Ionicons name="ribbon" size={20} color="#16A34A" />
          </View>
          <Text style={styles.menuLabel}>Affiliation</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        testID="profile.edit.button"
        onPress={() => {
          logger.logAction('MODAL_OPEN', { modal: 'EditProfile' });
          onEditProfile();
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
          <Ionicons name="person-outline" size={20} color="#334155" />
        </View>
        <Text style={styles.menuLabel}>Profile Details</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => {
          logger.logAction('MODAL_OPEN', { modal: 'Diagnostics' });
          onDiagnostics();
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
          <Ionicons name="bug-outline" size={20} color="#334155" />
        </View>
        <Text style={styles.menuLabel}>System Diagnostics</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => {
          logger.logAction('MODAL_OPEN', { modal: 'ChangePassword' });
          onChangePassword();
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
          <Ionicons name="lock-closed-outline" size={20} color="#334155" />
        </View>
        <Text style={styles.menuLabel}>Change Password</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>
      
      {user.role === 'user' && (
        <TouchableOpacity 
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'Referral' });
            onReferral();
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(79, 70, 229, 0.1)' }]}>
            <Ionicons name="gift-outline" size={20} color="#4F46E5" />
          </View>
          <Text style={styles.menuLabel}>Refer Friends, Play Along</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        onPress={() => {
          if (user?.role === 'admin') {
            logger.logAction('NAVIGATE_ADMIN_GRIEVANCES');
            onSupport('admin_hub'); // Special signal to ProfileScreen
          } else {
            logger.logAction('MODAL_OPEN', { modal: 'Support' });
            onSupport();
          }
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
          <Ionicons name="help-buoy" size={20} color="#3B82F6" />
        </View>
        <Text style={styles.menuLabel}>{user?.role === 'admin' ? 'Support Center' : 'Help & Support'}</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>



      <TouchableOpacity 
        onPress={async () => {
          if (__DEV__) {
            Alert.alert("Dev Mode", "OTA updates are disabled in development. This will work in the production app.");
            return;
          }
          try {
            setIsUpdatingBinary(true);
            logger.logAction('MANUAL_OTA_CHECK_START');
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
              logger.logAction('MANUAL_OTA_UPDATE_FOUND', { version: update.updateId });
              Alert.alert("Update Found", "New version detected. Downloading...");
              await Updates.fetchUpdateAsync();
              logger.logAction('MANUAL_OTA_UPDATE_DOWNLOADED');
              Alert.alert("Success", "Update downloaded. Restarting app...", [
                { text: "OK", onPress: () => Updates.reloadAsync() }
              ]);
            } else {
              logger.logAction('MANUAL_OTA_CHECK_UP_TO_DATE');
              Alert.alert("Up to Date", "You are already on the latest version.");
            }
          } catch (e) {
            logger.logAction('MANUAL_OTA_CHECK_ERROR', { error: e.message });
            Alert.alert("Update Error", "Could not reach update server. Please check your internet connection.");
          } finally {
            setIsUpdatingBinary(false);
          }
        }}
        style={styles.menuItem}
        disabled={isUpdatingBinary}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(3, 105, 161, 0.1)' }]}>
          <Ionicons name={isUpdatingBinary ? "hourglass-outline" : "cloud-download-outline"} size={20} color="#0369A1" />
        </View>
        <Text style={[styles.menuLabel, { color: '#0369A1', fontWeight: 'bold' }]}>
          {isUpdatingBinary ? "Checking for updates..." : "Force Update App"}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>

      <TouchableOpacity 
        testID="profile.logout.button"
        onPress={() => {
          logger.logAction('USER_LOGOUT_CLICK');
          onLogout();
        }}
        style={[styles.menuItem, styles.logoutItem]}
      >
        <View style={[styles.menuIcon, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
          <Ionicons name="log-out" size={20} color="#EF4444" />
        </View>
        <Text style={[styles.menuLabel, { color: '#EF4444' }]}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
});

ProfileMenuSection.displayName = 'ProfileMenuSection';

const styles = StyleSheet.create({
  menuSection: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutItem: {
    marginTop: 12,
    borderBottomWidth: 0,
  },
});

export default ProfileMenuSection;
