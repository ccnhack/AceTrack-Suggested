import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Image, TextInput, Platform, useWindowDimensions,
  Modal, Alert, Animated
} from 'react-native';
import { colors, shadows } from '../theme/designSystem';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AdminGrievancesPanel } from '../components/AdminGrievancesPanel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { usePlayersStore } from '../stores';
import { useSupportStore } from '../stores';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import { useCommsStore } from '../stores/useCommsStore';
import config from '../config';

// 🕐 [SHIFT MANAGEMENT UTILS] (v2.6.673)
function roundToNearest30(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  if (minutes < 15) {
    d.setMinutes(0, 0, 0);
  } else if (minutes < 45) {
    d.setMinutes(30, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


const SupportDashboardScreen = ({ navigation, route }) => {
  const { players } = usePlayersStore();
  const { supportTickets, onReplyTicket, onUpdateTicketStatus, onMarkSeen, onReassignTicket } = useSupportStore();
  const { isCloudOnline, isUsingCloud, lastSyncTime, onManualSync } = useSync();
  const { currentUser } = useAuth();
  
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isSmallScreen = windowWidth < 1024; // 📱 [RESPONSIVE] (v2.6.463)
  const [isWebSidebarOpen, setIsWebSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [urlTicketId, setUrlTicketId] = useState(() => {
    if (Platform.OS === 'web') {
      const tid = new URLSearchParams(window.location.search).get('ticketId');
      if (tid) console.log(`[SupportDashboard] [INIT] Found ticketId in URL: ${tid}`);
      return tid;
    }
    return null;
  });

  // Keep URL in sync with manual selection (v2.6.460)
  const handleTicketSelect = (id) => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      if (id) {
        currentUrl.searchParams.set('ticketId', id);
      } else {
        currentUrl.searchParams.delete('ticketId');
      }
      window.history.pushState({}, '', currentUrl.toString());
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 🕐 SHIFT CHECK-IN / CHECK-OUT STATE (v2.6.673)
  // ═══════════════════════════════════════════════════════════════
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [shiftStatus, setShiftStatus] = useState(null);
  const [shiftCheckinRounded, setShiftCheckinRounded] = useState(null);
  const [shiftCheckoutDue, setShiftCheckoutDue] = useState(null);
  const [shortLeaves, setShortLeaves] = useState([]);
  const [showCheckoutBanner, setShowCheckoutBanner] = useState(false);
  const [checkoutCountdown, setCheckoutCountdown] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkoutDismissedUntilRef = useRef(0);
  const autoCheckoutFiredRef = useRef(false);
  const bannerPulse = useRef(new Animated.Value(0)).current;

  // Short Leave State
  const [showShortLeaveModal, setShowShortLeaveModal] = useState(false);
  const [showAllLeavesModal, setShowAllLeavesModal] = useState(false);
  const [shortLeaveForm, setShortLeaveForm] = useState({ id: null, date: getLocalDateStr(), startTime: '14:00', endTime: '15:00', reason: '' });
  const [shortLeaveLoading, setShortLeaveLoading] = useState(false);

  // Fetch shift status on mount
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'support') return;
    
    const fetchShiftStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const headers = { 'x-ace-api-key': config.PUBLIC_APP_ID, 'x-user-id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(`${config.API_BASE_URL}/api/v1/support/shift-status`, {
          headers, credentials: 'include'
        });
        
        if (res.ok) {
          const data = await res.json();
          setShiftStatus(data.shiftStatus);
          setShiftCheckinRounded(data.shiftCheckinRounded);
          setShiftCheckoutDue(data.shiftCheckoutDue);
          setShortLeaves(data.shortLeaves || []);
          
          // If not on shift, check if we should show the check-in modal
          if (data.shiftStatus !== 'on_shift') {
            let hasCheckedInToday = false;
            if (data.shiftCheckinRounded) {
              const checkinDate = new Date(data.shiftCheckinRounded);
              const localCheckinStr = `${checkinDate.getFullYear()}-${String(checkinDate.getMonth() + 1).padStart(2, '0')}-${String(checkinDate.getDate()).padStart(2, '0')}`;
              if (localCheckinStr === getLocalDateStr()) {
                hasCheckedInToday = true;
              }
            }

            const todayKey = `checkin_muted_${currentUser.id}_${getLocalDateStr()}`;
            const isMuted = await AsyncStorage.getItem(todayKey);
            if (!isMuted && !hasCheckedInToday) {
              setShowCheckinModal(true);
            }
          }
        }
      } catch (e) {
        console.warn('[Shift] Failed to fetch shift status:', e.message);
      }
    };
    
    fetchShiftStatus();
  }, [currentUser]);

  // 🕐 Checkout banner timer — checks every 30s
  useEffect(() => {
    if (!shiftCheckoutDue || shiftStatus !== 'on_shift') {
      setShowCheckoutBanner(false);
      return;
    }

    const checkBanner = () => {
      const now = Date.now();
      const checkinTime = new Date(shiftCheckinRounded).getTime();
      const dueTime = new Date(shiftCheckoutDue).getTime();
      const BANNER_START_MS = 7.5 * 60 * 60 * 1000; // 7h 30m
      const GRACE_END_MS = 8.25 * 60 * 60 * 1000;   // 8h 15m

      const elapsedMs = now - checkinTime;

      if (elapsedMs >= BANNER_START_MS && now > checkoutDismissedUntilRef.current) {
        setShowCheckoutBanner(true);

        // Auto-checkout at 8h 15m
        if (elapsedMs >= GRACE_END_MS && !autoCheckoutFiredRef.current) {
          autoCheckoutFiredRef.current = true;
          handleCheckout(true);
          return;
        }

        // Dynamic countdown message
        const remainingMs = dueTime - now;
        if (remainingMs > 0) {
          const mins = Math.ceil(remainingMs / 60000);
          setCheckoutCountdown(`Your shift ends in ${mins} minute${mins !== 1 ? 's' : ''}! 🎉`);
        } else {
          const overtimeMins = Math.floor((now - dueTime) / 60000);
          setCheckoutCountdown(`Shift complete! ${overtimeMins > 0 ? `(${overtimeMins}m overtime)` : 'Time to check out.'}`);
        }
      }
    };

    checkBanner();
    const interval = setInterval(checkBanner, 30000);
    return () => clearInterval(interval);
  }, [shiftCheckoutDue, shiftStatus, shiftCheckinRounded]);

  // Banner pulse animation
  useEffect(() => {
    if (showCheckoutBanner) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bannerPulse, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(bannerPulse, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      ).start();
    } else {
      bannerPulse.setValue(0);
    }
  }, [showCheckoutBanner]);

  // 🕐 Handle Check-In
  const handleCheckin = useCallback(async () => {
    if (checkinLoading) return;
    setCheckinLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID, 
        'x-user-id': currentUser.id 
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${config.API_BASE_URL}/api/v1/support/check-in`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({})
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setShiftStatus('on_shift');
        setShiftCheckinRounded(data.checkinTime);
        setShiftCheckoutDue(data.checkoutDue);
        setShowCheckinModal(false);
        autoCheckoutFiredRef.current = false;
        
        Alert.alert(
          '✅ Checked In!',
          `Shift started at ${formatTime(data.checkinTime)}.\nCheckout due by ${formatTime(data.checkoutDue)}.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Check-In Failed', data.error || 'Unknown error');
      }
    } catch (e) {
      Alert.alert('Error', `Check-in failed: ${e.message}`);
    } finally {
      setCheckinLoading(false);
    }
  }, [currentUser, checkinLoading]);

  // 🕐 Handle Check-Out
  const handleCheckout = useCallback(async (isAuto = false) => {
    if (checkoutLoading) return;
    
    const doCheckout = async () => {
      setCheckoutLoading(true);
      try {
        const token = await AsyncStorage.getItem('userToken');
        const headers = { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID, 
          'x-user-id': currentUser.id 
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${config.API_BASE_URL}/api/v1/support/check-out`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ isAutoCheckout: isAuto })
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
          setShiftStatus('off_shift');
          setShowCheckoutBanner(false);
          
          const totalH = Math.floor(data.totalShiftMs / 3600000);
          const totalM = Math.floor((data.totalShiftMs % 3600000) / 60000);
          const overtimeM = Math.floor(data.overtimeMs / 60000);
          
          Alert.alert(
            isAuto ? '⏰ Auto Checkout' : '✅ Checked Out!',
            `Total shift: ${totalH}h ${totalM}m.${overtimeM > 0 ? `\nOvertime: ${overtimeM} min.` : ''}\nNo new tickets will be assigned to you.\nHave a great day! 🎉`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Checkout Failed', data.error || 'Unknown error');
        }
      } catch (e) {
        Alert.alert('Error', `Checkout failed: ${e.message}`);
      } finally {
        setCheckoutLoading(false);
      }
    };

    if (isAuto) {
      doCheckout();
    } else {
      if (Platform.OS === 'web') {
        if (window.confirm('🚪 Confirm Checkout\n\nAre you sure you want to end your shift?\nNo new tickets will be assigned to you after checkout.')) {
          doCheckout();
        }
      } else {
        Alert.alert(
          '🚪 Confirm Checkout',
          'Are you sure you want to end your shift?\nNo new tickets will be assigned to you after checkout.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Check Out', style: 'destructive', onPress: doCheckout }
          ]
        );
      }
    }
  }, [currentUser, checkoutLoading]);

  // 🕐 Handle Mute for Today
  const handleMuteForToday = useCallback(async () => {
    try {
      const todayKey = `checkin_muted_${currentUser.id}_${getLocalDateStr()}`;
      await AsyncStorage.setItem(todayKey, 'true');
      setShowCheckinModal(false);
    } catch (e) {
      console.warn('[Shift] Mute failed:', e.message);
      setShowCheckinModal(false);
    }
  }, [currentUser]);

  // 🕐 Handle Short Leave Request
  const handleShortLeaveSubmit = async () => {
    if (!shortLeaveForm.reason.trim()) {
      Alert.alert('Error', 'Please provide a reason for your short leave.');
      return;
    }
    
    setShortLeaveLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID, 
        'x-user-id': currentUser.id 
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${config.API_BASE_URL}/api/v1/support/request-short-leave`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          leaveId: shortLeaveForm.id,
          date: shortLeaveForm.date,
          startTime: shortLeaveForm.startTime,
          endTime: shortLeaveForm.endTime,
          reason: shortLeaveForm.reason.trim()
        })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.updatedLeave) {
          setShortLeaves(prev => {
            const idx = prev.findIndex(l => l.id === data.updatedLeave.id);
            if (idx >= 0) {
              const clone = [...prev];
              clone[idx] = data.updatedLeave;
              return clone;
            }
            return [...prev, data.updatedLeave];
          });
        }
        setShowShortLeaveModal(false);
        setShortLeaveForm({ id: null, date: getLocalDateStr(), startTime: '14:00', endTime: '15:00', reason: '' });
        Alert.alert('Success', 'Short leave requested. Awaiting manager approval.');
      } else {
        Alert.alert('Error', data.error || 'Failed to request leave');
      }
    } catch (e) {
      Alert.alert('Error', `Network error: ${e.message}`);
    } finally {
      setShortLeaveLoading(false);
    }
  };

  // 🕐 Handle Cancel Short Leave
  const handleCancelShortLeave = async (leaveId) => {
    setShortLeaveLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID, 
        'x-user-id': currentUser.id 
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${config.API_BASE_URL}/api/v1/support/cancel-short-leave`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ leaveId })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setShortLeaves(prev => prev.filter(l => l.id !== leaveId));
        Alert.alert('Success', 'Short leave request cancelled.');
      } else {
        Alert.alert('Error', data.error || 'Failed to cancel leave');
      }
    } catch (e) {
      Alert.alert('Error', `Network error: ${e.message}`);
    } finally {
      setShortLeaveLoading(false);
    }
  };

  // 🕐 [SESSION HEARTBEAT] (v2.6.345)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'support') return;

    const pingHeartbeat = async () => {
      try {
        await fetch(`${config.API_BASE_URL}/api/v1/support/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID }
        });
        console.log('[Heartbeat] Sent support session ping');
      } catch (err) {
        console.warn('[Heartbeat] Failed to send support session ping:', err.message);
      }
    };

    pingHeartbeat();
    const intervalId = setInterval(pingHeartbeat, 120000);
    return () => clearInterval(intervalId);
  }, [currentUser]);

  const ticketStats = useMemo(() => {
    let tickets = (supportTickets || []).filter(t => t.creatorRole !== 'support');
    
    if (currentUser?.id !== 'admin') {
      tickets = tickets.filter(t => {
        const isMine = (t.assignedTo && t.assignedTo === currentUser?.id) || 
                       (currentUser?.username && t.assignedTo === currentUser?.username);
        const isUnassigned = (!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === '');
        const isOpen = (t.status === 'Open' || !t.status);
        return isMine || (isUnassigned && isOpen);
      });
    }

    return {
      open: tickets.filter(t => t.status === 'Open' || !t.status).length,
      inProgress: tickets.filter(t => t.status === 'In Progress').length,
      awaiting: tickets.filter(t => t.status === 'Awaiting Response').length,
      resolved: tickets.filter(t => t.status === 'Resolved').length
    };
  }, [supportTickets, currentUser]);

  const [seenAdminActionIds, setSeenAdminActionIds] = useState(new Set());

  const { messages } = useCommsStore();
  const totalUnreadChat = useMemo(() => {
    const unreadSenders = new Set(
      (messages || [])
        .filter(m => m.receiverId === currentUser?.id && m.status !== 'seen')
        .map(m => m.senderId)
    );
    return unreadSenders.size;
  }, [messages, currentUser]);

  const activeLeave = useMemo(() => {
    if (!shortLeaves || shortLeaves.length === 0) return null;
    const now = new Date();
    const todayStr = getLocalDateStr();
    
    return shortLeaves.find(l => {
      if (l.status !== 'approved' || l.date !== todayStr) return false;
      const [startH, startM] = l.startTime.split(':').map(Number);
      const startObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM);
      
      // CRITICAL: Leave stays active until explicitly resumed (deleted)
      return now >= startObj;
    });
  }, [shortLeaves]);

  const isCurrentlyOnLeave = !!activeLeave;
  
  // Check if they are late from their leave
  const isLateFromLeave = useMemo(() => {
    if (!activeLeave) return false;
    const now = new Date();
    const [endH, endM] = activeLeave.endTime.split(':').map(Number);
    const endObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
    return now > endObj;
  }, [activeLeave]);

  const upcomingShortLeaves = useMemo(() => {
    if (!shortLeaves) return [];
    const now = new Date();
    const todayStr = getLocalDateStr();
    
    return shortLeaves.filter(l => {
      if (l.status === 'rejected' || l.status === 'cancelled' || l.status === 'completed') return false;
      
      // Keep if it's today and end time hasn't passed, or if it's in the future
      if (l.date === todayStr) {
        const [endH, endM] = l.endTime.split(':').map(Number);
        const endObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
        if (now > endObj) return false;
      } else if (l.date < todayStr) {
        // Filter out past days completely
        return false;
      }
      return true;
    });
  }, [shortLeaves]);

  // ═══════════════════════════════════════════════════════════════
  // 🕐 CHECK-IN MODAL (v2.6.673)
  // ═══════════════════════════════════════════════════════════════
  const renderCheckinModal = () => {
    if (!showCheckinModal || !currentUser || currentUser.role !== 'support') return null;
    
    const now = new Date();
    const rounded = roundToNearest30(now);
    const checkoutDuePreview = new Date(rounded.getTime() + 8 * 60 * 60 * 1000);

    return (
      <Modal transparent animationType="fade" visible={showCheckinModal}>
        <View style={shiftStyles.modalOverlay}>
          <View style={shiftStyles.modalCard}>
            <LinearGradient colors={['#6366F1', '#4F46E5']} style={shiftStyles.modalHeader}>
              <Ionicons name="time-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening'}!</Text>
              <Text style={shiftStyles.modalSubtitle}>Ready to start your shift?</Text>
            </LinearGradient>

            <View style={shiftStyles.modalBody}>
              <View style={shiftStyles.timeRow}>
                <View style={shiftStyles.timeBlock}>
                  <Text style={shiftStyles.timeLabel}>Current Time</Text>
                  <Text style={shiftStyles.timeValue}>{formatTime(now)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#94A3B8" />
                <View style={shiftStyles.timeBlock}>
                  <Text style={shiftStyles.timeLabel}>Check-In As</Text>
                  <Text style={[shiftStyles.timeValue, { color: '#6366F1' }]}>{formatTime(rounded)}</Text>
                </View>
              </View>

              <View style={shiftStyles.shiftInfoRow}>
                <Ionicons name="briefcase-outline" size={16} color="#64748B" />
                <Text style={shiftStyles.shiftInfoText}>8-hour shift · Checkout due by {formatTime(checkoutDuePreview)}</Text>
              </View>

              <TouchableOpacity 
                style={shiftStyles.checkinBtn}
                onPress={handleCheckin}
                disabled={checkinLoading}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#10B981', '#059669']} style={shiftStyles.checkinBtnGradient}>
                  <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                  <Text style={shiftStyles.checkinBtnText}>
                    {checkinLoading ? 'Checking in...' : 'Check In Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={shiftStyles.notNowBtn}
                onPress={() => setShowCheckinModal(false)}
                activeOpacity={0.7}
              >
                <Text style={shiftStyles.notNowText}>Not Now</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={shiftStyles.muteBtn}
                onPress={handleMuteForToday}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-off-outline" size={14} color="#94A3B8" />
                <Text style={shiftStyles.muteText}>Mute for Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // 🕐 SHORT LEAVE MODAL (v2.6.674)
  // ═══════════════════════════════════════════════════════════════
  const renderShortLeaveModal = () => {
    if (!showShortLeaveModal) return null;
    return (
      <Modal transparent animationType="fade" visible={showShortLeaveModal} onRequestClose={() => setShowShortLeaveModal(false)}>
        <View style={shiftStyles.modalOverlay}>
          <View style={shiftStyles.modalCard}>
            <LinearGradient colors={['#F59E0B', '#D97706']} style={shiftStyles.modalHeader}>
              <Ionicons name="cafe-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>Request Short Leave</Text>
              <Text style={shiftStyles.modalSubtitle}>Need to step away?</Text>
            </LinearGradient>
            <View style={shiftStyles.modalBody}>
              <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>Time Frame</Text>
              <View style={{ marginBottom: 24 }}>
                {Platform.OS === 'web' ? (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Date</Text>
                      <input 
                        type="date" 
                        value={shortLeaveForm.date} 
                        onChange={e => setShortLeaveForm({...shortLeaveForm, date: e.target.value})} 
                        style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', width: '100%', fontSize: 14, outline: 'none', color: '#1E293B', fontFamily: 'inherit', boxSizing: 'border-box' }} 
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Start Time</Text>
                        <input 
                          type="time" 
                          value={shortLeaveForm.startTime} 
                          onChange={e => setShortLeaveForm({...shortLeaveForm, startTime: e.target.value})} 
                          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', width: '100%', fontSize: 14, outline: 'none', color: '#1E293B', fontFamily: 'inherit', boxSizing: 'border-box' }} 
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>End Time</Text>
                        <input 
                          type="time" 
                          value={shortLeaveForm.endTime} 
                          onChange={e => setShortLeaveForm({...shortLeaveForm, endTime: e.target.value})} 
                          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', width: '100%', fontSize: 14, outline: 'none', color: '#1E293B', fontFamily: 'inherit', boxSizing: 'border-box' }} 
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Date (YYYY-MM-DD)</Text>
                      <TextInput 
                        style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' }}
                        placeholder="2026-06-22"
                        placeholderTextColor="#94A3B8"
                        value={shortLeaveForm.date}
                        onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, date: val }))}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Start (HH:MM)</Text>
                        <TextInput 
                          style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B', textAlign: 'center' }}
                          placeholder="14:00"
                          placeholderTextColor="#94A3B8"
                          value={shortLeaveForm.startTime}
                          onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, startTime: val }))}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>End (HH:MM)</Text>
                        <TextInput 
                          style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B', textAlign: 'center' }}
                          placeholder="15:00"
                          placeholderTextColor="#94A3B8"
                          value={shortLeaveForm.endTime}
                          onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, endTime: val }))}
                        />
                      </View>
                    </View>
                  </>
                )}
              </View>

              <Text style={{ fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 8 }}>Reason</Text>
              <TextInput 
                style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, fontSize: 15, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 24, minHeight: 80 }}
                placeholder="e.g. Doctor appointment"
                placeholderTextColor="#94A3B8"
                multiline
                value={shortLeaveForm.reason}
                onChangeText={(val) => setShortLeaveForm(prev => ({ ...prev, reason: val }))}
              />

              <TouchableOpacity 
                style={shiftStyles.checkinBtn}
                onPress={handleShortLeaveSubmit}
                disabled={shortLeaveLoading}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#F59E0B', '#D97706']} style={shiftStyles.checkinBtnGradient}>
                  <Ionicons name="send" size={20} color="#FFF" />
                  <Text style={shiftStyles.checkinBtnText}>
                    {shortLeaveLoading ? 'Submitting...' : 'Submit Request'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity 
                style={shiftStyles.notNowBtn}
                onPress={() => setShowShortLeaveModal(false)}
                activeOpacity={0.7}
              >
                <Text style={shiftStyles.notNowText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // 🕐 ALL SHORT LEAVES MODAL
  // ═══════════════════════════════════════════════════════════════
  const renderAllLeavesModal = () => {
    if (!showAllLeavesModal) return null;
    return (
      <Modal transparent animationType="fade" visible={showAllLeavesModal} onRequestClose={() => setShowAllLeavesModal(false)}>
        <View style={shiftStyles.modalOverlay}>
          <View style={[shiftStyles.modalCard, { maxHeight: '80%' }]}>
            <LinearGradient colors={['#3B82F6', '#2563EB']} style={shiftStyles.modalHeader}>
              <Ionicons name="list-outline" size={36} color="#FFF" />
              <Text style={shiftStyles.modalTitle}>All Short Leaves</Text>
            </LinearGradient>
            <View style={[shiftStyles.modalBody, { padding: 0 }]}>
              <ScrollView style={{ padding: 20 }}>
                {shortLeaves.map((leave, idx) => (
                  <View key={leave.id || idx} style={{ marginBottom: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: leave.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: leave.status === 'approved' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name={leave.status === 'approved' ? "checkmark-circle" : "time-outline"} size={16} color={leave.status === 'approved' ? "#10B981" : "#3B82F6"} style={{ marginRight: 6 }} />
                        <Text style={{ color: leave.status === 'approved' ? '#10B981' : '#3B82F6', fontSize: 13, fontWeight: '800', textTransform: 'capitalize' }}>{leave.status} Leave</Text>
                      </View>
                      {(leave.status === 'pending' || leave.status === 'approved') && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {leave.status === 'pending' && (
                            <TouchableOpacity onPress={() => {
                              setShowAllLeavesModal(false);
                              setShortLeaveForm({ ...leave });
                              setShowShortLeaveModal(true);
                            }}>
                              <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>Modify</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => handleCancelShortLeave(leave.id)}>
                            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '600' }}>{leave.date} ({leave.startTime} - {leave.endTime})</Text>
                    <Text style={{ color: '#475569', fontSize: 11, fontWeight: '500', marginTop: 4 }}>For: {leave.reason}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                <TouchableOpacity 
                  style={{ backgroundColor: '#F8FAFC', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}
                  onPress={() => setShowAllLeavesModal(false)}
                >
                  <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // 🕐 CHECKOUT BANNER (v2.6.673)
  // ═══════════════════════════════════════════════════════════════
  const bannerBg = bannerPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(245, 158, 11, 0.12)', 'rgba(245, 158, 11, 0.22)']
  });

  const renderCheckoutBanner = () => {
    if (!showCheckoutBanner || shiftStatus !== 'on_shift') return null;

    return (
      <Animated.View style={[shiftStyles.checkoutBanner, { backgroundColor: bannerBg }]}>
        <View style={shiftStyles.checkoutBannerContent}>
          <View style={shiftStyles.checkoutBannerLeft}>
            <View style={shiftStyles.checkoutIconCircle}>
              <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={shiftStyles.checkoutTitle}>{checkoutCountdown}</Text>
              <Text style={shiftStyles.checkoutSubtitle}>Have a great day ahead! ✨</Text>
            </View>
          </View>
          <View style={shiftStyles.checkoutActions}>
            <TouchableOpacity 
              style={shiftStyles.checkoutBtn}
              onPress={() => handleCheckout(false)}
              disabled={checkoutLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={14} color="#FFF" />
              <Text style={shiftStyles.checkoutBtnText}>{checkoutLoading ? '...' : 'Check Out'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={shiftStyles.checkoutDismissBtn}
              onPress={() => {
                setShowCheckoutBanner(false);
                checkoutDismissedUntilRef.current = Date.now() + 10 * 60 * 1000;
              }}
              activeOpacity={0.7}
            >
              <Text style={shiftStyles.checkoutDismissText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════════════════════════════
  const renderWebSidebar = () => (
    <>
      {(isSmallScreen && isWebSidebarOpen) && (
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setIsWebSidebarOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        />
      )}
      <View style={{ 
        width: 280, 
        backgroundColor: '#0F172A', 
        height: Platform.OS === 'web' ? '100dvh' : '100%', 
        paddingTop: 32, 
        justifyContent: 'space-between',
        position: isSmallScreen ? 'absolute' : 'relative',
        top: 0,
        bottom: 0,
        left: isSmallScreen ? (isWebSidebarOpen ? 0 : -280) : 0,
        zIndex: 101,
        transition: 'left 0.3s ease-in-out'
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 }}>
            {isSmallScreen ? (
              <TouchableOpacity onPress={() => setIsWebSidebarOpen(false)}>
                <Ionicons name="close" size={28} color="#FFF" style={{ marginRight: 16 }} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="menu" size={28} color="#FFF" style={{ marginRight: 16 }} />
            )}
            <Image source={{ uri: '/assets/assets/icon.1cbbacdee3826df7ca26e1b3cddc7b88.png' }} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>ACETRACK</Text>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 12, paddingHorizontal: 12, letterSpacing: 1.5 }}>SUPPORT CENTER</Text>
              
              {/* Tickets */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#6366F1', marginBottom: 4 }}
                onPress={() => { if (isSmallScreen) setIsWebSidebarOpen(false); }}
              >
                <Ionicons name="chatbubbles-outline" size={20} color="#FFF" />
                <Text style={{ marginLeft: 16, fontSize: 14, fontWeight: '700', color: '#FFF', flex: 1 }}>Support Tickets</Text>
                {(ticketStats.open + ticketStats.awaiting) > 0 && (
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{ticketStats.open + ticketStats.awaiting}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* 🕐 Shift Status Badge in Sidebar */}
              {currentUser?.role === 'support' && (
                <View style={{ marginTop: 12, paddingHorizontal: 12 }}>
                  <View style={{ 
                    flexDirection: 'row', alignItems: 'center', 
                    backgroundColor: shiftStatus === 'on_shift' ? (isCurrentlyOnLeave ? (isLateFromLeave ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)') : 'rgba(16, 185, 129, 0.15)') : 'rgba(239, 68, 68, 0.1)', 
                    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, 
                    borderWidth: 1, 
                    borderColor: shiftStatus === 'on_shift' ? (isCurrentlyOnLeave ? (isLateFromLeave ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.3)') : 'rgba(16, 185, 129, 0.3)') : 'rgba(239, 68, 68, 0.2)' 
                  }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: shiftStatus === 'on_shift' ? (isCurrentlyOnLeave ? (isLateFromLeave ? '#EF4444' : '#F59E0B') : '#10B981') : '#EF4444', marginRight: 8 }} />
                    <Text style={{ color: shiftStatus === 'on_shift' ? (isCurrentlyOnLeave ? (isLateFromLeave ? '#EF4444' : '#F59E0B') : '#10B981') : '#F87171', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, flex: 1 }}>
                      {shiftStatus === 'on_shift' ? (isCurrentlyOnLeave ? (isLateFromLeave ? 'LATE FROM LEAVE' : 'ON SHORT LEAVE') : 'ON SHIFT') : 'OFF SHIFT'}
                    </Text>
                    {shiftStatus === 'on_shift' && shiftCheckinRounded && (
                      <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '600' }}>Since {formatTime(shiftCheckinRounded)}</Text>
                    )}
                  </View>

                  {/* Short Leave Button / Banner */}
                  {shiftStatus === 'on_shift' && !isCurrentlyOnLeave && (
                    <TouchableOpacity 
                      style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                      onPress={() => {
                        setShortLeaveForm({ id: null, date: getLocalDateStr(), startTime: '14:00', endTime: '15:00', reason: '' });
                        setShowShortLeaveModal(true);
                      }}
                    >
                      <Ionicons name="cafe-outline" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>Request Short Leave</Text>
                    </TouchableOpacity>
                  )}

                  {shiftStatus === 'on_shift' && isCurrentlyOnLeave && activeLeave && (
                    <TouchableOpacity 
                      style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: isLateFromLeave ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: isLateFromLeave ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.3)', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                      onPress={() => handleCancelShortLeave(activeLeave.id)}
                    >
                      <Ionicons name={isLateFromLeave ? "warning-outline" : "play-circle-outline"} size={16} color={isLateFromLeave ? "#EF4444" : "#10B981"} style={{ marginRight: 6 }} />
                      <Text style={{ color: isLateFromLeave ? '#EF4444' : '#10B981', fontSize: 11, fontWeight: '800' }}>
                        {isLateFromLeave ? 'Resume Shift Now (Overdue)' : 'Resume Shift Early'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {upcomingShortLeaves.slice(0, 3).map((leave, idx) => (
                    <View key={leave.id || idx} style={{ marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: leave.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: leave.status === 'approved' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name={leave.status === 'approved' ? "checkmark-circle" : "time-outline"} size={14} color={leave.status === 'approved' ? "#10B981" : "#3B82F6"} style={{ marginRight: 6 }} />
                          <Text style={{ color: leave.status === 'approved' ? '#10B981' : '#3B82F6', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }}>{leave.status} Leave</Text>
                        </View>
                        {(leave.status === 'pending' || leave.status === 'approved') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {leave.status === 'pending' && (
                              <TouchableOpacity onPress={() => {
                                setShortLeaveForm({ ...leave });
                                setShowShortLeaveModal(true);
                              }}>
                                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700', textDecorationLine: 'underline' }}>Modify</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => handleCancelShortLeave(leave.id)}>
                              <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '700', textDecorationLine: 'underline' }}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '600' }}>{leave.date} ({leave.startTime} - {leave.endTime})</Text>
                      <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '600' }} numberOfLines={1}>For: {leave.reason}</Text>
                    </View>
                  ))}
                  {shortLeaves.length > 0 && (
                    <TouchableOpacity 
                      style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                      onPress={() => setShowAllLeavesModal(true)}
                    >
                      <Ionicons name="list-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700' }}>View All History ({shortLeaves.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Quick stats */}
              <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5 }}>QUICK STATS</Text>
                {[
                  { label: 'Open', value: ticketStats.open, color: '#3B82F6' },
                  { label: 'In Progress', value: ticketStats.inProgress, color: '#F59E0B' },
                  { label: 'Awaiting', value: ticketStats.awaiting, color: '#A855F7' },
                  { label: 'Resolved', value: ticketStats.resolved, color: '#10B981' },
                ].map(stat => (
                  <View key={stat.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stat.color, marginRight: 10 }} />
                      <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '500' }}>{stat.label}</Text>
                    </View>
                    <Text style={{ color: '#E2E8F0', fontSize: 16, fontWeight: '800' }}>{stat.value}</Text>
                  </View>
                ))}
              </View>

              {/* Reporting Hierarchy */}
              <View style={{ marginTop: 24, paddingHorizontal: 12, paddingBottom: 20 }}>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5 }}>REPORTING HIERARCHY</Text>
                
                {currentUser?.managerId && (() => {
                   const mgr = players?.find(p => String(p.id) === String(currentUser.managerId));
                   return mgr ? (
                     <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                       <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', marginRight: 10, overflow: 'hidden' }}>
                         {mgr.avatar ? <Image source={{uri: mgr.avatar}} style={{width: 28, height: 28}} /> : <Ionicons name="person" size={16} color="#FFF" style={{margin: 6}} />}
                       </View>
                       <View>
                         <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>{mgr.name}</Text>
                         <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>MANAGER</Text>
                       </View>
                     </View>
                   ) : null;
                })()}

                {currentUser?.teamLeadId && (() => {
                   const tl = players?.find(p => String(p.id) === String(currentUser.teamLeadId));
                   return tl ? (
                     <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                       <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', marginRight: 10, overflow: 'hidden' }}>
                         {tl.avatar ? <Image source={{uri: tl.avatar}} style={{width: 28, height: 28}} /> : <Ionicons name="person" size={16} color="#FFF" style={{margin: 6}} />}
                       </View>
                       <View>
                         <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>{tl.name}</Text>
                         <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>TEAM LEAD</Text>
                       </View>
                     </View>
                   ) : null;
                })()}

                {!currentUser?.managerId && !currentUser?.teamLeadId && currentUser?.supportLevel?.toLowerCase() === 'manager' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', marginRight: 10, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                    </View>
                    <View>
                      <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>System Admin</Text>
                      <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>ADMIN</Text>
                    </View>
                  </View>
                )}
                {!currentUser?.managerId && !currentUser?.teamLeadId && currentUser?.supportLevel?.toLowerCase() !== 'manager' && (
                   <Text style={{ color: '#64748B', fontSize: 12, fontStyle: 'italic', marginBottom: 12 }}>No hierarchy assigned</Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Pinned Bottom Footer Section */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#1E293B', backgroundColor: '#0F172A' }}>
          {/* Chat/Collaborate link */}
          <TouchableOpacity 
            onPress={() => { navigation.navigate('OrgChat'); if (isSmallScreen) setIsWebSidebarOpen(false); }} 
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(99, 102, 241, 0.15)', borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.3)', marginBottom: 8 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
              {totalUnreadChat > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#0F172A' }}>
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>{totalUnreadChat}</Text>
                </View>
              )}
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700' }}>Chat/Collaborate</Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }}>Team Messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#475569" />
          </TouchableOpacity>

          {/* Profile link */}
          <TouchableOpacity 
            onPress={() => { navigation.navigate('Profile'); if (isSmallScreen) setIsWebSidebarOpen(false); }} 
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1E293B' }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="person" size={16} color="#FFF" />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' }} numberOfLines={1}>{currentUser?.name || 'Support Agent'}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }} numberOfLines={1}>{currentUser?.email || 'Settings'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  // MAIN CONTENT
  // ═══════════════════════════════════════════════════════════════
  const content = (
    <View style={styles.container}>
      <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.premiumHeader}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isSmallScreen && (
                  <TouchableOpacity onPress={() => setIsWebSidebarOpen(true)} style={{ marginRight: 16 }}>
                    <Ionicons name="menu" size={28} color="#FFF" />
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={styles.premiumTitle}>Support Hub</Text>
                  <Text style={styles.premiumSubtitle}>Ticket Management & Resolution</Text>
                </View>
              </View>
              
              <View style={styles.badgeRow}>
                <TouchableOpacity 
                  onPress={() => onManualSync?.(true, true)}
                  style={[styles.syncBadge, isCloudOnline ? styles.syncOnline : (isUsingCloud ? styles.syncOffline : styles.syncLocal)]}
                >
                  <Ionicons 
                    name={isCloudOnline ? "cloud-done" : (isUsingCloud ? "cloud-offline" : "server")} 
                    size={10} 
                    color="#FFF" 
                  />
                  <Text style={styles.syncText}>
                    {isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
                  </Text>
                </TouchableOpacity>
                {lastSyncTime && <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>}
              </View>
            </View>
            <View style={styles.headerIcon}>
               <Ionicons name="headset" size={24} color="#FFF" />
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* 🕐 Checkout Banner */}
      {renderCheckoutBanner()}

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder="Search tickets..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {/* Ticket content */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AdminGrievancesPanel 
          tickets={(supportTickets || []).filter(t => t.creatorRole !== 'support')}
          players={players || []}
          onReply={onReplyTicket}
          onUpdateStatus={onUpdateTicketStatus}
          onMarkSeen={onMarkSeen}
          onReassignTicket={onReassignTicket}
          currentUser={currentUser}
          seenAdminActionIds={seenAdminActionIds}
          setSeenAdminActionIds={setSeenAdminActionIds}
          search={search}
          autoSelectTicketId={urlTicketId}
          onSelect={handleTicketSelect}
          onConsumeTicketId={() => setUrlTicketId(null)}
        />
      </ScrollView>

      {/* 🕐 Check-In Modal */}
      {renderCheckinModal()}
      
      {/* 🕐 Short Leave Modal */}
      {renderShortLeaveModal()}

      {/* 🕐 All Short Leaves Modal */}
      {renderAllLeavesModal()}
    </View>
  );

  return isWeb ? (
    <View style={{ flex: 1, flexDirection: isSmallScreen ? 'column' : 'row', backgroundColor: '#F8FAFC', height: '100vh', width: '100vw' }}>
      {renderWebSidebar()}
      <View style={{ flex: 1, padding: isSmallScreen ? 16 : 32, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: isSmallScreen ? 16 : 24, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, overflow: 'hidden' }}>
          {content}
        </View>
      </View>
    </View>
  ) : content;
};

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  premiumHeader: { paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  premiumTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  premiumSubtitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  syncOnline: { backgroundColor: '#10B981' },
  syncOffline: { backgroundColor: '#EF4444' },
  syncLocal: { backgroundColor: '#F59E0B' },
  syncText: { fontSize: 9, fontWeight: '900', color: '#FFF', marginLeft: 4, textTransform: 'uppercase' },
  lastSyncText: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', 
    margin: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, 
    ...shadows.sm, borderWidth: 1, borderColor: '#F1F5F9'
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: colors.navy[900], fontWeight: '600' },
  content: { flex: 1 },
});

// 🕐 SHIFT MANAGEMENT STYLES (v2.6.673)
const shiftStyles = StyleSheet.create({
  // Check-In Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' } : shadows.lg) },
  modalHeader: { padding: 28, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', marginTop: 12 },
  modalSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontWeight: '600' },
  modalBody: { padding: 24 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20, paddingVertical: 16, backgroundColor: '#F8FAFC', borderRadius: 16 },
  timeBlock: { alignItems: 'center' },
  timeLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  timeValue: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
  shiftInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 6 },
  shiftInfoText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  checkinBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  checkinBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  checkinBtnText: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  notNowBtn: { paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  notNowText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  muteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4 },
  muteText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  // Checkout Banner
  checkoutBanner: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', overflow: 'hidden' },
  checkoutBannerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, flexWrap: 'wrap', gap: 8 },
  checkoutBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 200 },
  checkoutIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  checkoutTitle: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  checkoutSubtitle: { fontSize: 11, color: '#B45309', fontWeight: '600', marginTop: 1 },
  checkoutActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 4 },
  checkoutBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  checkoutDismissBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  checkoutDismissText: { color: '#92400E', fontSize: 12, fontWeight: '700' },
});

export default SupportDashboardScreen;
