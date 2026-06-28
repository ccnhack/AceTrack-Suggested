import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, Alert, Animated } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config';

export function roundToNearest30(date) {
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

export function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useSupportShift = (currentUser, players) => {
// ═══════════════════════════════════════════════════════════════
// 🕐 SHIFT CHECK-IN / CHECK-OUT STATE (v2.6.673)
// ═══════════════════════════════════════════════════════════════
const [showCheckinModal, setShowCheckinModal] = useState(false);
const [shiftStatus, setShiftStatus] = useState(null);
const [shiftCheckinRounded, setShiftCheckinRounded] = useState(null);
const [shiftCheckoutDue, setShiftCheckoutDue] = useState(null);
const [extendedShiftUntil, setExtendedShiftUntil] = useState(null);
const [shortLeaves, setShortLeaves] = useState([]);
const [showCheckoutBanner, setShowCheckoutBanner] = useState(false);
const [checkoutCountdown, setCheckoutCountdown] = useState('');
const [checkinLoading, setCheckinLoading] = useState(false);
const [checkoutLoading, setCheckoutLoading] = useState(false);
const [extendShiftLoading, setExtendShiftLoading] = useState(false);
const checkoutDismissedUntilRef = useRef(0);
const autoCheckoutFiredRef = useRef(false);
const bannerPulse = useRef(new Animated.Value(0)).current;

// Short Leave State
const [showShortLeaveModal, setShowShortLeaveModal] = useState(false);
const [showAllLeavesModal, setShowAllLeavesModal] = useState(false);
const [showResumeLeaveModal, setShowResumeLeaveModal] = useState(false);
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
        setExtendedShiftUntil(data.extendedShiftUntil);
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
        } else {
          // If on shift, check if they are returning from a short leave
          const now = new Date();
          const todayStr = getLocalDateStr();
          const currentActiveLeave = (data.shortLeaves || []).find(l => {
            if (l.status !== 'approved' || l.date !== todayStr) return false;
            const [startH, startM] = l.startTime.split(':').map(Number);
            const startObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM);
            return now >= startObj;
          });
          
          if (currentActiveLeave) {
            setShowResumeLeaveModal(true);
          }
        }
      }
    } catch (e) {
      console.warn('[Shift] Failed to fetch shift status:', e.message);
    }
  };
  
  fetchShiftStatus();
}, [currentUser]);

// Sync short leaves from global players store (for when admins approve/reject)
useEffect(() => {
  if (currentUser && players) {
    const myPlayer = players.find(p => String(p.id) === String(currentUser.id));
    if (myPlayer && myPlayer.shortLeaves) {
      setShortLeaves(myPlayer.shortLeaves);
    }
  }
}, [players, currentUser]);

// 🕐 Checkout banner timer — checks every 30s
useEffect(() => {
  if (!shiftCheckoutDue || shiftStatus !== 'on_shift') {
    setShowCheckoutBanner(false);
    return;
  }

  const checkBanner = () => {
    const now = Date.now();
    const checkinTime = new Date(shiftCheckinRounded).getTime();
    let dueTime = new Date(shiftCheckoutDue).getTime();
    
    // Default 8-hour shift banner logic
    let bannerStartMs = checkinTime + (7.5 * 60 * 60 * 1000); // 7h 30m
    
    if (extendedShiftUntil) {
      dueTime = new Date(extendedShiftUntil).getTime();
      bannerStartMs = dueTime - (15 * 60 * 1000); // 15 mins before extended end
    }

    if (now >= bannerStartMs && now > checkoutDismissedUntilRef.current) {
      setShowCheckoutBanner(true);

      // Frontend Auto-checkout at exact due time
      if (now >= dueTime && !autoCheckoutFiredRef.current) {
        autoCheckoutFiredRef.current = true;
        handleCheckout(true);
        return;
      }

      // Dynamic countdown message
      const remainingMs = dueTime - now;
      if (remainingMs > 0) {
        const mins = Math.ceil(remainingMs / 60000);
        setCheckoutCountdown(extendedShiftUntil ? `Extended shift ends in ${mins} minute${mins !== 1 ? 's' : ''}.` : `Your shift ends in ${mins} minute${mins !== 1 ? 's' : ''}! 🎉`);
      } else {
        const overtimeMins = Math.floor((now - dueTime) / 60000);
        setCheckoutCountdown(`Shift complete! ${overtimeMins > 0 ? `(${overtimeMins}m overtime)` : 'Time to check out.'}`);
      }
    } else {
      setShowCheckoutBanner(false);
    }
  };

  checkBanner();
  const interval = setInterval(checkBanner, 30000);
  return () => clearInterval(interval);
}, [shiftCheckoutDue, shiftStatus, shiftCheckinRounded, extendedShiftUntil]);

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

