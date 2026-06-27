import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image,
  Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform, InteractionManager, SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { Sport } from '../types';
import SafeAvatar from '../components/SafeAvatar';
import * as ImagePicker from 'expo-image-picker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { PlayerSkillDashboard, PlayerPerformanceAnalytics, PlayerWalletDashboard, PlayerReferralDashboard } from '../components/PlayerProfileFeatures';
import CoachOnboardingModal from '../components/CoachOnboardingModal';
import CoachAvailabilityManager from '../components/CoachAvailabilityManager';
import { SupportTicketSystem } from '../components/SupportTicketSystem';
import DiagnosticsModal from '../components/DiagnosticsModal';
import config from '../config';
import logger from '../utils/logger';
import storage from '../utils/storage';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import ProfileHeader, { AvatarPlaceholder, getInitials } from '../components/ProfileHeader';
import ProfileMenuSection from '../components/ProfileMenuSection';
import { OTPVerificationModal, CalendarWidget } from '../components/ProfileSubComponents';
import AdminProfileModals from '../components/AdminProfileModals';
import ShareablePlayerCard from '../components/ShareablePlayerCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import styles from "./profile/ProfileScreen.styles";

const calculateAcademyTier = (uid, tournaments = []) => {
  const hostedCount = (tournaments || []).filter(t => t.creatorId === uid).length;
  if (hostedCount >= 5) return 'Gold';
  if (hostedCount >= 2) return 'Silver';
  return 'Bronze';
};





import { useAuth } from '../context/AuthContext';
import { useTournamentsStore, usePlayersStore, useSupportStore } from '../stores';
import { useEvaluationsStore } from '../stores/useEvaluationsStore';
import { useSync } from '../context/SyncContext';
import { useAdminStore as useAdmin } from '../stores/useAdminStore';
import { useApp } from '../context/AppContext';

