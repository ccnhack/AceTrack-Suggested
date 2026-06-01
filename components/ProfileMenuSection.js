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
  onShareStats,
  onSupport,
  onCoachOnboarding,
  onCoachAvailability,
  onLogout,
  onOpenModal,
}) => {
  return (
    <View style={styles.menuSection}>
      {user.role === 'coach' && (
        <>
          <TouchableOpacity 
            onPress={onCoachOnboarding}
            style={styles.menuItem}
          >
            <View style={[styles.menuIcon, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="ribbon" size={20} color="#16A34A" />
            </View>
            <Text style={styles.menuLabel}>Affiliation</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={onCoachAvailability}
            style={styles.menuItem}
          >
            <View style={[styles.menuIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="calendar-outline" size={20} color="#4F46E5" />
            </View>
            <Text style={styles.menuLabel}>Manage Availability</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity 
        testID="profile.edit.button"
        onPress={() => {
          logger.logAction('MODAL_OPEN', { modal: 'EditProfile' });
          onEditProfile();
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
          <Ionicons name="person-outline" size={20} color="#334155" />
        </View>
        <Text style={styles.menuLabel}>Profile Details</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>

      {user.role !== 'support' && (
        <TouchableOpacity 
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'Diagnostics' });
            onDiagnostics();
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="bug-outline" size={20} color="#334155" />
          </View>
          <Text style={styles.menuLabel}>System Diagnostics</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        onPress={() => {
          logger.logAction('MODAL_OPEN', { modal: 'ChangePassword' });
          onChangePassword();
        }}
        style={styles.menuItem}
      >
        <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
          <Ionicons name="lock-closed-outline" size={20} color="#334155" />
        </View>
        <Text style={styles.menuLabel}>Change Password</Text>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </TouchableOpacity>
      
      {user.role === 'support' && (
        <>
          <TouchableOpacity 
            onPress={() => {
              if (onOpenModal) onOpenModal('performance_reviews');
            }}
            style={styles.menuItem}
          >
            <View style={[styles.menuIcon, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="star-outline" size={20} color="#D97706" />
            </View>
            <Text style={styles.menuLabel}>Performance Reviews</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => {
              if (onOpenModal) onOpenModal('org_policies');
            }}
            style={styles.menuItem}
          >
            <View style={[styles.menuIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#4F46E5" />
            </View>
            <Text style={styles.menuLabel}>Organisation Policies</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>
        </>
      )}

      {user.role === 'user' && (
        <TouchableOpacity 
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'Referral' });
            onReferral();
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="gift-outline" size={20} color="#4F46E5" />
          </View>
          <Text style={styles.menuLabel}>Refer Friends, Play Along</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      {user.role === 'user' && onShareStats && (
        <TouchableOpacity 
          testID="profile.shareStats.button"
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'ShareStats' });
            onShareStats();
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#FDF2F8' }]}>
            <Ionicons name="share-social-outline" size={20} color="#DB2777" />
          </View>
          <Text style={styles.menuLabel}>Share My Stats</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      {/* --- Support: Report Issue (auto-assigns to admin) --- */}
      {user.role === 'support' && (
        <TouchableOpacity 
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'ReportIssue' });
            if (onSupport) onSupport('admin_hub');
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="warning-outline" size={20} color="#DC2626" />
          </View>
          <Text style={styles.menuLabel}>Report Issue</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      {/* --- Regular Users (Player/Coach/Academy): Help & Support --- */}
      {user.role !== 'admin' && user.role !== 'support' && (
        <TouchableOpacity 
          onPress={() => {
            logger.logAction('MODAL_OPEN', { modal: 'Support' });
            onSupport();
          }}
          style={styles.menuItem}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="help-buoy" size={20} color="#3B82F6" />
          </View>
          <Text style={styles.menuLabel}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}



      {user.role !== 'support' && user.role !== 'admin' && (
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
                Alert.alert(
                  "Up to Date", 
                  "No new updates found on the server. If an update was downloaded in the background, you can apply it now.",
                  [
                    { text: "OK", style: "cancel" },
                    { text: "Force Reload", onPress: () => Updates.reloadAsync() }
                  ]
                );
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
          <View style={[styles.menuIcon, { backgroundColor: '#F0F9FF' }]}>
            <Ionicons name={isUpdatingBinary ? "hourglass-outline" : "cloud-download-outline"} size={20} color="#0369A1" />
          </View>
          <Text style={[styles.menuLabel, { color: '#0369A1', fontWeight: 'bold' }]}>
            {isUpdatingBinary ? "Checking for updates..." : "Force Update App"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        testID="profile.logout.button"
        onPress={() => {
          logger.logAction('USER_LOGOUT_CLICK');
          onLogout();
        }}
        style={[styles.menuItem, styles.logoutItem]}
      >
        <View style={[styles.menuIcon, { backgroundColor: '#FEF2F2' }]}>
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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  logoutItem: {
    marginTop: 8,
    borderBottomWidth: 0,
  },
});

export default ProfileMenuSection;
