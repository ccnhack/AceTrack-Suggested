import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, FlatList,
  StyleSheet, SafeAreaView, Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import designSystem from '../theme/designSystem';
import { Sport } from '../types';
import * as ImagePicker from 'expo-image-picker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { PlayerSkillDashboard, PlayerPerformanceAnalytics, PlayerWalletDashboard } from '../components/PlayerProfileFeatures';
import CoachOnboardingModal from '../components/CoachOnboardingModal';
import { SupportTicketSystem } from '../components/SupportTicketSystem';
import DiagnosticsModal from '../components/DiagnosticsModal';
import config from '../config';
import logger from '../utils/logger';
import storage from '../utils/storage';

const calculateAcademyTier = (uid, tournaments) => {
  const hostedCount = tournaments.filter(t => t.creatorId === uid).length;
  if (hostedCount >= 5) return 'Gold';
  if (hostedCount >= 2) return 'Silver';
  return 'Bronze';
};

const getInitials = (name) => {
  if (!name) return 'AT';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

const AvatarPlaceholder = ({ name, size = 80 }) => {
  const initials = getInitials(name);
  // Hash name to get a consistent color
  const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  const colorIndex = (name || '').length % colors.length;
  const backgroundColor = colors[colorIndex];

  return (
    <View style={[
      styles.avatarPlaceholder, 
      { width: size, height: size, borderRadius: size / 2, backgroundColor }
    ]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
};

const NotificationsModal = ({ visible, onClose, notifications, onClear, onNotificationClick }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.notificationsModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Notifications</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false}>
            {notifications && notifications.length > 0 ? (
              notifications.map((notif) => (
                <TouchableOpacity 
                  key={notif.id} 
                  style={[styles.notificationItem, !notif.read && styles.unreadNotification]}
                  onPress={() => onNotificationClick(notif)}
                >
                  <View style={styles.notificationIcon}>
                    <Ionicons 
                      name={notif.type === 'video' ? 'play-circle' : notif.type === 'support' ? 'help-buoy' : 'notifications'} 
                      size={24} 
                      color={notif.read ? '#94A3B8' : '#3B82F6'} 
                    />
                  </View>
                  <View style={styles.notificationText}>
                    <Text style={[styles.notificationTitle, !notif.read && styles.boldText]}>{notif.title}</Text>
                    <Text style={styles.notificationMessage}>{notif.message}</Text>
                    <Text style={styles.notificationDate}>{new Date(notif.date).toLocaleDateString()}</Text>
                  </View>
                  {!notif.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyText}>No notifications yet</Text>
              </View>
            )}
          </ScrollView>
          
          {notifications && notifications.some(n => !n.read) && (
            <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const ProfileScreen = ({ 
  user, players, tournaments, onUpdateUser, onLogout, 
  supportTickets, onSaveTicket, onUpdateTicketStatus, onReplyTicket,
  onTopUp, navigation,  isCloudOnline,
  lastSyncTime,
  onManualSync,
  isUsingCloud,
  onToggleCloud,
  setIsProfileEditActive,
  onVerifyAccount,
  onUploadLogs,
  isUploadingLogs,
  appVersion
}) => {
  useEffect(() => {
    logger.logAction('SCREEN_VIEW', { screen: 'Profile' });
  }, []);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCoachOnboarding, setShowCoachOnboarding] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [sessionCustomAvatar, setSessionCustomAvatar] = useState(null); // Persistence for session
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(null); // 'email' | 'phone'
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUpdatingBinary, setIsUpdatingBinary] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState(null);

  const activeApiUrl = isUsingCloud ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;

  // New Update Check logic
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const response = await fetch(`${activeApiUrl}/api/status`, {
          headers: { 'x-api-key': config.ACE_API_KEY || 'ace-secret-key-1717' }
        });
        const data = await response.json();
        if (data && data.latestAppVersion) {
            setLatestVersion(data.latestAppVersion);
            // Local appVersion comes from props
            if (appVersion && data.latestAppVersion !== appVersion) {
              const localParts = appVersion.split('-')[0].split('.').map(Number);
              const remoteParts = data.latestAppVersion.split('-')[0].split('.').map(Number);
              
              let isNewer = false;
              for (let i = 0; i < 3; i++) {
                if ((remoteParts[i] || 0) > (localParts[i] || 0)) {
                  isNewer = true;
                  break;
                }
                if ((remoteParts[i] || 0) < (localParts[i] || 0)) {
                  break;
                }
              }
              
              if (isNewer) {
                setUpdateAvailable(true);
              } else {
                setUpdateAvailable(false);
              }
            }
        }
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    };
    
    checkUpdates();
  }, [appVersion, activeApiUrl]);

  const handleManualUpdate = async () => {
    if (__DEV__) {
      Alert.alert("Dev Mode", "OTA updates are disabled in development.");
      return;
    }
    try {
      setIsUpdatingBinary(true);
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert("Success", "Update downloaded. Restarting...", [
          { text: "OK", onPress: () => Updates.reloadAsync() }
        ]);
      } else {
        setUpdateAvailable(false);
        Alert.alert("Up to Date", "Already on latest version.");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setIsUpdatingBinary(false);
    }
  };

  const renderUpdateCard = () => {
    if (!updateAvailable) return null;
    return (
      <TouchableOpacity 
          onPress={handleManualUpdate}
          style={styles.updateCard}
      >
          <View style={styles.updateIconContainer}>
              <Ionicons name="sync-outline" size={18} color="#475569" />
          </View>
          <Text style={styles.updateText}>App Update Available</Text>
          <View style={styles.versionBadgeContainer}>
              <Text style={styles.versionBadgeText}>v{latestVersion || '2.0.1'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </TouchableOpacity>
    );
  };



  // Edit Profile States
  const [message, setMessage] = useState('');
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7));

  const MOCK_EVENTS = [
    { id: '1', title: 'Bangalore Open TT', date: '2026-03-25', sport: 'Table Tennis', type: 'tournament' },
    { id: '2', title: 'Whitefield Badminton League', date: '2026-03-28', sport: 'Badminton', type: 'tournament' },
    { id: '3', title: 'Karnataka State Ranking', date: '2026-04-10', sport: 'Badminton', type: 'tournament' },
    { id: '4', title: 'Mysore Open', date: '2026-04-22', sport: 'Table Tennis', type: 'tournament' },
    { id: '5', title: 'Summer Smash', date: '2026-05-05', sport: 'Cricket', type: 'tournament' },
    { id: '6', title: 'May Day Cup', date: '2026-05-15', sport: 'Badminton', type: 'tournament' },
  ];

  const MOCK_CONFIRMED_BOOKINGS = user.role === 'coach' ? [
    { id: 'cb1', title: 'Coaching: Aaryan Sharma', date: '2026-03-26', sport: 'Tennis', type: 'booking' },
    { id: 'cb2', title: 'Coaching: Rohan G.', date: '2026-03-28', sport: 'Cricket', type: 'booking' },
  ] : [];

  const allEvents = [...MOCK_EVENTS, ...MOCK_CONFIRMED_BOOKINGS];

  const filteredEvents = allEvents.filter(event => {
    const eventMonth = event.date.substring(0, 7);
    const date = new Date(currentMonth + '-01');
    const nextMonthDate = new Date(date.setMonth(date.getMonth() + 1));
    const nextMonth = nextMonthDate.toISOString().substring(0, 7);
    return eventMonth === currentMonth || eventMonth === nextMonth;
  });

  const markedDates = {};
  allEvents.forEach(event => {
    markedDates[event.date] = { 
        marked: true, 
        dotColor: event.type === 'booking' ? '#22C55E' : designSystem.colors.primary 
    };
  });
  const [editName, setEditName] = useState(user?.name || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatar || '');
  const [editManagedSports, setEditManagedSports] = useState(user?.managedSports || []);
  const [isSportsDropdownOpen, setIsSportsDropdownOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Sync edit state with user if user changes from cloud
  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditAvatar(user.avatar || '');
      setEditManagedSports(user.managedSports || []);
      setImageError(false);
      logger.logAction('USER_AVATAR_INITIALIZED', { id: user.id, avatar: user.avatar });
    }
  }, [user?.id, user?.avatar, user?.managedSports]);

  // Load persisted session avatar on mount
  useEffect(() => {
    const loadSessionAvatar = async () => {
      const saved = await storage.getItem('sessionCustomAvatar');
      if (saved) {
        setSessionCustomAvatar(saved);
        logger.logAction('SESSION_AVATAR_HYDRATED', { url: saved });
      }
    };
    loadSessionAvatar();
  }, []);

  // Save to storage when it changes
  useEffect(() => {
    if (sessionCustomAvatar) {
      storage.setItem('sessionCustomAvatar', sessionCustomAvatar);
    }
  }, [sessionCustomAvatar]);
  
  // Handle auto-open for Edit Profile (from global verification prompt)
  useEffect(() => {
    try {
      if (navigation?.getState?.()?.routes[navigation.getState().index]?.params?.autoEdit) {
        setShowEditProfile(true);
        navigation.setParams({ autoEdit: false });
      }
    } catch (e) {
      console.warn("[ProfileScreen] Navigation state access failed:", e);
    }
  }, [navigation]);
  useEffect(() => {
    setIsProfileEditActive(showEditProfile);
  }, [showEditProfile]);

  const suggestedAvatars = [
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`,
    'https://api.dicebear.com/7.x/avataaars/png?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Milo',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Willow',
  ];

  // Combine suggested, user's current avatar, and newly picked avatar
  // USER REQUIREMENT: Custom avatar should be at the front!
  const customAvatars = [];
  
  // Add current avatar if custom
  if (user?.avatar && !suggestedAvatars.includes(user.avatar)) {
    customAvatars.push(user.avatar);
  }

  // Add session-uploaded avatar if not already current
  if (sessionCustomAvatar && !customAvatars.includes(sessionCustomAvatar)) {
    customAvatars.push(sessionCustomAvatar);
  }
  
  // Add newly picked/edited avatar if custom and not already in list
  if (editAvatar && !suggestedAvatars.includes(editAvatar) && !customAvatars.includes(editAvatar)) {
    customAvatars.unshift(editAvatar);
  }

  const allAvatars = [...new Set([...customAvatars, ...suggestedAvatars])];

  // Change Password States
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const pickImage = async () => {
    try {
      console.log("📸 Requesting media library permissions...");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      setIsPickingImage(true);
      console.log("📸 Opening image library...");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      console.log("📸 Image pick result:", JSON.stringify(result));
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error("📸 Image pick error:", error);
      Alert.alert('Error', `Failed to pick image: ${error.message || 'Unknown error'}`);
    } finally {
      setIsPickingImage(false);
    }
  };



  if (!user) return null;

  const academyTier = user.role === 'academy' ? calculateAcademyTier(user.id, tournaments) : null;

  const isWeb = Platform.OS === 'web';
  const content = (
    <SafeAreaView style={[styles.container, isWeb && { maxWidth: 900, alignSelf: 'center', width: '100%', backgroundColor: '#FFFFFF', padding: 24, marginVertical: 16, borderRadius: 24, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 40, overflow: 'hidden', flex: 1 }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
            <View style={styles.avatarContainer}>
                {user.role === 'admin' ? (
                  <View style={[styles.avatar, { backgroundColor: '#0F172A', borderWidth: 2, borderColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' }]}>
                    <Image source={require('../assets/icon.png')} style={{width: 50, height: 50, resizeMode: 'contain'}} />
                  </View>
                ) : user.avatar && !imageError ? (
                  <Image 
                    key={`${user.avatar}_${Math.random()}`}
                    source={{ uri: `${user.avatar}${user.avatar.includes('?') ? '&' : '?'}v=${Math.random().toString(36).substring(7)}` }} 
                    style={styles.avatar} 
                    onError={() => {
                        console.log("📸 Avatar load error, switching to initials");
                        setImageError(true);
                    }}
                  />
                ) : (
                  <AvatarPlaceholder name={user.name} size={80} />
                )}
                <TouchableOpacity 
                   style={styles.editBtn} 
                   onPress={() => {
                     logger.logAction('MODAL_OPEN', { modal: 'AvatarPicker' });
                     setShowAvatarPicker(true);
                   }}
                 >
                    <Ionicons name="camera" size={16} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
            <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                {academyTier && (
                  <View style={styles.roleRow}>
                    <View style={[styles.tierBadge, academyTier === 'Gold' ? styles.tierGold : academyTier === 'Silver' ? styles.tierSilver : styles.tierBronze]}>
                      <Text style={styles.tierText}>Academy Tier: {academyTier}</Text>
                    </View>
                  </View>
                )}

                {user.role !== 'admin' && user.role !== 'academy' && user.role !== 'coach' && (
                  <TouchableOpacity onPress={() => setShowWalletModal(true)} style={styles.walletTrigger}>
                    <Ionicons name="wallet" size={12} color="#16A34A" />
                    <Text style={styles.walletTriggerText}>Wallet: ₹{user.credits || 0}</Text>
                  </TouchableOpacity>
                )}
                
                {/* Cloud Sync Status Badge */}
                <TouchableOpacity 
              onPress={() => {
                logger.logAction('MANUAL_SYNC_CLICK');
                onManualSync();
              }}
              style={[styles.syncBadge, isCloudOnline ? styles.syncOnline : styles.syncOffline]}
            >
                  <Ionicons 
                    name={isCloudOnline ? "cloud-done" : "cloud-offline"} 
                    size={10} 
                    color={isCloudOnline ? "#16A34A" : "#EF4444"} 
                  />
                  <Text style={[styles.syncText, { color: isCloudOnline ? "#16A34A" : "#EF4444" }]}>
                    {isCloudOnline ? 'Cloud Synced' : 'Offline Mode'}
                  </Text>
                </TouchableOpacity>
                {lastSyncTime && (
                  <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>
                )}
            </View>

            <TouchableOpacity 
              style={styles.notificationBell} 
              onPress={() => {
                logger.logAction('MODAL_OPEN', { modal: 'Notifications' });
                setShowNotifications(true);
              }}
            >
                <Ionicons name="notifications-outline" size={24} color="#0F172A" />
                {user.notifications?.some(n => !n.read) && (
                    <View style={styles.notificationBadge}>
                        <Text style={styles.badgeText}>
                            {user.notifications.filter(n => !n.read).length}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        </View>

        {/* Skill Dashboard (Optional, based on user roles etc) */}


        {user.role !== 'admin' && user.role !== 'academy' && user.role !== 'coach' && (
          <View style={styles.section}>
              <Text style={styles.sectionTitle}>Skills</Text>
              {renderUpdateCard()}
              <PlayerSkillDashboard user={user} />
          </View>
        )}

        {(user.role === 'admin' || user.role === 'academy' || user.role === 'coach') && renderUpdateCard()}

        {/* --- NEW: Expert Panel Feature Hub --- */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expert Panel Features</Text>
            <View style={styles.featureGrid}>
                <TouchableOpacity 
                    style={styles.featureTile} 
                    onPress={() => navigation.navigate(user.role === 'admin' ? 'Insights' : 'Matchmaking')}
                >
                    <View style={[styles.featureIcon, { backgroundColor: user.role === 'admin' ? '#EEF2FF' : '#EEF2FF' }]}>
                        <Ionicons name={user.role === 'admin' ? 'analytics' : 'people'} size={24} color="#4F46E5" />
                    </View>
                    <Text style={styles.featureLabel}>
                        {user.role === 'admin' ? 'Insights' : user.role === 'coach' ? 'Bookings' : 'Matchmaking'}
                    </Text>
                </TouchableOpacity>

                {user.role !== 'coach' && user.role !== 'admin' && (
                  <TouchableOpacity style={styles.featureTile} onPress={() => navigation.navigate('CoachDirectory')}>
                      <View style={[styles.featureIcon, { backgroundColor: '#FFF7ED' }]}>
                          <Ionicons name="school" size={24} color="#EA580C" />
                      </View>
                      <Text style={styles.featureLabel}>Coaches</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.featureTile} onPress={() => setIsCalendarModalVisible(true)}>
                    <View style={[styles.featureIcon, { backgroundColor: '#F0FDF4' }]}>
                        <Ionicons name="calendar" size={24} color="#16A34A" />
                    </View>
                    <Text style={styles.featureLabel}>Calendar</Text>
                </TouchableOpacity>

                {user.role === 'academy' && (
                  <TouchableOpacity style={styles.featureTile} onPress={() => navigation.navigate('Subscriptions')}>
                      <View style={[styles.featureIcon, { backgroundColor: '#FDF2F8' }]}>
                          <Ionicons name="card" size={24} color="#DB2777" />
                      </View>
                      <Text style={styles.featureLabel}>Sub Plan</Text>
                  </TouchableOpacity>
                )}
            </View>
        </View>

        <View style={styles.menuSection}>
            <TouchableOpacity 
                onPress={() => {
                  logger.logAction('MODAL_OPEN', { modal: 'EditProfile' });
                  setShowEditProfile(true);
                }}
                style={styles.menuItem}
            >
                <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
                    <Ionicons name="person-outline" size={20} color="#334155" />
                </View>
                <Text style={styles.menuLabel}>Edit Profile</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => {
                  logger.logAction('MODAL_OPEN', { modal: 'Diagnostics' });
                  setShowDiagnostics(true);
                }}
                style={styles.menuItem}
            >
                <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
                    <Ionicons name="bug-outline" size={20} color="#334155" />
                </View>
                <Text style={styles.menuLabel}>System Diagnostics</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => {
                  logger.logAction('MODAL_OPEN', { modal: 'ChangePassword' });
                  setShowChangePassword(true);
                }}
                style={styles.menuItem}
            >
                <View style={[styles.menuIcon, { backgroundColor: '#F8FAFC' }]}>
                    <Ionicons name="lock-closed-outline" size={20} color="#334155" />
                </View>
                <Text style={styles.menuLabel}>Change Password</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => {
                  logger.logAction('MODAL_OPEN', { modal: 'Support' });
                  setShowSupport(true);
                }}
                style={styles.menuItem}
            >
                <View style={[styles.menuIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="help-buoy" size={20} color="#3B82F6" />
                </View>
                <Text style={styles.menuLabel}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            {user.role === 'coach' && (
                <TouchableOpacity 
                    onPress={() => setShowCoachOnboarding(true)}
                    style={styles.menuItem}
                >
                    <View style={[styles.menuIcon, { backgroundColor: '#F0FDF4' }]}>
                        <Ionicons name="ribbon" size={20} color="#16A34A" />
                    </View>
                    <Text style={styles.menuLabel}>Edit Academy</Text>
                    <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
            )}

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
                      Alert.alert("Update Found", "New version detected. Downloading...");
                      await Updates.fetchUpdateAsync();
                      Alert.alert("Success", "Update downloaded. Restarting app...", [
                        { text: "OK", onPress: () => Updates.reloadAsync() }
                      ]);
                    } else {
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
                <View style={[styles.menuIcon, { backgroundColor: '#F0F9FF' }]}>
                    <Ionicons name={isUpdatingBinary ? "hourglass-outline" : "cloud-download-outline"} size={20} color="#0369A1" />
                </View>
                <Text style={[styles.menuLabel, { color: '#0369A1', fontWeight: 'bold' }]}>
                  {isUpdatingBinary ? "Checking for updates..." : "Force Update App"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity 
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

        <View style={styles.footer}>
            <Text style={styles.versionText}>AceTrack v{appVersion || '2.0.1'} (Mobile)</Text>
            <Text style={styles.legalText}>Privacy Policy • Terms of Service</Text>
        </View>

      </ScrollView>

      <DiagnosticsModal 
        visible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        onUpload={onUploadLogs}
        isUploading={isUploadingLogs}
      />

      {/* Support System Modal */}
      <Modal visible={showSupport} animationType="slide">
        <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.supportContainer}>
            <View style={styles.supportHeader}>
                <Text style={styles.supportTitle}>Support Center</Text>
                <TouchableOpacity onPress={() => setShowSupport(false)} style={styles.supportClose}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
            </View>
            {SupportTicketSystem ? (
              <SupportTicketSystem 
                  tickets={supportTickets || []}
                  userId={user?.id || 'unknown'}
                  userName={user?.name || 'User'}
                  onCreateTicket={onSaveTicket}

                  onSendMessage={onReplyTicket}
              />
            ) : <Text>Support System Unavailable</Text>}
        </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>

      {/* Verification OTP Modal */}
      <Modal visible={!!showVerifyModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
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
              maxLength={6}
              keyboardType="number-pad"
              value={verificationCode}
              onChangeText={setVerificationCode}
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
                    onUpdateUser({
                      ...user,
                      [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true
                    });
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
      </Modal>

      {/* Coach Onboarding (Affiliation Edit) */}
      {showCoachOnboarding && (
          <CoachOnboardingModal 
            user={user}
            academies={players.filter(p => p.role === 'academy')}
            isEditMode
            onClose={() => setShowCoachOnboarding(false)}
            onComplete={(academyId, newAcademy) => {
                if (academyId === 'other') {
                    Alert.alert("Success", "Academy verification request sent!");
                }
                onUpdateUser({ ...user, academyId });
                setShowCoachOnboarding(false);
            }}
          />
      )}

      {/* Wallet Modal — centered popup with blurred dark background */}
      <Modal visible={showWalletModal} animationType="fade" transparent={true} onRequestClose={() => setShowWalletModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.walletModalContent}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.walletModalHeader}>
                <Text style={styles.walletModalTitle}>My Wallet</Text>
                <TouchableOpacity onPress={() => setShowWalletModal(false)} style={styles.walletModalClose}>
                  <Ionicons name="close" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>
              <PlayerWalletDashboard 
                user={user} 
                onTopUp={onTopUp} 
                noCard={true}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Avatar Picker Modal */}
      <Modal visible={showAvatarPicker} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Profile Picture</Text>
              <TouchableOpacity onPress={() => setShowAvatarPicker(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Choose Avatar</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarGrid}>
                  <TouchableOpacity onPress={pickImage} style={styles.avatarOption}>
                    <View style={[styles.avatarOptionImage, { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="add" size={24} color="#94A3B8" />
                    </View>
                  </TouchableOpacity>

                  {allAvatars.map((url, idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      onPress={() => setEditAvatar(url)}
                      style={[styles.avatarOption, editAvatar === url && styles.avatarOptionSelected]}
                    >
                      {url.includes('ui-avatars.com') ? (
                         <AvatarPlaceholder name={user.name} size={56} />
                      ) : (
                         <Image 
                           key={`${url}_${Math.random()}`} 
                           source={{ uri: `${url}${url.includes('?') ? '&' : '?'}v=${Math.random().toString(36).substring(7)}` }} 
                           style={styles.avatarOptionImage} 
                         />
                      )}
                      {editAvatar === url && (
                        <View style={styles.selectedCheck}>
                          <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <TouchableOpacity style={styles.uploadImageBtn} onPress={pickImage} disabled={isPickingImage}>
                  <Ionicons name={isPickingImage ? "hourglass-outline" : "image-outline"} size={20} color="#3B82F6" />
                  <Text style={styles.uploadImageText}>{isPickingImage ? "Opening Gallery..." : "Upload from Gallery"}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                onPress={async () => {
                  let finalAvatar = editAvatar;
                  if (editAvatar && (editAvatar.startsWith('file://') || editAvatar.startsWith('content://'))) {
                    setIsUploading(true);
                    logger.logAction('AVATAR_UPLOAD_START', { localUri: editAvatar });
                    try {
                      const formData = new FormData();
                      // Server expects 'video' field name for generic uploads
                      formData.append('video', { 
                        uri: editAvatar, 
                        name: `avatar_${user.id || 'new'}.jpg`, 
                        type: 'image/jpeg' 
                      });
                      
                      const response = await fetch(`${activeApiUrl}/api/upload`, {
                        method: 'POST',
                        body: formData,
                        headers: { 
                          'Content-Type': 'multipart/form-data',
                          'x-ace-api-key': config.ACE_API_KEY
                        },
                      });
                      
                      if (response.ok) {
                        const data = await response.json();
                        finalAvatar = data.url;
                        setSessionCustomAvatar(data.url); // Persist in picker for session
                        logger.logAction('AVATAR_UPLOAD_SUCCESS', { cloudUrl: data.url });
                      } else {
                        const errorText = await response.text();
                        logger.logAction('AVATAR_UPLOAD_FAIL', { status: response.status, error: errorText });
                        Alert.alert("Upload Failed", "Could not sync your image to the cloud. Please try again or use a prebuilt avatar.");
                        setIsUploading(false);
                        return; // DO NOT SAVE LOCAL URI TO CLOUD
                      }
                    } catch (e) { 
                      logger.logAction('AVATAR_UPLOAD_ERROR', { error: e.message });
                      Alert.alert("Connection Error", "Network issue while uploading image.");
                      setIsUploading(false);
                      return; 
                    }
                    finally { setIsUploading(false); }
                  }
                                    logger.logAction('PROFILE_UPDATE_FINAL', { userId: user.id, avatar: finalAvatar });
                   onUpdateUser({ ...user, avatar: finalAvatar });
                   setShowAvatarPicker(false);
                   Alert.alert("Success", "Profile picture updated!");
                }}
                style={[styles.saveBtn, isUploading && { opacity: 0.5 }]}
                disabled={isUploading}
              >
                <Text style={styles.saveBtnText}>{isUploading ? "Uploading..." : "Update Picture"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardView}
          >
            <View style={styles.editModalContent}>
              <TouchableOpacity onPress={() => setShowEditProfile(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
              <View style={styles.modalHeader}>
                <Text style={styles.editModalTitle}>Edit Profile</Text>
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
                    {user.role !== 'admin' && (
                      user.isEmailVerified ? (
                        <View style={styles.inlineVerifiedBadge}>
                          <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                          <Text style={styles.verifiedText}>Verified</Text>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={styles.inlineVerifyBtn}
                          onPress={() => setShowVerifyModal('email')}
                        >
                          <Text style={styles.verifyBtnText}>Verify Now</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                  <TextInput 
                    style={styles.input}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="john@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    {user.role !== 'admin' && (
                      user.isPhoneVerified ? (
                        <View style={styles.inlineVerifiedBadge}>
                          <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                          <Text style={styles.verifiedText}>Verified</Text>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={styles.inlineVerifyBtn}
                          onPress={() => setShowVerifyModal('phone')}
                        >
                          <Text style={styles.verifyBtnText}>Verify Now</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                  <TextInput 
                    style={styles.input}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+91 9876543210"
                    keyboardType="phone-pad"
                  />
                </View>

                <TouchableOpacity 
                  onPress={() => {
                    onUpdateUser({ 
                      ...user, 
                      name: editName, 
                      email: editEmail, 
                      phone: editPhone,
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
      </Modal>

      {/* Change Password Modal */}
      {/* Change Password Modal */}
      <Modal visible={showChangePassword} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
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
                   onPress={() => {
                     if (!oldPassword || !newPassword || !confirmPassword) {
                       Alert.alert("Error", "Please fill all fields");
                       return;
                     }
                     if (newPassword !== confirmPassword) {
                       Alert.alert("Error", "New passwords do not match");
                       return;
                     }
                     
                     logger.logAction('PASSWORD_CHANGE_ATTEMPT');
                     Alert.alert("Success", "Password changed successfully!");
                     setShowChangePassword(false);
                     setOldPassword('');
                     setNewPassword('');
                     setConfirmPassword('');
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

      <NotificationsModal 
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={user.notifications || []}
        onClear={() => {
          const updated = (user.notifications || []).map(n => ({ ...n, read: true }));
          onUpdateUser({ ...user, notifications: updated });
        }}
        onNotificationClick={(notif) => {
            // Mark as read
            const updated = (user.notifications || []).map(n => n.id === notif.id ? { ...n, read: true } : n);
            onUpdateUser({ ...user, notifications: updated });
            setShowNotifications(false);
            
            // LOG: Logging in-app notification click
            logger.logAction('IN_APP_NOTIFICATION_CLICKED', {
                id: notif.id,
                type: notif.type,
                title: notif.title,
                timestamp: new Date().toISOString()
            });

            
            // Navigate based on type
            if (notif.type === 'video') {
                navigation.navigate('Recordings');
            } else if (notif.type === 'support') {
                setShowSupport(true);
            } else if (notif.type === 'tournament' || notif.type === 'tournament_invite') {
                navigation.navigate('Matches');
            } else if (notif.type === 'challenge') {
                navigation.navigate('Matchmaking');
            } else if (notif.type === 'booking') {
                navigation.navigate('CoachDiscovery');
            } else if (notif.type === 'general') {
                // If it's a general invite without specific type
                if (notif.title === 'Tournament Invitation') navigation.navigate('Matches');
            }
        }}
      />
            {/* Calendar Modal */}
            <Modal visible={isCalendarModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.calendarModalContent}>
                        <View style={styles.calendarModalHeader}>
                            <Text style={styles.calendarModalTitle}>{user.role === 'coach' ? 'Calendar' : 'Tournament Calendar'}</Text>
                            <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)} style={styles.calendarCloseBtn}>
                                <Ionicons name="close" size={28} color="#333" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                            <Calendar 
                              onMonthChange={(month) => setCurrentMonth(month.dateString.substring(0, 7))}
                              theme={{
                                todayTextColor: designSystem.colors.primary,
                                arrowColor: designSystem.colors.primary,
                                dotColor: designSystem.colors.primary,
                                selectedDayBackgroundColor: designSystem.colors.primary,
                              }}
                              markedDates={markedDates}
                            />
                            
                            <View style={styles.eventsSection}>
                              <Text style={styles.calendarSectionTitle}>Upcoming Events</Text>
                              {filteredEvents && filteredEvents.length > 0 ? (
                                filteredEvents.map(item => {
                                  const eventDate = new Date(item.date);
                                  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                                  return (
                                    <View key={item.id} style={styles.eventCard}>
                                      <View style={styles.dateBox}>
                                        <Text style={styles.dateDay}>{item.date.split('-')[2]}</Text>
                                        <Text style={styles.dateMonth}>{monthNames[eventDate.getMonth()]}</Text>
                                      </View>
                                      <View style={styles.eventInfo}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.eventTitle}>{item.title}</Text>
                                            {item.type === 'booking' && (
                                                <View style={{ backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BBF7D0' }}>
                                                    <Text style={{ fontSize: 8, fontWeight: '900', color: '#16A34A' }}>CONFIRMED BOOKING</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.eventSport}>{item.sport}</Text>
                                      </View>
                                    </View>
                                  );
                                })
                              ) : (
                                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                  <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>No events for this month</Text>
                                </View>
                              )}
                            </View>

                            <TouchableOpacity style={styles.calendarCloseBtnLarge} onPress={() => setIsCalendarModalVisible(false)}>
                                <Text style={styles.calendarCloseBtnText}>Close</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
    </SafeAreaView>
  );

  return isWeb ? (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center' }}>
      {content}
    </View>
  ) : content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  editBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#0F172A',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userInfo: {
    marginLeft: 20,
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  userHandle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#0F172A',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  roleText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: -20,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  verificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  verificationTitleText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  verificationRows: {
    gap: 12,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verificationValue: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16A34A',
    textTransform: 'uppercase',
  },
  verifyBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  verifyBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  otpModalContent: {
    backgroundColor: '#FFFFFF',
    width: '85%',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
  },
  otpIconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#FEF2F2',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  otpDescription: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  otpInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 24,
  },
  otpActions: {
    width: '100%',
    gap: 12,
  },
  otpVerifyBtn: {
    width: '100%',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  otpVerifyText: {
    color: '#FFFFFF',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  otpCancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  otpCancelText: {
    color: '#94A3B8',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
    marginLeft: 4,
  },
  menuSection: {
    paddingHorizontal: 24,
    marginTop: 32,
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  logoutItem: {
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  updateItem: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  versionText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  legalText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginTop: 8,
  },
  supportContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  supportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    paddingBottom: 0,
    alignItems: 'center',
  },
  supportTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  supportClose: {
    padding: 4,
  },
  walletModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    width: '90%',
    maxHeight: '80%',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    overflow: 'hidden',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
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
    color: designSystem.colors.primary,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  eventInfo: {
    paddingLeft: 15,
    justifyContent: 'center',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  eventSport: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  calendarCloseBtnLarge: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  calendarCloseBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarSectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
  },
  calendarModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    width: '100%',
  },
  calendarModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  calendarCloseBtn: {
    padding: 4,
  },
  walletTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  walletTriggerText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  syncOnline: {
    backgroundColor: '#F0FDF4',
  },
  syncOffline: {
    backgroundColor: '#FEF2F2',
  },
  syncText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  lastSyncText: {
    fontSize: 8,
    color: '#94A3B8',
    marginTop: 2,
    marginLeft: 4,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierGold: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FEF08A',
  },
  tierSilver: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  tierBronze: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  tierText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#334155',
  },
  editModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    width: '90%',
    padding: 32,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    position: 'relative',
  },
  editModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 30,
    marginTop: 10,
    textAlign: 'center',
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: 'bold',
    marginTop: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    marginTop: 8,
    padding: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  dropdownItem: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  dropdownItemActive: {
    backgroundColor: '#EEF2FF',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: '#6366F1',
    fontWeight: '900',
  },
  saveBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notificationBell: {
    position: 'relative',
    marginLeft: 'auto',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 10,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  notificationsModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    width: '90%',
    maxHeight: '80%',
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inlineVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inlineVerifyBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unreadNotification: {
    backgroundColor: '#F0F9FF',
    borderColor: '#E0F2FE',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  notificationText: {
    flex: 1,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  featureTile: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, alignItems: 'center' },
  featureIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  featureLabel: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  menuSection: { marginTop: 8 },
  notificationTitle: {
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 2,
  },
  notificationMessage: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  notificationDate: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  boldText: {
    fontWeight: '900',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    zIndex: 10,
  },
  clearBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  clearBtnText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
    marginTop: 16,
  },
  avatarGrid: {
    paddingVertical: 12,
    gap: 16,
    paddingHorizontal: 4,
  },
  avatarOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#F1F5F9',
    position: 'relative',
    padding: 2,
  },
  avatarOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  avatarOptionImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  selectedCheck: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  uploadImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderStyle: 'dashed',
  },
  uploadImageText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 24, // Added space after moved section
    gap: 12,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devToggleActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  devToggleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  devToggleTextActive: {
    color: '#FFFFFF',
  },
  updateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  updateIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  updateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  versionBadgeContainer: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
});


export default ProfileScreen;