const ProfileScreen = ({ navigation, route }) => {
  const { 
    currentUser: user, onUpdateUser, onLogout, onVerifyAccount, onTopUp, onMarkNotificationsRead 
  } = useAuth();
  const { tournaments } = useTournamentsStore();
  const { players } = usePlayersStore();
  const { 
    supportTickets, onSaveTicket, onUpdateTicketStatus, onReplyTicket, onRetryMessage, onMarkSeen 
  } = useSupportStore();
  const { evaluations } = useEvaluationsStore();
  const { 
    isCloudOnline, isUsingCloud, lastSyncTime, onManualSync, onToggleCloud 
  } = useSync();
  const { onUploadLogs, isUploadingLogs, pushStatus } = useAdmin();
  const { appVersion, setShowNotifications } = useApp();
  

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (isFocused) {
      logger.logAction('SCREEN_VIEW', { screen: 'Profile' });
    }
  }, [isFocused]);
  const [showCoachOnboarding, setShowCoachOnboarding] = useState(false);
  const [showCoachAvailability, setShowCoachAvailability] = useState(false);
  const [activeSupportModal, setActiveSupportModal] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [sessionCustomAvatar, setSessionCustomAvatar] = useState(null); // Persistence for session
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(null); // 'email' | 'phone'
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUpdatingBinary, setIsUpdatingBinary] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState(null);

  // 🕐 [SHIFT MANAGEMENT] (v2.6.673): Profile shift status state
  const [profileShiftStatus, setProfileShiftStatus] = useState(null);
  const [profileShiftCheckinRounded, setProfileShiftCheckinRounded] = useState(null);
  const [profileShiftCheckoutDue, setProfileShiftCheckoutDue] = useState(null);
  const [profileShiftLoading, setProfileShiftLoading] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [checkoutJustification, setCheckoutJustification] = useState('');
  const [isEarlyCheckout, setIsEarlyCheckout] = useState(false);

  // Fetch shift status on focus
  useEffect(() => {
    if (!isFocused || !user || user.role !== 'support') return;
    const fetchShift = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const headers = { 'x-ace-api-key': config.PUBLIC_APP_ID, 'x-user-id': user.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${config.API_BASE_URL}/api/v1/support/shift-status`, { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setProfileShiftStatus(data.shiftStatus);
          setProfileShiftCheckinRounded(data.shiftCheckinRounded);
          setProfileShiftCheckoutDue(data.shiftCheckoutDue);
        }
      } catch (e) { console.warn('[Profile] Shift fetch error:', e.message); }
    };
    fetchShift();
  }, [isFocused, user]);

  // Sync shift status from global players store (for when it changes externally)
  useEffect(() => {
    if (user && players) {
      const myPlayer = players.find(p => String(p.id) === String(user.id));
      if (myPlayer) {
        if (myPlayer.shiftStatus !== undefined) {
           setProfileShiftStatus(myPlayer.shiftStatus);
        }
        if (myPlayer.shiftCheckinRounded !== undefined) {
           setProfileShiftCheckinRounded(myPlayer.shiftCheckinRounded);
        }
        if (myPlayer.shiftCheckoutDue !== undefined) {
           setProfileShiftCheckoutDue(myPlayer.shiftCheckoutDue);
        }
      }
    }
  }, [players, user]);

  const handleProfileShiftAction = async (action, justification = '') => {
    if (profileShiftLoading) return;
    setProfileShiftLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID, 'x-user-id': user.id };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const endpoint = action === 'checkin' ? 'check-in' : 'check-out';
      const payload = action === 'checkout' ? { isAutoCheckout: false, justification } : {};
      const res = await fetch(`${config.API_BASE_URL}/api/v1/support/${endpoint}`, {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (action === 'checkin') {
          setProfileShiftStatus('on_shift');
          setProfileShiftCheckinRounded(data.checkinTime);
          setProfileShiftCheckoutDue(data.checkoutDue);
          Alert.alert('✅ Checked In!', `Shift started at ${new Date(data.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}.`);
        } else {
          setProfileShiftStatus('off_shift');
          const totalH = Math.floor(data.totalShiftMs / 3600000);
          const totalM = Math.floor((data.totalShiftMs % 3600000) / 60000);
          setCheckoutModalVisible(false);
          if (Platform.OS !== 'web') {
            Alert.alert('✅ Checked Out!', `Total shift: ${totalH}h ${totalM}m. Have a great day! 🎉`);
          }
        }
      } else {
        Alert.alert('Error', data.error || 'Unknown error');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setProfileShiftLoading(false);
    }
  };

  const activeApiUrl = isUsingCloud ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;

  // Optimized Update Check logic: Debounced and Focus-aware
  useEffect(() => {
    if (!isFocused) return;

    const checkUpdates = async () => {
      try {
        const response = await fetch(`${activeApiUrl}/api/status`, {
          headers: { 'x-ace-api-key': config.PUBLIC_APP_ID || 'ace-secret-key-1717' }
        });
        const data = await response.json();
        if (data && data.latestAppVersion) {
            setLatestVersion(data.latestAppVersion);
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
              setUpdateAvailable(isNewer);
            }
        }
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    };
    
    // Defer the heavy network check until the screen transition animation is complete
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      checkUpdates();
    });

    return () => interactionTask.cancel();
  }, [isFocused, appVersion, activeApiUrl]);

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

  // Hydrate from URL directly in state (v2.6.460 hardened)
  const [showSupport, setShowSupport] = useState(() => {
    if (Platform.OS === 'web') {
      const view = new URLSearchParams(window.location.search).get('view');
      return view === 'support';
    }
    return false;
  });

  const [showEditProfile, setShowEditProfile] = useState(() => {
    if (Platform.OS === 'web') {
      const view = new URLSearchParams(window.location.search).get('view');
      return view === 'edit_profile';
    }
    return false;
  });

  const [urlTicketId, setUrlTicketId] = useState(() => {
    if (Platform.OS === 'web') {
      return new URLSearchParams(window.location.search).get('ticketId');
    }
    return null;
  });

  // Handle auto-open for Edit Profile and Support Tickets from navigation params
  useEffect(() => {
    try {
      const params = route?.params;
      if (params) {
        if (params.autoEdit) {
          setShowEditProfile(true);
          navigation.setParams({ autoEdit: false });
        }
        if (params.selectedTicketId) {
          setUrlTicketId(params.selectedTicketId);
          setShowSupport(true);
          navigation.setParams({ selectedTicketId: null });
        }
      }
    } catch (e) {
      console.warn("[ProfileScreen] Navigation state access failed:", e);
    }
  }, [route?.params]);

  // 🛡️ [URL_PERSISTENCE] (v2.6.458): Sync view state with URL
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      if (showSupport) currentUrl.searchParams.set('view', 'support');
      else if (showEditProfile) currentUrl.searchParams.set('view', 'edit_profile');
      else currentUrl.searchParams.delete('view');
      window.history.pushState({}, '', currentUrl.toString());
    }
  }, [showSupport, showEditProfile]);

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



  // Top-level Protection
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const academyTier = user?.role === 'academy' ? calculateAcademyTier(user.id, tournaments) : null;
  const isWeb = Platform.OS === 'web';

  const [message, setMessage] = useState('');
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7));

  const MOCK_EVENTS = [
    { id: '1', title: 'Bangalore Open TT', date: '2026-03-25', sport: 'Table Tennis', type: 'tournament' },
    { id: '2', title: 'Whitefield Badminton League', date: '2026-03-28', sport: 'Badminton', type: 'tournament' },
    { id: '3', title: 'Karnataka State Ranking', date: '2026-04-10', sport: 'Badminton', type: 'tournament' },
    { id: '4', title: 'Mysore Open', date: '2026-04-22', sport: 'Table Tennis', type: 'tournament' },
    { id: '5', title: 'Summer Smash', date: '2026-05-05', sport: 'Cricket', type: 'tournament' },
    { id: '6', title: 'May Day Cup', date: '2026-05-15', sport: 'Badminton', type: 'tournament' },
  ];

  const MOCK_CONFIRMED_BOOKINGS = user?.role === 'coach' ? [
    { id: 'cb1', title: 'Coaching: Aaryan Sharma', date: '2026-03-26', sport: 'Tennis', type: 'booking' },
    { id: 'cb2', title: 'Coaching: Rohan G.', date: '2026-03-28', sport: 'Cricket', type: 'booking' },
  ] : [];

  const allEvents = [...MOCK_EVENTS, ...MOCK_CONFIRMED_BOOKINGS];

  const today = new Date().toISOString().split('T')[0];
  const filteredEvents = allEvents.filter(event => {
    if (selectedCalendarDate) {
      return event.date === selectedCalendarDate;
    }
    const eventMonth = event.date.substring(0, 7);
    const date = new Date(currentMonth + '-01');
    const nextMonthDate = new Date(date.setMonth(date.getMonth() + 1));
    const nextMonth = nextMonthDate.toISOString().substring(0, 7);
    
    const isThisOrNextMonth = eventMonth === currentMonth || eventMonth === nextMonth;
    return isThisOrNextMonth && event.date >= today;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const getCalendarTitle = () => {
    if (!selectedCalendarDate) return 'Upcoming Events';
    const d = new Date(selectedCalendarDate);
    const dateLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return selectedCalendarDate >= today 
      ? `Upcoming Events on ${dateLabel}`
      : `Events on ${dateLabel}`;
  };

  const markedDates = {};
  allEvents.forEach(event => {
    markedDates[event.date] = { 
        marked: true, 
        dotColor: event.type === 'booking' ? '#22C55E' : colors.primary 
    };
  });

  if (selectedCalendarDate) {
    markedDates[selectedCalendarDate] = {
      ...markedDates[selectedCalendarDate],
      selected: true,
      selectedColor: colors.primary.base,
      selectedTextColor: '#fff'
    };
  }
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
      setEditEmail(user.email || ''); // Ensure email stays in sync
      setEditPhone(user.phone || ''); // Ensure phone stays in sync
      setEditAvatar(user.avatar || '');
      setEditManagedSports(user.managedSports || []);
      setImageError(false);
      logger.logAction('USER_AVATAR_INITIALIZED', { id: user.id, avatar: user.avatar });
    }
  }, [user?.id, user?.avatar, user?.name, user?.email, user?.phone, user?.managedSports]);

  // Load persisted session avatar on mount
  useEffect(() => {
    const loadSessionAvatar = async () => {
      const saved = await syncOrchestrator.getSystemFlag('sessionCustomAvatar');
      if (saved) {
        setSessionCustomAvatar(saved);
        logger.logAction('SESSION_AVATAR_HYDRATED', { url: saved });
      }
    };
    loadSessionAvatar();
  }, []);

  // Save to storage when it changes
  useEffect(() => {
    const saveSessionAvatar = async () => {
      if (sessionCustomAvatar) {
        await syncOrchestrator.setSystemFlag('sessionCustomAvatar', sessionCustomAvatar);
      }
    };
    saveSessionAvatar();
  }, [sessionCustomAvatar]);

  const suggestedAvatars = [
    'https://api.dicebear.com/7.x/avataaars/png?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Milo',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/png?seed=Willow',
  ];

  // --- 🛡️ AVATAR HISTORY LOGIC (v2.6.2) ---
  const normalizeAvatarUrl = (url) => {
    if (!url) return '';
    return String(url).split(/[?&]v=/)[0].replace(/\?$/, '');
  };

  const normalizedSuggested = suggestedAvatars.map(normalizeAvatarUrl);
  const currentHistory = user?.avatarHistory || [];
  
  // Combine all sources in order: 
  // 1. Current Preview (editAvatar)
  // 2. User's active avatar
  // 3. User's historical custom avatars
  // 4. Default suggested avatars
  let candidateAvatars = [];
  if (editAvatar) candidateAvatars.push(editAvatar);
  if (user?.avatar) candidateAvatars.push(user.avatar);
  if (sessionCustomAvatar) candidateAvatars.push(sessionCustomAvatar);
  if (user?.lastCustomAvatar) candidateAvatars.push(user.lastCustomAvatar);
  candidateAvatars = [...candidateAvatars, ...currentHistory, ...suggestedAvatars];

  // Unique by base URL while preserving chronological order
  const uniqueAvatarMap = new Map();
  candidateAvatars.forEach(url => {
    if (!url) return;
    const base = normalizeAvatarUrl(url);
    if (!uniqueAvatarMap.has(base)) {
      uniqueAvatarMap.set(base, url);
    }
  });

  const allAvatars = Array.from(uniqueAvatarMap.values());


  // Change Password States
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const pickImage = async () => {
    try {
      if (__DEV__) console.log("📸 Requesting media library permissions...");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      setIsPickingImage(true);
      if (__DEV__) console.log("📸 Opening image library...");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (__DEV__) console.log("📸 Image pick result:", JSON.stringify(result));
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


  // OTP Modal was extracted to components/ProfileSubComponents.js
  const content = (
    <View style={[styles.container, isWeb && { maxWidth: 900, alignSelf: 'center', width: '100%', backgroundColor: '#FFFFFF', padding: 24, marginVertical: 16, borderRadius: 24, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 40, overflow: 'hidden', flex: 1 }, { paddingTop: Math.max(insets.top, 16) }]}>
      <ScrollView 
        testID="profile.scrollview"
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        {(user?.role === 'admin' || user?.role === 'support') && (
          <TouchableOpacity 
            onPress={() => navigation.navigate(user?.role === 'admin' ? 'Admin' : 'Support')} 
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
          >
            <Ionicons name="arrow-back" size={16} color="#475569" />
            <Text style={{ color: '#475569', fontWeight: '600', fontSize: 13, marginLeft: 6, letterSpacing: 0.3 }}>
              Back to {user?.role === 'admin' ? 'Admin Hub' : 'Support Dashboard'}
            </Text>
          </TouchableOpacity>
        )}

        <ProfileHeader
          user={user}
          academyTier={academyTier}
          imageError={imageError}
          isCloudOnline={isCloudOnline}
          isUsingCloud={isUsingCloud}
          lastSyncTime={lastSyncTime}
          onManualSync={onManualSync}
          onAvatarPress={() => setShowAvatarPicker(true)}
          onNotificationPress={() => setShowNotifications(true)}
          onWalletPress={() => setShowWalletModal(true)}
          logger={logger}
        />

        {/* Skill Dashboard — Hidden for support role */}
        {user?.role !== 'admin' && user?.role !== 'academy' && user?.role !== 'coach' && user?.role !== 'support' && (
          <View style={styles.section}>
              <Text style={styles.sectionTitle}>Skills</Text>
              {renderUpdateCard()}
              <PlayerSkillDashboard 
                user={user} 
                latestEvaluation={
                  (evaluations || [])
                    .filter(e => e.playerId === user.id)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
                }
              />
              
              <View style={{ marginTop: 24 }}>
                <PlayerPerformanceAnalytics user={user} />
              </View>
          </View>
        )}

        {(user?.role === 'admin' || user?.role === 'academy' || user?.role === 'coach') && renderUpdateCard()}

        {/* --- Admin: Control Center --- */}
        {user?.role === 'admin' ? (
          <View style={styles.section}>
            {renderUpdateCard()}
            <Text style={styles.sectionTitle}>Admin Control Center</Text>
            <View style={styles.featureGrid}>
              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => navigation.navigate('Admin')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="settings-outline" size={24} color="#0F172A" />
                </View>
                <Text style={styles.featureLabel}>Admin Hub</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('team_directory')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="people-outline" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.featureLabel}>Team Directory</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('announcements')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="megaphone-outline" size={24} color="#7C3AED" />
                </View>
                <Text style={styles.featureLabel}>Announcements</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => navigation.navigate('Insights')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="bar-chart-outline" size={24} color="#4F46E5" />
                </View>
                <Text style={styles.featureLabel}>Analytics</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('audit_logs')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#FFFBEB' }]}>
                  <Ionicons name="shield-outline" size={24} color="#D97706" />
                </View>
                <Text style={styles.featureLabel}>Audit Logs</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('org_settings')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F0FDFA' }]}>
                  <Ionicons name="cog-outline" size={24} color="#0D9488" />
                </View>
                <Text style={styles.featureLabel}>Org Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('security')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="lock-closed-outline" size={24} color="#EF4444" />
                </View>
                <Text style={styles.featureLabel}>Security & Access</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setShowSupport(true)}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#FDF2F8' }]}>
                  <Ionicons name="ticket-outline" size={24} color="#DB2777" />
                </View>
                <Text style={styles.featureLabel}>Support Tickets</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('leave_request')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="calendar-outline" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.featureLabel}>HR & Approvals</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('org_chat')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="chatbubbles-outline" size={24} color="#16A34A" />
                </View>
                <Text style={styles.featureLabel}>Org Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : user?.role === 'support' ? (
          <View style={styles.section}>
            {renderUpdateCard()}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.featureGrid}>
              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('leave_request')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="calendar-outline" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.featureLabel}>
                  {user?.supportLevel === 'Manager' ? 'Leaves & Approvals' : 'Leave Request'}
                </Text>
              </TouchableOpacity>

              {user?.supportLevel === 'Manager' && (
                <TouchableOpacity 
                  style={styles.featureTile} 
                  onPress={() => navigation.navigate('AdminDashboard', { subTab: 'shifts' })}
                >
                  <View style={[styles.featureIcon, { backgroundColor: '#FDF4FF' }]}>
                    <Ionicons name="people-outline" size={24} color="#C026D3" />
                  </View>
                  <Text style={styles.featureLabel}>My Team</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => navigation.navigate('OrgChat')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="chatbubbles-outline" size={24} color="#16A34A" />
                </View>
                <Text style={styles.featureLabel}>Org Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('my_attendance')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="time-outline" size={24} color="#7C3AED" />
                </View>
                <Text style={styles.featureLabel}>My Attendance</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('payslips')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#FFF7ED' }]}>
                  <Ionicons name="document-text-outline" size={24} color="#EA580C" />
                </View>
                <Text style={styles.featureLabel}>Payslips</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('holidays')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="sunny-outline" size={24} color="#DC2626" />
                </View>
                <Text style={styles.featureLabel}>Holidays</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.featureTile} 
                onPress={() => setActiveSupportModal('documents')}
              >
                <View style={[styles.featureIcon, { backgroundColor: '#F0FDFA' }]}>
                  <Ionicons name="folder-open-outline" size={24} color="#0D9488" />
                </View>
                <Text style={styles.featureLabel}>Documents</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* --- Original Expert Panel Features (Players/Coach/Academy) --- */
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expert Panel Features</Text>
            <View style={styles.featureGrid}>
                <TouchableOpacity 
                    style={styles.featureTile} 
                    onPress={() => navigation.navigate('Matchmaking')}
                >
                    <View style={[styles.featureIcon, { backgroundColor: '#EEF2FF' }]}>
                        <Ionicons name={user?.role === 'coach' ? 'calendar' : 'people'} size={24} color="#4F46E5" />
                    </View>
                    <Text style={styles.featureLabel}>
                        {user?.role === 'coach' ? 'Bookings' : 'Matchmaking'}
                    </Text>
                </TouchableOpacity>

                {user?.role !== 'coach' && (
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

                {user?.role === 'academy' && (
                  <TouchableOpacity style={styles.featureTile} onPress={() => navigation.navigate('Subscriptions')}>
                      <View style={[styles.featureIcon, { backgroundColor: '#FDF2F8' }]}>
                          <Ionicons name="card" size={24} color="#DB2777" />
                      </View>
                      <Text style={styles.featureLabel}>Sub Plan</Text>
                  </TouchableOpacity>
                )}
            </View>
          </View>
        )}

        {/* 🕐 [SHIFT STATUS CARD] (v2.6.673) — Only for support employees */}
        {user?.role === 'support' && (
          <View style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: profileShiftStatus === 'on_shift' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.2)' }}>
            <LinearGradient colors={profileShiftStatus === 'on_shift' ? ['#065F46', '#047857'] : ['#312E81', '#4338CA']} style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name={profileShiftStatus === 'on_shift' ? 'checkmark-circle' : 'time-outline'} size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900' }}>Shift Status</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                    {profileShiftStatus === 'on_shift' ? `On Shift since ${profileShiftCheckinRounded ? new Date(profileShiftCheckinRounded).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}` : 'Not checked in'}
                  </Text>
                </View>
                <View style={{ backgroundColor: profileShiftStatus === 'on_shift' ? '#10B981' : '#6366F1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{profileShiftStatus === 'on_shift' ? 'ACTIVE' : 'INACTIVE'}</Text>
                </View>
              </View>
              {profileShiftStatus === 'on_shift' && profileShiftCheckoutDue && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <Ionicons name="alarm-outline" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' }}>Checkout due by {new Date(profileShiftCheckoutDue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (profileShiftStatus === 'on_shift') {
                    if (profileShiftCheckinRounded) {
                      const durMs = Date.now() - new Date(profileShiftCheckinRounded).getTime();
                      if (durMs < 7 * 60 * 60 * 1000) {
                        setIsEarlyCheckout(true);
                      } else {
                        setIsEarlyCheckout(false);
                      }
                    } else {
                      setIsEarlyCheckout(false);
                    }
                    setCheckoutJustification('');
                    setCheckoutModalVisible(true);
                  } else {
                    handleProfileShiftAction('checkin');
                  }
                }}
                disabled={profileShiftLoading}
                activeOpacity={0.8}
                style={{ backgroundColor: profileShiftStatus === 'on_shift' ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)', paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name={profileShiftStatus === 'on_shift' ? 'log-out-outline' : 'checkmark-circle-outline'} size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '900' }}>
                  {profileShiftLoading ? 'Processing...' : profileShiftStatus === 'on_shift' ? 'Check Out' : 'Check In Now'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        <ProfileMenuSection
          user={user}
          isUpdatingBinary={isUpdatingBinary}
          setIsUpdatingBinary={setIsUpdatingBinary}
          onEditProfile={() => setShowEditProfile(true)}
          onDiagnostics={() => setShowDiagnostics(true)}
          onChangePassword={() => setShowChangePassword(true)}
          onReferral={() => setShowReferralModal(true)}
          onShareStats={() => setShowShareCard(true)}
          onSupport={(signal) => {
             if (signal === 'admin_hub') {
               // Support users can report issues via the ticket system; admin users go to admin hub
               if (user?.role === 'support') {
                 setShowSupport(true);
               } else {
                 navigation.navigate('Admin', { subTab: 'grievances' });
               }
             } else {
               setShowSupport(true);
             }
          }}
          onCoachOnboarding={() => setShowCoachOnboarding(true)}
          onCoachAvailability={() => setShowCoachAvailability(true)}
          onLogout={onLogout}
          onOpenModal={(modalId) => setActiveSupportModal(modalId)}
        />

        {/* Shareable Player Stats Card Modal */}
        <ShareablePlayerCard
          visible={showShareCard}
          onClose={() => setShowShareCard(false)}
          user={user}
          tournaments={tournaments}
        />

        <View style={styles.footer}>
            <Text style={styles.versionText}>AceTrack v{appVersion || '2.0.1'} (Mobile)</Text>
            
            {/* 🛡️ [NOTIFY_DEBUG] Push Status Indicator (v2.6.96) */}
            <View style={styles.pushStatusContainer}>
                <View style={[
                    styles.pushStatusDot, 
                    { backgroundColor: pushStatus?.status === 'success' ? '#22C55E' : 
                                       pushStatus?.status === 'requesting' ? '#3B82F6' : 
                                       pushStatus?.status === 'failed' || pushStatus?.status === 'error' ? '#EF4444' : '#94A3B8' }
                ]} />
                <Text style={styles.pushStatusText}>
                    Push Delivery: {
                        pushStatus?.status === 'idle' ? 'Not Started' :
                        pushStatus?.status === 'requesting' ? 'Requesting Token...' :
                        pushStatus?.status === 'success' ? 'Active & Healthy' :
                        pushStatus?.status === 'failed' ? 'Registration Failed' :
                        pushStatus?.status === 'error' ? `Critical Error: ${pushStatus?.error || 'Unknown'}` : 'Unknown'
                    }
                </Text>
            </View>

            <Text style={styles.legalText}>Privacy Policy • Terms of Service</Text>

            {/* 🧪 [E2E_BACKDOOR] Hidden test triggers for Detox (v2.6.121) */}
            {(__DEV__ || process.env.NODE_ENV === 'test') && (
              <View style={styles.testBackdoor}>
                <TouchableOpacity 
                  testID="test.inject.hijack"
                  onPress={() => global.TEST_API?.injectMaliciousUpdate('admin', 'FAKE ADMIN HIJACK')}
                >
                  <Text style={styles.testBackdoorText}>Inject Hijack</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  testID="test.inject.expired"
                  onPress={() => global.TEST_API?.injectExpiredData(user.id)}
                >
                  <Text style={styles.testBackdoorText}>Inject Expired</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  testID="test.inject.unread"
                  onPress={() => global.TEST_API?.injectSyncEvent('matchmaking', [{ 
                    id: 'new_e2e_' + Date.now(), 
                    senderId: 'opponent', 
                    receiverId: user.id, 
                    proposedDate: '2026-12-31', 
                    proposedTime: '11:00 AM', 
                    sport: 'Tennis', 
                    status: 'Pending', 
                    isNew: true 
                  }])}
                >
                  <Text style={styles.testBackdoorText}>Inject Unread</Text>
                </TouchableOpacity>
              </View>
            )}
        </View>

      </ScrollView>

      {activeSupportModal && (
        <AdminProfileModals 
          visibleModal={activeSupportModal}
          onClose={() => setActiveSupportModal(null)}
          user={user}
        />
      )}

      {showCoachAvailability && (
        <CoachAvailabilityManager
          visible={showCoachAvailability}
          onClose={() => setShowCoachAvailability(false)}
        />
      )}

      {showDiagnostics && (
        <DiagnosticsModal 
          visible={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
          onUpload={onUploadLogs}
          isUploading={isUploadingLogs}
        />
      )}

      {/* Checkout Modal */}
      <CheckoutModal {...{ checkoutModalVisible, setCheckoutModalVisible, isCheckingOut, handleWebCheckout, showDialog }} />
      {/* Support System Modal */}
      {showSupport && (
      <SupportModal {...{ showSupport, setShowSupport, currentUser, userTickets, handleCreateTicket, handleReplyToTicket, handleResolvePrompt, handleUpdateTicketStatus, handleRateTicket, handleMarkSeen }} />


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
      {showWalletModal && (
      <WalletModal {...{ showWalletModal, setShowWalletModal, amountInput, setAmountInput, isProcessingPayment, setCheckoutModalVisible }} />

      {showReferralModal && (
      <ReferralModal {...{ showReferralModal, setShowReferralModal, referralCode, copyToClipboard }} />

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
      <AvatarPickerModal {...{ showAvatarPicker, setShowAvatarPicker, avatarThemes, activeAvatarCategory, setActiveAvatarCategory, getAvatarUrl, handleSaveAvatar, isSavingAvatar }} />

      {/* Edit Profile Modal */}
      {showEditProfile && (
      <EditProfileModal {...{ showEditProfile, setShowEditProfile, editForm, setEditForm, handleSaveProfile, isSaving }} />

      {/* Change Password Modal */}
      {showChangePassword && (
      <ChangePasswordModal {...{ showChangePassword, setShowChangePassword, passwordForm, setPasswordForm, handleChangePassword, isChangingPassword, showPasswordMap, setShowPasswordMap }} />

            {/* Calendar Modal */}
            <CalendarWidget
              isCalendarModalVisible={isCalendarModalVisible}
              setIsCalendarModalVisible={setIsCalendarModalVisible}
              selectedCalendarDate={selectedCalendarDate}
              setSelectedCalendarDate={setSelectedCalendarDate}
              currentMonth={currentMonth}
              setCurrentMonth={setCurrentMonth}
              filteredEvents={filteredEvents}
              markedDates={markedDates}
              getCalendarTitle={getCalendarTitle}
            />
    </View>
  );

  const fullContent = (
    <View style={{ flex: 1 }}>
      {content}
      {showVerifyModal && (
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
        />
      )}
    </View>
  );

  return isWeb ? (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center' }}>
      {fullContent}
    </View>
  ) : fullContent;
};


// Styles extracted to ./profile/ProfileScreen.styles.js