// 🕐 Handle Extend Shift
const handleExtendShift = useCallback(async (targetTimeISO) => {
  if (extendShiftLoading) return;
  setExtendShiftLoading(true);
  try {
    const token = await AsyncStorage.getItem('userToken');
    const headers = { 
      'Content-Type': 'application/json',
      'x-ace-api-key': config.PUBLIC_APP_ID, 
      'x-user-id': currentUser.id 
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${config.API_BASE_URL}/api/v1/support/extend-shift`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ extendUntil: targetTimeISO })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      setExtendedShiftUntil(data.extendedShiftUntil);
      setShowCheckoutBanner(false);
      Alert.alert('✅ Shift Extended', `Your shift is now extended until ${formatTime(data.extendedShiftUntil)}.`);
    } else {
      Alert.alert('Extension Failed', data.error || 'Unknown error');
    }
  } catch (e) {
    Alert.alert('Error', `Failed to extend shift: ${e.message}`);
  } finally {
    setExtendShiftLoading(false);
  }
}, [currentUser, extendShiftLoading]);

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
      Alert.alert('Success', data.updatedLeave?.status === 'completed' ? 'Shift resumed successfully.' : 'Short leave request cancelled.');
    } else {
      Alert.alert('Error', data.error || 'Failed to cancel leave');
    }
  } catch (e) {
    Alert.alert('Error', `Network error: ${e.message}`);
  } finally {
    setShortLeaveLoading(false);
  }
};

// 🎯 [ACTIVITY HEARTBEAT] (v2.6.760): Activity-based session tracking
// Sends heartbeat every 30s ONLY when user is actively interacting AND tab is visible
useEffect(() => {
  if (!currentUser || currentUser.role !== 'support') return;

  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const IDLE_TIMEOUT = 180000; // 3 minutes
  let lastActivityTs = Date.now();
  let isTabVisible = true;
  let heartbeatTimer = null;

  // Track user activity (throttled to 1 update per second)
  let activityThrottleTimer = null;
  const markActive = () => {
    if (activityThrottleTimer) return;
    lastActivityTs = Date.now();
    activityThrottleTimer = setTimeout(() => { activityThrottleTimer = null; }, 1000);
  };

  // Web: Detect tab visibility
  const handleVisibilityChange = () => {
    isTabVisible = Platform.OS === 'web' ? !document.hidden : true;
    if (isTabVisible) lastActivityTs = Date.now(); // Resume counts as activity
  };

  // Mobile: Detect app state
  const { AppState: RNAppState } = require('react-native');
  const appStateListener = RNAppState.addEventListener?.('change', (nextState) => {
    isTabVisible = nextState === 'active';
    if (isTabVisible) lastActivityTs = Date.now();
  });

  // Register activity listeners (web only — mobile gets touch events natively)
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('mousemove', markActive, { passive: true });
    document.addEventListener('click', markActive, { passive: true });
    document.addEventListener('keydown', markActive, { passive: true });
    document.addEventListener('scroll', markActive, { passive: true });
    document.addEventListener('touchstart', markActive, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Heartbeat sender — only fires when active + visible
  const sendHeartbeat = async () => {
    const isIdle = (Date.now() - lastActivityTs) > IDLE_TIMEOUT;
    if (!isTabVisible || isIdle) {
      console.log(`[Heartbeat] Skipped (visible=${isTabVisible}, idle=${isIdle})`);
      return;
    }
    try {
      await fetch(`${config.API_BASE_URL}/api/v1/support/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID }
      });
    } catch (err) {
      // Silent fail — don't spam console
    }
  };

  sendHeartbeat(); // Initial ping
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  return () => {
    clearInterval(heartbeatTimer);
    if (activityThrottleTimer) clearTimeout(activityThrottleTimer);
    if (appStateListener?.remove) appStateListener.remove();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.removeEventListener('mousemove', markActive);
      document.removeEventListener('click', markActive);
      document.removeEventListener('keydown', markActive);
      document.removeEventListener('scroll', markActive);
      document.removeEventListener('touchstart', markActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}, [currentUser]);


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

// Check if they are in Overtime (past 8 hours from check-in)
const isOvertime = useMemo(() => {
  if (shiftStatus !== 'on_shift' || !shiftCheckinRounded) return false;
  const checkinTime = new Date(shiftCheckinRounded).getTime();
  const SHIFT_LIMIT_MS = 8 * 60 * 60 * 1000;
  return Date.now() - checkinTime > SHIFT_LIMIT_MS;
}, [shiftStatus, shiftCheckinRounded]);

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


  return {
    showCheckinModal, setShowCheckinModal, shiftStatus, setShiftStatus, shiftCheckinRounded,
    shiftCheckoutDue, extendedShiftUntil, shortLeaves, showCheckoutBanner, setShowCheckoutBanner, checkoutCountdown,
    checkinLoading, checkoutLoading, extendShiftLoading, showShortLeaveModal, setShowShortLeaveModal, showAllLeavesModal,
    setShowAllLeavesModal, showResumeLeaveModal, setShowResumeLeaveModal, shortLeaveForm, setShortLeaveForm,
    shortLeaveLoading, handleCheckin, handleCheckout, handleExtendShift, handleMuteForToday, handleShortLeaveSubmit,
    handleCancelShortLeave, activeLeave, isCurrentlyOnLeave, isLateFromLeave, isOvertime, upcomingShortLeaves, bannerPulse
  };
};
