import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Platform, Linking  } from 'react-native';
import { apiFetch } from '../../utils/apiFetch';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';
import storage from '../../utils/storage';
import { usePlayersStore } from '../../stores';
import { useAdminStore as useAdmin } from '../../stores/useAdminStore';
import SafeAvatar from '../SafeAvatar';
import PureJSDateTimePicker from '../PureJSDateTimePicker';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from 'react-native-calendars';
import AceDialog from '../AceDialog';
import { DrillDownModal } from './support/DrillDownModal';
import { AttendanceModal } from './support/AttendanceModal';
import { ActionsModal } from './support/ActionsModal';
import { ManagerSelectModal } from './support/ManagerSelectModal';
import { ActivityModal } from './support/ActivityModal';
import styles from "./AdminSupportTeamPanel.styles";

// 🕐 Time Filter Presets
const TIME_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: '3d', label: '3 Days' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const getFilterDates = (key) => {
  const now = new Date();
  switch (key) {
    case 'today': return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: now.toISOString() };
    case '3d': return { from: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() };
    case '7d': return { from: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() };
    case '30d': return { from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() };
    case 'all': return { from: null, to: null };
    default: return { from: null, to: null };
  }
};

// 🕐 Format milliseconds to human-readable
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return 'N/A';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const AdminSupportTeamPanel = ({ onOpenTicket }) => {
  const { players } = usePlayersStore();
  const { auditLogs } = useAdmin();
  const { currentUser } = useAuth();
  
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    if (Platform.OS === 'web') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('agentId') || null;
    }
    return null;
  });
  const [managerSearch, setManagerSearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManaging, setIsManaging] = useState(null);
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'ex-employees'
  
  // 🛡️ Hierarchy Management (v2.6.440)
  const [showManagerSelect, setShowManagerSelect] = useState(false);
  const [isAssigningManager, setIsAssigningManager] = useState(false);

  // Phase 5: Drill-Down Modal Config
  const [drillDownConfig, setDrillDownConfig] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // 🕐 Time Filter State
  const [timeFilter, setTimeFilter] = useState('all');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // 🕐 [ATTENDANCE] (v2.6.267): Attendance data state
  const [attendanceData, setAttendanceData] = useState(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(() => {
    if (Platform.OS === 'web') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('attendance') === 'true';
    }
    return false;
  });

  // 🛡️ [URL_PERSISTENCE] (v2.6.652): Keep agent and attendance state in URL to survive refreshes
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      let changed = false;

      if (selectedAgentId) {
        if (currentUrl.searchParams.get('agentId') !== selectedAgentId) {
          currentUrl.searchParams.set('agentId', selectedAgentId);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('agentId')) {
        currentUrl.searchParams.delete('agentId');
        changed = true;
      }
      
      if (showAttendanceModal) {
        if (currentUrl.searchParams.get('attendance') !== 'true') {
          currentUrl.searchParams.set('attendance', 'true');
          changed = true;
        }
      } else if (currentUrl.searchParams.has('attendance')) {
        currentUrl.searchParams.delete('attendance');
        changed = true;
      }
      
      if (changed) {
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [selectedAgentId, showAttendanceModal]);
  const getLocalDateString = (d) => {
    const dateObj = d ? new Date(d) : new Date();
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [attendanceDateFilter, setAttendanceDateFilter] = useState(() => getLocalDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [attendanceRangeMode, setAttendanceRangeMode] = useState(false);
  const [attendanceCalendarMode, setAttendanceCalendarMode] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedLeaveDate, setSelectedLeaveDate] = useState(null);
  const [attendanceEndDateFilter, setAttendanceEndDateFilter] = useState(() => getLocalDateString());
  const [showActiveSessionsOnly, setShowActiveSessionsOnly] = useState(false);
  const [selectedSessionForActivity, setSelectedSessionForActivity] = useState(null);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showRoleConfirmModal, setShowRoleConfirmModal] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState(null);
  const [roleChangeComment, setRoleChangeComment] = useState('');

  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [isUpdatingShift, setIsUpdatingShift] = useState(false);

  // 🎨 [ACE_DIALOG] (v2.6.431): State-driven dialog system — replaces window.alert/confirm/prompt
  const [dialog, setDialog] = useState({ visible: false, title: '', message: '', type: 'info', confirmText: 'OK', cancelText: 'Cancel', pickerOptions: [] });
  const dialogResolveRef = useRef(null);

  const showDialog = (opts) => new Promise(resolve => {
    dialogResolveRef.current = resolve;
    setDialog({ visible: true, confirmText: 'OK', cancelText: 'Cancel', pickerOptions: [], ...opts });
  });
  const dismissDialog = (value) => {
    setDialog(prev => ({ ...prev, visible: false }));
    dialogResolveRef.current?.(value);
    dialogResolveRef.current = null;
  };
  const SUPPORT_HIERARCHY = ['Manager', 'Team Lead', 'Senior', 'Grade-7', 'Grade-5', 'Grade-3', 'Junior', 'Intern'];

  const sessionActivities = useMemo(() => {
    if (!selectedSessionForActivity || !auditLogs) return [];
    const agentId = selectedSessionForActivity.agentId;
    const start = new Date(selectedSessionForActivity.startTime).getTime();
    const end = selectedSessionForActivity.isLive ? Date.now() : new Date(selectedSessionForActivity.endTime).getTime();
    
    return auditLogs.filter(log => {
      if (log.userId !== agentId) return false;
      if (log.category !== 'support_activity') return false;
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [selectedSessionForActivity, auditLogs]);

  const handleExportCSV = async () => {
    const token = await storage.getItem('userToken');
    const url = `${config.API_BASE_URL}/api/v1/support/export?token=${token}&userId=admin`;
    const confirmed = await showDialog({ title: 'Export Data', message: 'This will download a CSV containing all ticket data and metrics.', type: 'warning', confirmText: 'Download', cancelText: 'Cancel' });
    if (confirmed) Linking.openURL(url);
  };

  const fetchTeamAnalytics = useCallback(async (filterOverride) => {
    setIsRefreshing(true);
    try {
       const currentFilter = filterOverride || timeFilter;
       let queryParams = '';
       
       if (currentFilter === 'custom' && customFrom && customTo) {
         queryParams = `?from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`;
       } else if (currentFilter !== 'all' && currentFilter !== 'custom') {
         const dates = getFilterDates(currentFilter);
         if (dates.from) queryParams = `?from=${encodeURIComponent(dates.from)}&to=${encodeURIComponent(dates.to)}`;
       }

       const token = await storage.getItem('userToken');
       const headers = { 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
       if (token) headers['Authorization'] = `Bearer ${token}`;

       const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/analytics${queryParams}`, {
         headers,
         credentials: 'include'
       });
       if (res.ok) {
         const data = await res.json();
         setAnalytics(data);
       }
    } catch (e) {
       console.warn("Failed to fetch analytics");
    } finally {
       setIsRefreshing(false);
    }
  }, [timeFilter, customFrom, customTo]);

  useEffect(() => {
    fetchTeamAnalytics();
  }, [fetchTeamAnalytics]);

  // 🕐 [ATTENDANCE] (v2.6.267): Fetch attendance data
  const fetchAttendance = useCallback(async () => {
    setIsLoadingAttendance(true);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/attendance`, {
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data.attendance);
      }
    } catch (e) {
      console.warn('[SUPPORT_PANEL] Failed to fetch attendance data');
    } finally {
      setIsLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
    // Refresh attendance every 60s for live session tracking
    const timer = setInterval(fetchAttendance, 60000);
    return () => clearInterval(timer);
  }, [fetchAttendance]);

  const handleTimeFilterChange = (key) => {
    setTimeFilter(key);
    if (key === 'custom') {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      fetchTeamAnalytics(key);
    }
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      Alert.alert('Invalid Range', 'Please enter both start and end dates.\n\nFormat: YYYY-MM-DD or YYYY-MM-DD HH:MM');
      return;
    }
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      Alert.alert('Invalid Date', 'Please enter valid dates in format: YYYY-MM-DD or YYYY-MM-DD HH:MM');
      return;
    }
    if (from > to) {
      Alert.alert('Invalid Range', 'Start date must be before end date.');
      return;
    }
    setShowCustomRange(false);
    fetchTeamAnalytics('custom');
  };

  const updateUserStatus = async (userId, status, level, comment) => {
    setIsManaging(userId);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json', 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/manage-user`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ targetUserId: userId, status, level, comment })
      });
      if (res.ok) {
        fetchTeamAnalytics();
        fetchServerRoster();
        setSelectedAgentId(null);
        setShowActionsModal(false);
        const msg = `Employee ${status === 'active' ? 'reactivated' : (status || 'updated')} successfully. Email notification sent.`;
        showDialog({ title: '✅ Success', message: msg, type: 'info' });
      } else {
        const data = await res.json();
        const msg = data.error || "Failed to update user";
        showDialog({ title: '❌ Error', message: msg, type: 'info' });
      }
    } catch (e) {
      showDialog({ title: 'Network Error', message: e.message, type: 'info' });
    } finally {
      setIsManaging(null);
    }
  };

  const handleForceReset = async (userId) => {
    // 🎨 [ACE_DIALOG] (v2.6.432): Uses state-driven AceDialog for cross-platform confirmation
    const confirmMsg = "This will generate a random secure password and email it to the employee. All current sessions will be terminated. Proceed?";
    const confirmed = await showDialog({ title: 'Force Password Reset', message: confirmMsg, type: 'danger', confirmText: 'Reset Password', cancelText: 'Cancel' });
    
    if (!confirmed) return;
    
    setIsManaging(userId);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json', 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/force-reset`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ targetUserId: userId })
      });
      if (res.ok) {
        setShowActionsModal(false);
        const msg = "Password reset successfully. New credentials have been emailed to the employee.";
        showDialog({ title: '✅ Success', message: msg, type: 'info' });
      } else {
        const data = await res.json();
        const msg = data.error || "Failed to reset password";
        showDialog({ title: '❌ Error', message: msg, type: 'info' });
      }
    } catch (e) {
      showDialog({ title: '❌ Error', message: e.message, type: 'info' });
    } finally {
      setIsManaging(null);
    }
  };

  const handleAssignHierarchy = async (agentId, type, newId) => {
    setIsAssigningManager(true);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json',
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body = {};
      if (type === 'manager') body.managerId = newId;
      if (type === 'teamLead') body.teamLeadId = newId;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/admin-core/team-directory/${agentId}/hierarchy`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        const label = type === 'manager' ? 'Reporting Manager' : 'Team Lead';
        showDialog({ title: '✅ Success', message: `${label} updated successfully`, type: 'info' });
        
        // 🔄 [INSTANT UPDATE] (v2.6.448): Update local agent data immediately
        // so the UI reflects the change without closing/reopening the modal
        if (serverAgents) {
          const updatedAgents = serverAgents.map(a => {
            if (a.id === agentId) {
              const updated = { ...a };
              if (type === 'manager') updated.managerId = newId;
              if (type === 'teamLead') updated.teamLeadId = newId;
              return updated;
            }
            return a;
          });
          setServerAgents(updatedAgents);
        }
        
        setShowManagerSelect(false);
      } else {
        showDialog({ title: '❌ Error', message: data.message || 'Failed to update', type: 'info' });
      }
    } catch (e) {
      showDialog({ title: '❌ Error', message: 'Network error', type: 'info' });
    } finally {
      setIsAssigningManager(false);
    }
  };

  // 🔄 Transfer Tickets Handler
  const handleTransferTickets = async (fromId) => {
    // 🛡️ [FILTER FIX] (v2.6.424): Target must be ACTIVE and NOT SUSPENDED/TERMINATED
    const otherAgents = allSupportAgents.filter(a => {
      if (a.id === fromId) return false;
      const status = (a.supportStatus || a.status || 'active').toLowerCase();
      return status === 'active';
    });

    if (otherAgents.length === 0) {
      const msg = 'There are no other active, non-suspended agents to receive these tickets.';
      showDialog({ title: 'No Targets Available', message: msg, type: 'info' });
      return;
    }

    // 🎨 [ACE_DIALOG] (v2.6.431): Premium picker replaces window.prompt
    const pickerOptions = otherAgents.map(a => ({ label: a.name || a.email || a.id, value: a }));
    const targetAgent = await showDialog({
      title: 'Transfer Tickets',
      message: `Select the target agent to receive all open tickets from ${selectedAgent?.name}:`,
      type: 'picker',
      confirmText: 'Transfer',
      cancelText: 'Cancel',
      pickerOptions
    });
    
    if (targetAgent) await executeTransfer(fromId, targetAgent);
  };

  const executeTransfer = async (fromId, targetAgent) => {
    setIsManaging(fromId);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json', 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/transfer-tickets`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ fromAgentId: fromId, toAgentId: targetAgent.id })
      });
      const data = await res.json();
      if (res.ok) {
        setShowActionsModal(false);
        const msg = data.message || `${data.transferred} ticket(s) transferred to ${targetAgent.name} successfully.`;
        showDialog({ title: '✅ Success', message: msg, type: 'info' });
        fetchTeamAnalytics();
      } else {
        const msg = data.error || 'Failed to transfer tickets';
        showDialog({ title: '❌ Transfer Failed', message: msg, type: 'info' });
      }
    } catch (e) {
      showDialog({ title: '❌ Network Error', message: e.message, type: 'info' });
    } finally {
      setIsManaging(null);
    }
  };

  // 🛡️ SERVER-TRUTH ROSTER (v2.6.145): Fetch support agents directly from server
  // Local cache may have stale supportStatus values from before termination
  const [serverAgents, setServerAgents] = useState(null);

  const fetchServerRoster = useCallback(async () => {
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/data?_t=${Date.now()}`, {
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const supportList = (data.players || []).filter(p => p.role === 'support');
        setServerAgents(supportList);
        console.log(`[SUPPORT_PANEL] Fetched ${supportList.length} support agents from server`);
      }
    } catch (e) {
      console.warn('[SUPPORT_PANEL] Server roster fetch failed, using local cache');
    }
  }, []);

  useEffect(() => {
    fetchServerRoster();
  }, [fetchServerRoster]);

  // Use server truth if available, otherwise fall back to local cache
  const allSupportAgents = useMemo(() => {
    let list = serverAgents || players || [];
    list = list.filter(p => {
      if (!p) return false;
      const role = (p.role || '').toLowerCase();
      return role === 'support' || role === 'admin' || role === 'superadmin';
    });
    
    // 🛡️ MANAGER VISIBILITY GUARD (v2.6.685)
    if ((currentUser?.supportLevel || '').toLowerCase() === 'manager') {
      list = list.filter(p => p.managerId === currentUser.id || p.id === currentUser.id);
    }
    
    return list;
  }, [serverAgents, players, currentUser]);

  const availableManagers = useMemo(() => {
    const list = serverAgents || players || [];
    return list.filter(p => {
      if (!p) return false;
      const role = (p.role || '').toLowerCase();
      const lvl = (p.supportLevel || '').toLowerCase();
      const status = (p.supportStatus || p.status || 'active').toLowerCase();
      if (status === 'terminated' || status === 'left') return false;
      return role === 'admin' || lvl === 'manager';
    });
  }, [serverAgents, players]);

  const availableTeamLeads = useMemo(() => {
    const list = serverAgents || players || [];
    return list.filter(p => {
      if (!p) return false;
      const lvl = (p.supportLevel || '').toLowerCase();
      const status = (p.supportStatus || p.status || 'active').toLowerCase();
      if (status === 'terminated' || status === 'left') return false;
      return lvl === 'team lead';
    });
  }, [serverAgents, players]);

  // 📊 [REPORT_COUNTS] (v2.6.449): Calculate reports for load balancing
  const reportCounts = useMemo(() => {
    const counts = {};
    allSupportAgents.forEach(a => {
      if (a.managerId) counts[a.managerId] = (counts[a.managerId] || 0) + 1;
      if (a.teamLeadId) counts[a.teamLeadId] = (counts[a.teamLeadId] || 0) + 1;
    });
    return counts;
  }, [allSupportAgents]);

  const activeAgents = useMemo(() => {
    return allSupportAgents.filter(a => {
      const status = (a.supportStatus || a.status || 'active').toLowerCase();
      const level = (a.supportLevel || a.level || '').toUpperCase();
      
      // 🛡️ Lifecycle Guard: Terminated unless re-onboarded later
      const hasActiveTermination = !!a.terminatedAt && (!a.reOnboardedAt || new Date(a.terminatedAt) > new Date(a.reOnboardedAt));
      
      const isExplicitlyEx = 
        status === 'terminated' || 
        status === 'inactive' || 
        status === 'left' ||
        level === 'EX-EMPLOYEE' ||
        hasActiveTermination;

      return !isExplicitlyEx;
    });
  }, [allSupportAgents]);

  const exEmployees = useMemo(() => {
    return allSupportAgents.filter(a => {
      const status = (a.supportStatus || a.status || '').toLowerCase();
      const level = (a.supportLevel || a.level || '').toUpperCase();

      // 🛡️ Lifecycle Guard: Terminated unless re-onboarded later
      const hasActiveTermination = !!a.terminatedAt && (!a.reOnboardedAt || new Date(a.terminatedAt) > new Date(a.reOnboardedAt));

      return (
        status === 'terminated' || 
        status === 'inactive' || 
        status === 'left' ||
        level === 'EX-EMPLOYEE' ||
        hasActiveTermination
      );
    });
  }, [allSupportAgents]);

  const displayedAgents = activeTab === 'employees' ? activeAgents : exEmployees;

  const filteredAgents = useMemo(() => {
    const s = search?.toLowerCase().trim() || '';
    if (!s) return displayedAgents;
    return displayedAgents.filter(a => 
      a.name?.toLowerCase().includes(s) || 
      a.id?.toLowerCase().includes(s) || 
      a.email?.toLowerCase().includes(s)
    );
  }, [displayedAgents, search]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return allSupportAgents.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, allSupportAgents]);

  const selectedAgentStats = useMemo(() => {
    if (!selectedAgentId || !analytics?.leaderboard) return null;
    return analytics.leaderboard.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, analytics]);

  const isSelectedTerminated = selectedAgent?.supportStatus === 'terminated' || selectedAgent?.supportStatus === 'inactive' || selectedAgent?.supportLevel === 'EX-EMPLOYEE';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Support Team</Text>
          <Text style={styles.subTitle}>Onboarded Personnel & KPI Audit</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleExportCSV} style={styles.exportBtn}>
            <Ionicons name="download-outline" size={18} color="#2563EB" />
            <Text style={styles.exportBtnText}>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => fetchTeamAnalytics()} disabled={isRefreshing}>
            <Ionicons name="refresh-circle" size={28} color="#6366F1" style={isRefreshing && { opacity: 0.5 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 🕐 Time Filter Bar */}
      <View style={styles.timeFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeFilterRow}>
          {TIME_FILTERS.map(f => (
            <TouchableOpacity 
              key={f.key} 
              onPress={() => handleTimeFilterChange(f.key)}
              style={[styles.timeChip, timeFilter === f.key && styles.timeChipActive]}
            >
              {f.key === 'custom' && <Ionicons name="calendar-outline" size={12} color={timeFilter === 'custom' ? '#FFF' : '#6366F1'} style={{ marginRight: 4 }} />}
              <Text style={[styles.timeChipText, timeFilter === f.key && styles.timeChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {analytics && timeFilter !== 'all' && (
          <Text style={styles.filterNote}>
            Showing {analytics.filteredTicketCount}/{analytics.totalTicketCount} tickets
          </Text>
        )}
      </View>

      {/* 📅 Custom Range Picker */}
      {showCustomRange && (
        <View style={styles.customRangeCard}>
          <Text style={styles.customRangeTitle}>Custom Date Range</Text>
          <View style={styles.customRangeRow}>
            <View style={styles.customRangeField}>
              <Text style={styles.customRangeLabel}>From</Text>
              <TextInput
                style={styles.customRangeInput}
                placeholder="YYYY-MM-DD HH:MM"
                placeholderTextColor="#94A3B8"
                value={customFrom}
                onChangeText={setCustomFrom}
              />
            </View>
            <View style={styles.customRangeField}>
              <Text style={styles.customRangeLabel}>To</Text>
              <TextInput
                style={styles.customRangeInput}
                placeholder="YYYY-MM-DD HH:MM"
                placeholderTextColor="#94A3B8"
                value={customTo}
                onChangeText={setCustomTo}
              />
            </View>
          </View>
          <View style={styles.customRangeActions}>
            <TouchableOpacity style={styles.customRangeCancelBtn} onPress={() => { setShowCustomRange(false); setTimeFilter('all'); }}>
              <Text style={styles.customRangeCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.customRangeApplyBtn} onPress={applyCustomRange}>
              <Ionicons name="checkmark" size={16} color="#FFF" />
              <Text style={styles.customRangeApplyText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 📊 Team Summary Cards */}
      {analytics?.teamSummary && (
        <View style={styles.teamSummaryRow}>
          <TouchableOpacity onPress={() => setDrillDownConfig({ title: 'Open Tickets', category: 'open' })} style={[styles.summaryCard, { borderLeftColor: '#3B82F6' }]}>  
            <Text style={styles.summaryValue}>{analytics.teamSummary.totalOpenTickets}</Text>
            <Text style={styles.summaryLabel}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDrillDownConfig({ title: 'Resolved Tickets', category: 'resolved' })} style={[styles.summaryCard, { borderLeftColor: '#10B981' }]}>  
            <Text style={styles.summaryValue}>{analytics.teamSummary.totalClosedResolved}</Text>
            <Text style={styles.summaryLabel}>Resolved</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDrillDownConfig({ title: 'Unassigned Queue', category: 'queue' })} style={[styles.summaryCard, { borderLeftColor: '#F59E0B' }]}>  
            <Text style={styles.summaryValue}>{analytics.teamSummary.unassignedQueue}</Text>
            <Text style={styles.summaryLabel}>Queue</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDrillDownConfig({ title: 'Overdue Tickets', category: 'overdue' })} style={[styles.summaryCard, { borderLeftColor: '#EF4444' }]}>  
            <Text style={styles.summaryValue}>{analytics.teamSummary.overdueTickets}</Text>
            <Text style={styles.summaryLabel}>Overdue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ⚠️ Automated Admin Alerts (Phase 4) */}
      {analytics?.teamSummary?.adminAlerts?.length > 0 && (
        <View style={styles.alertsContainer}>
           <Text style={styles.sectionTitle}>System Alerts</Text>
           {analytics.teamSummary.adminAlerts.map((alert, i) => (
             <View key={i} style={[styles.alertRow, alert.type === 'danger' ? styles.alertDanger : styles.alertWarning]}>
                <Ionicons name={alert.type === 'danger' ? 'warning' : 'alert-circle'} size={16} color={alert.type === 'danger' ? '#DC2626' : '#D97706'} />
                <Text style={[styles.alertText, { color: alert.type === 'danger' ? '#991B1B' : '#92400E' }]}>{alert.message}</Text>
             </View>
           ))}
        </View>
      )}

      {/* 📊 Ticket Type Breakdown (Phase 4) */}
      {analytics?.teamSummary?.ticketTypesBreakdown && Object.keys(analytics.teamSummary.ticketTypesBreakdown).length > 0 && (
        <View style={styles.breakdownContainer}>
           <Text style={styles.sectionTitle}>Ticket Types</Text>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
             <View style={styles.pillsRow}>
               {Object.entries(analytics.teamSummary.ticketTypesBreakdown).map(([type, count]) => (
                  <TouchableOpacity key={type} onPress={() => setDrillDownConfig({ title: `${type} Tickets`, category: 'type', typeStr: type })} style={styles.typePill}>
                    <Text style={styles.typePillLabel}>{type}</Text>
                    <View style={styles.typePillCountBadge}>
                      <Text style={styles.typePillCount}>{count}</Text>
                    </View>
                  </TouchableOpacity>
               ))}
             </View>
           </ScrollView>
        </View>
      )}

      {/* Sub-Tabs: Employees / Ex-Employees */}
      <View style={styles.subTabRow}>
        <TouchableOpacity 
          onPress={() => { setActiveTab('employees'); setSelectedAgentId(null); }}
          style={[styles.subTab, activeTab === 'employees' && styles.subTabActive]}
        >
          <Ionicons name="people" size={16} color={activeTab === 'employees' ? '#FFFFFF' : '#64748B'} />
          <Text style={[styles.subTabText, activeTab === 'employees' && styles.subTabTextActive]}>
            Employees ({activeAgents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => { setActiveTab('ex-employees'); setSelectedAgentId(null); }}
          style={[styles.subTab, activeTab === 'ex-employees' && styles.subTabActive, activeTab === 'ex-employees' && styles.subTabTerminated]}
        >
          <Ionicons name="person-remove" size={16} color={activeTab === 'ex-employees' ? '#FFFFFF' : '#94A3B8'} />
          <Text style={[styles.subTabText, activeTab === 'ex-employees' && styles.subTabTextActive]}>
            Ex-Employees ({exEmployees.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder={activeTab === 'employees' ? "Search active employees..." : "Search ex-employees..."}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Agent Avatars Row */}
      <View style={styles.userRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredAgents.map(agent => (
            <TouchableOpacity 
              key={agent.id} 
              onPress={() => setSelectedAgentId(agent.id)}
              style={[
                styles.miniCard, 
                selectedAgentId === agent.id && styles.miniCardActive,
                (agent.supportStatus === 'terminated' || agent.supportStatus === 'inactive' || agent.supportLevel === 'EX-EMPLOYEE') && styles.miniCardTerminated
              ]}
            >
              <View style={(agent.supportStatus === 'terminated' || agent.supportStatus === 'inactive' || agent.supportLevel === 'EX-EMPLOYEE') ? styles.avatarTerminated : null}>
                <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={40} borderRadius={12} />
              </View>
              <Text style={[
                styles.miniName, 
                selectedAgentId === agent.id && styles.miniNameActive,
                (agent.supportStatus === 'terminated' || agent.supportStatus === 'inactive' || agent.supportLevel === 'EX-EMPLOYEE') && styles.miniNameTerminated
              ]} numberOfLines={1}>
                {agent.firstName || agent.name?.split(' ')[0]}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {/* 🕐 Shift status indicator */}
                {agent.shiftStatus === 'on_shift' && (
                  <View style={{ backgroundColor: '#10B981', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                    <Text style={{ color: '#FFF', fontSize: 6, fontWeight: '900' }}>SHIFT</Text>
                  </View>
                )}
                <View style={[
                  styles.statusDot, 
                  { 
                    position: 'relative',
                    top: 0,
                    right: 0,
                    backgroundColor: (() => {
                      if (agent.supportStatus === 'terminated' || agent.supportStatus === 'inactive' || agent.supportLevel === 'EX-EMPLOYEE') return '#EF4444';
                      if (agent.supportStatus === 'suspended') return '#F97316';
                      const agentAtt = attendanceData?.find(a => String(a.id) === String(agent.id));
                      return agentAtt?.isCurrentlyOnline ? '#10B981' : '#CBD5E1';
                    })()
                  }
                ]} />
              </View>
            </TouchableOpacity>
          ))}
          {filteredAgents.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name={activeTab === 'employees' ? 'people-outline' : 'folder-open-outline'} size={24} color="#CBD5E1" />
              <Text style={styles.emptyAgents}>
                {activeTab === 'employees' ? 'No active support employees found.' : 'No ex-employees found.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      <View style={styles.mainContent}>
        {selectedAgent ? (
          <View style={[styles.detailCard, isSelectedTerminated && styles.detailCardTerminated]}>
            {/* Terminated Banner */}
            {isSelectedTerminated && (
              <View style={styles.terminatedBanner}>
                <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
                <Text style={styles.terminatedBannerText}>TERMINATED — Access Revoked</Text>
              </View>
            )}

            <View style={styles.detailHeader}>
              <View style={styles.detailAvatarBox}>
                <View style={isSelectedTerminated ? styles.avatarTerminated : null}>
                  <SafeAvatar uri={selectedAgent.avatar} name={selectedAgent.name} role={selectedAgent.role} size={64} borderRadius={20} />
                </View>
                <View style={styles.detailNameBox}>
                  <Text style={[styles.detailName, isSelectedTerminated && styles.textTerminated]}>{selectedAgent.name}</Text>
                  <Text style={styles.detailEmail}>{selectedAgent.email || selectedAgent.identifier || selectedAgent.id}</Text>
                  <View style={styles.levelRow}>
                    <Text style={[
                      styles.levelTag, 
                      isSelectedTerminated && styles.levelTagTerminated
                    ]}>
                      {selectedAgent.supportLevel || 'Trainee'}
                    </Text>
                    
                    {!isSelectedTerminated && (
                      <TouchableOpacity 
                        style={styles.attendanceTriggerBtn}
                        onPress={() => setShowAttendanceModal(true)}
                      >
                        <Ionicons name="time" size={12} color="#6366F1" />
                        <Text style={styles.attendanceTriggerText}>Attendance</Text>
                      </TouchableOpacity>
                    )}

                    <View style={[
                      styles.statusPill,
                      { backgroundColor: isSelectedTerminated ? '#FEE2E2' : ((selectedAgent.supportStatus === 'suspended' || selectedAgent.status === 'suspended') ? '#FFF7ED' : ((selectedAgent.supportStatus === 'overwhelmed' || selectedAgent.status === 'overwhelmed') ? '#FEF3C7' : '#D1FAE5')) }
                    ]}>
                      <View style={[
                        styles.statusPillDot, 
                        { backgroundColor: isSelectedTerminated ? '#EF4444' : ((selectedAgent.supportStatus === 'suspended' || selectedAgent.status === 'suspended') ? '#F97316' : ((selectedAgent.supportStatus === 'overwhelmed' || selectedAgent.status === 'overwhelmed') ? '#F59E0B' : '#10B981')) }
                      ]} />
                      <Text style={[
                        styles.statusPillText,
                        { color: isSelectedTerminated ? '#DC2626' : ((selectedAgent.supportStatus === 'suspended' || selectedAgent.status === 'suspended') ? '#EA580C' : ((selectedAgent.supportStatus === 'overwhelmed' || selectedAgent.status === 'overwhelmed') ? '#D97706' : '#059669')) }
                      ]}>
                        {isSelectedTerminated ? 'Terminated' : (selectedAgent.supportStatus || selectedAgent.status || 'Active')}
                      </Text>
                    </View>

                    {/* 🕐 Shift Status Badge (v2.6.674) */}
                    {!isSelectedTerminated && (
                      <View style={[
                        styles.statusPill,
                        { backgroundColor: selectedAgent.shiftStatus === 'on_shift' ? '#ECFDF5' : '#FEF2F2', marginLeft: 6 }
                      ]}>
                        <View style={[
                          styles.statusPillDot,
                          { backgroundColor: selectedAgent.shiftStatus === 'on_shift' ? '#10B981' : '#EF4444' }
                        ]} />
                        <Text style={[
                          styles.statusPillText,
                          { color: selectedAgent.shiftStatus === 'on_shift' ? '#059669' : '#DC2626' }
                        ]}>
                          {selectedAgent.shiftStatus === 'on_shift' ? 'On Shift' : 'Off Shift'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Settings Button — only for ACTIVE/SUSPENDED employees */}
            {!isSelectedTerminated && (
              <TouchableOpacity 
                style={styles.settingsBtn}
                onPress={() => setShowActionsModal(true)}
              >
                <Ionicons name="settings" size={20} color="#6366F1" />
              </TouchableOpacity>
            )}

            {/* Re-Onboard Button — only for TERMINATED employees */}
            {isSelectedTerminated && (
              <TouchableOpacity 
                style={styles.reOnboardBtn}
                onPress={() => {
                  Alert.alert(
                    "Re-Onboard Employee",
                    `This will restore ${selectedAgent.name}'s access and move them back to the active Employees list. Proceed?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Re-Onboard", onPress: () => updateUserStatus(selectedAgent.id, 'active') }
                    ]
                  );
                }}
              >
                <Ionicons name="person-add" size={16} color="#FFFFFF" />
                <Text style={styles.reOnboardText}>Re-Onboard</Text>
              </TouchableOpacity>
            )}

            {/* 📊 Performance Stats Grid — Enhanced (v2.6.147) */}
            <View style={styles.statsGrid}>
               <TouchableOpacity 
                 style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}
                 onPress={() => setDrillDownConfig({ title: `${selectedAgent.name}'s Active Tickets`, category: 'agent-active', agentId: selectedAgent.id })}
               >
                 <Text style={styles.statLabel}>ACTIVE TICKETS</Text>
                 <Text style={[styles.statValue, { color: isSelectedTerminated ? '#94A3B8' : '#3B82F6' }]}>{selectedAgentStats?.stats?.activeTickets || 0}</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}
                 onPress={() => setDrillDownConfig({ title: `${selectedAgent.name}'s Resolved Tickets`, category: 'agent-resolved', agentId: selectedAgent.id })}
               >
                 <Text style={styles.statLabel}>CLOSED / RESOLVED</Text>
                 <Text style={[styles.statValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.stats?.closedResolvedCount || 0}</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}
                 onPress={() => setDrillDownConfig({ title: `${selectedAgent.name}'s Rated Tickets`, category: 'agent-rated', agentId: selectedAgent.id })}
               >
                 <Text style={styles.statLabel}>AVG RATING</Text>
                 <Text style={[styles.statValue, { color: isSelectedTerminated ? '#94A3B8' : '#F59E0B' }]}>★ {selectedAgentStats?.stats?.csatScore || 'N/A'}</Text>
               </TouchableOpacity>
            </View>

            {/* 📈 Detailed Metrics List — Enhanced (v2.6.147) */}
            <View style={styles.metricsList}>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Total Handled</Text>
                 <Text style={[styles.mValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.stats?.totalHandled || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Avg Resolution Time</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#6366F1' }]}>{formatDuration(selectedAgentStats?.stats?.avgResolutionMs)}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Avg First Response</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#10B981' }]}>{formatDuration(selectedAgentStats?.stats?.avgFirstResponseMs)}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Tickets Reopened</Text>
                 <Text style={[styles.mValue, { color: (selectedAgentStats?.stats?.reopenedCount || 0) > 0 ? '#EF4444' : '#94A3B8' }]}>{selectedAgentStats?.stats?.reopenedCount || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>SLA Compliance (24h)</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : ((selectedAgentStats?.stats?.slaPercent || 0) >= 80 ? '#10B981' : '#F59E0B') }]}>
                   {selectedAgentStats?.stats?.slaPercent != null ? `${selectedAgentStats.stats.slaPercent}%` : 'N/A'}
                 </Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Escalation Rate</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#64748B' }]}>{selectedAgentStats?.stats?.escalationRate || 0}%</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Manual Pool Picks</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#10B981' }]}>+{selectedAgentStats?.stats?.manualPicks || 0}</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Weighted Score</Text>
                 <Text style={[styles.mValue, { color: isSelectedTerminated ? '#94A3B8' : '#6366F1', fontWeight: '900' }]}>{selectedAgentStats?.score || '0.0'} pts</Text>
               </View>
               <View style={styles.metricRow}>
                 <Text style={styles.mLabel}>Onboarded Via</Text>
                 <Text style={styles.mValue}>{selectedAgent.onboardedVia || 'Invite'}</Text>
               </View>
               {isSelectedTerminated && selectedAgent.terminatedAt && (
                 <View style={styles.metricRow}>
                   <Text style={styles.mLabel}>Terminated On</Text>
                   <Text style={[styles.mValue, { color: '#EF4444' }]}>
                     {new Date(selectedAgent.terminatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                   </Text>
                 </View>
               )}
            </View>

            {/* 🕰️ Activity Timeline Button */}
            {selectedAgentStats?.activityTimeline && selectedAgentStats.activityTimeline.length > 0 && (
              <View style={[styles.timelineSection, { paddingBottom: 16 }]}>
                <Text style={styles.timelineTitle}>Recent Activity</Text>
                <TouchableOpacity 
                  style={{
                    backgroundColor: '#F1F5F9',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 8
                  }} 
                  onPress={() => setShowActivityModal(true)}
                >
                  <Ionicons name="time-outline" size={20} color="#475569" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 14 }}>View Recent Activity Log</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Attendance UI moved to Full-Screen Modal */}
          </View>
        ) : (
          <View style={styles.selectHint}>
            <Ionicons name={activeTab === 'employees' ? 'finger-print-outline' : 'archive-outline'} size={48} color="#E2E8F0" />
            <Text style={styles.selectHintText}>
              {activeTab === 'employees' 
                ? 'Select an agent above for deep diagnostics' 
                : 'Select an ex-employee to view their history'}
            </Text>
          </View>
        )}

        {/* 📊 Caseload Distribution — only in Employees tab */}
        {activeTab === 'employees' && analytics?.leaderboard && analytics.leaderboard.length > 0 && (
          <View style={styles.caseloadSection}>
            <Text style={styles.caseloadTitle}>Caseload Distribution</Text>
            {(() => {
              const maxLoad = Math.max(...analytics.leaderboard.map(e => e.stats?.activeTickets || 0), 1);
              return analytics.leaderboard
                .filter(e => e.status !== 'terminated')
                .sort((a, b) => (b.stats?.activeTickets || 0) - (a.stats?.activeTickets || 0))
                .map(entry => {
                  const load = entry.stats?.activeTickets || 0;
                  const pct = Math.max((load / maxLoad) * 100, 4);
                  const barColor = load === 0 ? '#E2E8F0' : load >= 8 ? '#EF4444' : load >= 5 ? '#F59E0B' : '#10B981';
                  const statusIcon = entry.status === 'suspended' ? '🔒' : entry.status === 'overwhelmed' ? '⚠️' : '';
                  return (
                    <View key={entry.id} style={styles.caseloadRow}>
                      <Text style={styles.caseloadName} numberOfLines={1}>{statusIcon}{entry.name?.split(' ')[0]}</Text>
                      <View style={styles.caseloadBarBg}>
                        <View style={[styles.caseloadBar, { width: `${pct}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={[styles.caseloadCount, { color: barColor === '#E2E8F0' ? '#94A3B8' : barColor }]}>{load}</Text>
                    </View>
                  );
                });
            })()}
          </View>
        )}

        {/* Global Leaderboard Section — only in Employees tab */}
        {activeTab === 'employees' && (
          <View style={styles.leaderboardSection}>
            <Text style={styles.leaderboardTitle}>Team Performance Leaderboard</Text>
            {analytics?.leaderboard
              ?.filter(entry => entry.status !== 'terminated')
              ?.map((entry, idx) => (
                <View key={entry.id} style={[styles.leaderboardItem, selectedAgentId === entry.id && styles.leaderboardItemActive]}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{entry.name}</Text>
                  <View style={styles.rankMeta}>
                    <Text style={styles.rankMetaText}>{entry.stats?.activeTickets || 0} active</Text>
                  </View>
                  <View style={styles.rankScoreBox}>
                    <Text style={styles.rankScore}>{entry.score}</Text>
                    <Text style={styles.rankScoreUnits}>pts</Text>
                  </View>
                </View>
              ))}
          </View>
        )}
      </View>

      <DrillDownModal {...{ drillDownConfig, setDrillDownConfig, analytics, fetchTeamAnalytics, onOpenTicket, players }} />

      <AttendanceModal {...{ showAttendanceModal, setShowAttendanceModal, attendanceData, selectedAgentId, isLoadingAttendance, fetchAttendance, attendanceRangeMode, attendanceDateFilter, attendanceEndDateFilter, getLocalDateString, selectedAgent, calendarMonth, setCalendarMonth, attendanceCalendarMode, setAttendanceCalendarMode, selectedLeaveDate, setSelectedLeaveDate, setAttendanceRangeMode, setShowDatePicker, setShowEndDatePicker, showDatePicker, showEndDatePicker, setAttendanceDateFilter, setAttendanceEndDateFilter }} />
      {/* 🛡️ Employee Actions Modal (v2.6.279): Better Web/Mobile Support */}
      <ActionsModal {...{ showActionsModal, setShowActionsModal, selectedAgent, isSelectedTerminated, SUPPORT_HIERARCHY, pendingRoleChange, setPendingRoleChange, showRoleConfirmModal, setShowRoleConfirmModal, roleChangeComment, setRoleChangeComment, updateUserStatus, isManaging, handleForceReset, setShowManagerSelect, showDialog, reportCounts, handleTransferTickets, availableTeamLeads, activeAgents, setEditShiftStart, setEditShiftEnd, allSupportAgents, availableManagers, managerSearch, setManagerSearch, handleAssignHierarchy, isAssigningManager, leadSearch, setLeadSearch, editShiftStart, editShiftEnd, isUpdatingShift, setIsUpdatingShift, storage, currentUser, config, apiFetch }} />
      {/* 🛡️ Role Change Confirmation Modal (v2.6.288) */}
      <ManagerSelectModal {...{ showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads, handleAssignHierarchy, isAssigningManager, reportCounts, showRoleConfirmModal, setShowRoleConfirmModal, setPendingRoleChange, pendingRoleChange, roleChangeComment, setRoleChangeComment, updateUserStatus }} />
      {/* 🕰️ Recent Activity Modal */}
      <ActivityModal {...{ showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration, selectedAgentStats }} />
      {selectedSessionForActivity && (
        <Modal transparent={false} animationType="slide">
          <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingHorizontal: 20, 
              paddingTop: Platform.OS === 'ios' ? 60 : 20, 
              paddingBottom: 20, 
              backgroundColor: '#FFF', 
              borderBottomWidth: 1, 
              borderBottomColor: '#E2E8F0',
              elevation: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4
            }}>
              <TouchableOpacity 
                onPress={() => setSelectedSessionForActivity(null)} 
                style={{ padding: 8, marginRight: 12, backgroundColor: '#F1F5F9', borderRadius: 12 }}
              >
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>Session Activities</Text>
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                  {new Date(selectedSessionForActivity.startTime).toLocaleTimeString()} → {selectedSessionForActivity.isLive ? 'ACTIVE NOW' : new Date(selectedSessionForActivity.endTime).toLocaleTimeString()}
                </Text>
              </View>
            </View>
            <ScrollView style={{ flex: 1, padding: 20 }}>
              {sessionActivities.length > 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
                    <View style={{ padding: 8, backgroundColor: '#E0E7FF', borderRadius: 8 }}>
                      <Ionicons name="flash" size={18} color="#6366F1" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#475569' }}>
                      {sessionActivities.length} Actions Recorded
                    </Text>
                  </View>
                  {sessionActivities.map((log, idx) => (
                    <TouchableOpacity 
                      key={log.id} 
                      style={{ marginBottom: 16, padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', ...shadows.sm }}
                      activeOpacity={log.entityId ? 0.6 : 1}
                      onPress={() => {
                        if (log.entityId && onOpenTicket) {
                          setSelectedSessionForActivity(null);
                          setTimeout(() => onOpenTicket(log.entityId, log.timestamp), 150);
                        }
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' }} />
                          <Text style={{ fontWeight: '800', color: '#0F172A', fontSize: 13 }}>{log.action.replace(/_/g, ' ')}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '700' }}>
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={{ color: '#475569', fontSize: 14, lineHeight: 20 }}>{log.details}</Text>
                      {log.entityId && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="open-outline" size={12} color="#6366F1" />
                          <Text style={{ fontSize: 11, color: '#6366F1', fontWeight: '700' }}>Ticket: {log.entityId} — Tap to open</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <View style={{ alignItems: 'center', padding: 60, marginTop: 40 }}>
                  <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
                    <Ionicons name="cafe-outline" size={48} color="#CBD5E1" />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#1E293B' }}>Idle Session</Text>
                  <Text style={{ marginTop: 12, fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 }}>
                    The support agent was online, but no ticket interactions were recorded during this specific time window.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* 🎨 [ACE_DIALOG] (v2.6.431): Global dialog mount point */}
      <AceDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        pickerOptions={dialog.pickerOptions}
        onConfirm={() => dismissDialog(true)}
        onCancel={() => dismissDialog(false)}
        onPickerSelect={(val) => dismissDialog(val)}
      />
    </View>
  );
};


// Styles extracted to ./AdminSupportTeamPanel.styles.js
export default AdminSupportTeamPanel;
