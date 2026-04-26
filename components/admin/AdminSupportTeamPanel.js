import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';
import storage from '../../utils/storage';
import { usePlayers } from '../../context/PlayerContext';
import SafeAvatar from '../SafeAvatar';
import PureJSDateTimePicker from '../PureJSDateTimePicker';

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
  const { players } = usePlayers();
  
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManaging, setIsManaging] = useState(null);
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'ex-employees'

  // Phase 5: Drill-Down Modal Config
  const [drillDownConfig, setDrillDownConfig] = useState(null);

  // 🕐 Time Filter State
  const [timeFilter, setTimeFilter] = useState('all');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // 🕐 [ATTENDANCE] (v2.6.267): Attendance data state
  const [attendanceData, setAttendanceData] = useState(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceDateFilter, setAttendanceDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleExportCSV = async () => {
    const token = await storage.getItem('userToken');
    const url = `${config.API_BASE_URL}/api/support/export?token=${token}&userId=admin`;
    Alert.alert(
      "Export Data",
      "This will download a CSV containing all ticket data and metrics.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Download", onPress: () => Linking.openURL(url) }
      ]
    );
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
       const res = await fetch(`${config.API_BASE_URL}/api/support/analytics${queryParams}`, {
         headers: { 
           'Authorization': `Bearer ${token}`,
           'x-user-id': 'admin' 
         }
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
      const res = await fetch(`${config.API_BASE_URL}/api/support/attendance`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-user-id': 'admin' 
        }
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

  const updateUserStatus = async (userId, status, level) => {
    setIsManaging(userId);
    try {
      const token = await storage.getItem('userToken');
      const res = await fetch(`${config.API_BASE_URL}/api/support/manage-user`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'x-user-id': 'admin' 
        },
        body: JSON.stringify({ targetUserId: userId, status, level })
      });
      if (res.ok) {
        fetchTeamAnalytics();
        fetchServerRoster();
        setSelectedAgentId(null);
        Alert.alert("Success", "Employee profile updated successfully.");
      } else {
        const data = await res.json();
        Alert.alert("Error", data.error || "Failed to update user");
      }
    } catch (e) {
      Alert.alert("Network Error", e.message);
    } finally {
      setIsManaging(null);
    }
  };

  const handleForceReset = async (userId) => {
    Alert.alert(
      "Force Password Reset",
      "This will generate a random secure password and email it to the employee. All current sessions will be terminated. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset Password", style: "destructive", onPress: async () => {
          setIsManaging(userId);
          try {
            const token = await storage.getItem('userToken');
            const res = await fetch(`${config.API_BASE_URL}/api/support/force-reset`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}`, 
                'x-user-id': 'admin' 
              },
              body: JSON.stringify({ targetUserId: userId })
            });
            if (res.ok) {
              Alert.alert("Success", "Password reset successfully. Credentials sent to employee.");
            } else {
              const data = await res.json();
              Alert.alert("Error", data.error || "Failed to reset password");
            }
          } catch (e) {
            Alert.alert("Error", e.message);
          } finally {
            setIsManaging(null);
          }
         }}
      ]
    );
  };

  // 🔄 Transfer Tickets Handler
  const handleTransferTickets = async (fromId) => {
    const otherAgents = activeAgents.filter(a => a.id !== fromId);
    if (otherAgents.length === 0) {
      Alert.alert('No Agents Available', 'There are no other active agents to transfer tickets to.');
      return;
    }
    const buttons = otherAgents.map(a => ({
      text: a.name || `${a.firstName} ${a.lastName}`,
      onPress: async () => {
        setIsManaging(fromId);
        try {
          const token = await storage.getItem('userToken');
          const res = await fetch(`${config.API_BASE_URL}/api/support/transfer-tickets`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${token}`, 
              'x-user-id': 'admin' 
            },
            body: JSON.stringify({ fromAgentId: fromId, toAgentId: a.id })
          });
          const data = await res.json();
          if (res.ok) {
            Alert.alert('Tickets Transferred', data.message || `${data.transferred} ticket(s) transferred.`);
            fetchTeamAnalytics();
          } else {
            Alert.alert('Error', data.error || 'Failed to transfer tickets');
          }
        } catch (e) {
          Alert.alert('Network Error', e.message);
        } finally {
          setIsManaging(null);
        }
      }
    }));
    buttons.unshift({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Transfer Tickets To', `Select the target agent to receive all open tickets from ${selectedAgent?.name}:`, buttons);
  };

  // 🛡️ SERVER-TRUTH ROSTER (v2.6.145): Fetch support agents directly from server
  // Local cache may have stale supportStatus values from before termination
  const [serverAgents, setServerAgents] = useState(null);

  const fetchServerRoster = useCallback(async () => {
    try {
      const token = await storage.getItem('userToken');
      const res = await fetch(`${config.API_BASE_URL}/api/data`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-user-id': 'admin'
        }
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
    if (serverAgents) return serverAgents;
    return (players || []).filter(p => p.role === 'support');
  }, [serverAgents, players]);

  const activeAgents = useMemo(() => {
    return allSupportAgents.filter(a => 
      a.supportStatus !== 'terminated' && 
      a.supportStatus !== 'inactive' && 
      a.supportLevel !== 'EX-EMPLOYEE'
    );
  }, [allSupportAgents]);

  const exEmployees = useMemo(() => {
    return allSupportAgents.filter(a => 
      a.supportStatus === 'terminated' || 
      a.supportStatus === 'inactive' || 
      a.supportLevel === 'EX-EMPLOYEE'
    );
  }, [allSupportAgents]);

  const displayedAgents = activeTab === 'employees' ? activeAgents : exEmployees;

  const filteredAgents = useMemo(() => {
    const s = search.toLowerCase().trim();
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
              <View style={[
                styles.statusDot, 
                { 
                  backgroundColor: (() => {
                    if (agent.supportStatus === 'terminated' || agent.supportStatus === 'inactive' || agent.supportLevel === 'EX-EMPLOYEE') return '#EF4444';
                    if (agent.supportStatus === 'suspended') return '#F97316';
                    
                    // Live Online Status
                    const agentAtt = attendanceData?.find(a => String(a.id) === String(agent.id));
                    return agentAtt?.isCurrentlyOnline ? '#10B981' : '#CBD5E1'; // Green if online, Gray if offline
                  })()
                }
              ]} />
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

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
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
                      { backgroundColor: isSelectedTerminated ? '#FEE2E2' : (selectedAgent.supportStatus === 'suspended' ? '#FFF7ED' : (selectedAgent.supportStatus === 'overwhelmed' ? '#FEF3C7' : '#D1FAE5')) }
                    ]}>
                      <View style={[
                        styles.statusPillDot, 
                        { backgroundColor: isSelectedTerminated ? '#EF4444' : (selectedAgent.supportStatus === 'suspended' ? '#F97316' : (selectedAgent.supportStatus === 'overwhelmed' ? '#F59E0B' : '#10B981')) }
                      ]} />
                      <Text style={[
                        styles.statusPillText,
                        { color: isSelectedTerminated ? '#DC2626' : (selectedAgent.supportStatus === 'suspended' ? '#EA580C' : (selectedAgent.supportStatus === 'overwhelmed' ? '#D97706' : '#059669')) }
                      ]}>
                        {isSelectedTerminated ? 'Terminated' : (selectedAgent.supportStatus || 'Active')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Settings Button — only for ACTIVE/SUSPENDED employees */}
            {!isSelectedTerminated && (
              <TouchableOpacity 
                style={styles.settingsBtn}
                onPress={() => {
                     const isSuspended = selectedAgent.supportStatus === 'suspended';
                     const currentLevel = selectedAgent.supportLevel || 'Trainee';
                     
                     // Build dynamic action list
                     const actions = [{ text: "Cancel", style: "cancel" }];
                     
                     // Promote options (only for active)
                     if (!isSuspended) {
                       if (currentLevel !== 'Specialist') actions.push({ text: "Promote → Specialist", onPress: () => updateUserStatus(selectedAgent.id, null, 'Specialist') });
                       if (currentLevel !== 'Senior') actions.push({ text: "Promote → Senior", onPress: () => updateUserStatus(selectedAgent.id, null, 'Senior') });
                     }
                     
                     // Demote options
                     if (currentLevel === 'Senior') actions.push({ text: "Demote → Specialist", onPress: () => updateUserStatus(selectedAgent.id, null, 'Specialist') });
                     if (currentLevel !== 'Trainee') actions.push({ text: "Demote → Trainee", onPress: () => updateUserStatus(selectedAgent.id, null, 'Trainee') });
                     
                     // Suspend/Unsuspend
                     if (isSuspended) {
                       actions.push({ text: "✅ Unsuspend (Reactivate)", onPress: () => updateUserStatus(selectedAgent.id, 'active') });
                     } else {
                       actions.push({ 
                         text: selectedAgent.supportStatus === 'overwhelmed' ? "Resume Distribution" : "Pause Distribution", 
                         onPress: () => updateUserStatus(selectedAgent.id, selectedAgent.supportStatus === 'overwhelmed' ? 'active' : 'overwhelmed') 
                       });
                       actions.push({ text: "🔒 Suspend Account", onPress: () => {
                         Alert.alert("Confirm Suspension", "This will temporarily freeze the account and unassign all open tickets. The employee can be unsuspended later.", [
                           { text: "Cancel" },
                           { text: "Suspend", style: 'destructive', onPress: () => updateUserStatus(selectedAgent.id, 'suspended') }
                         ]);
                       }});
                     }
                     
                     // Transfer Tickets
                     if (!isSuspended) {
                       actions.push({ text: "🔄 Transfer All Tickets", onPress: () => handleTransferTickets(selectedAgent.id) });
                     }
                     
                     // Terminate & Reset
                     actions.push({ text: "Terminate Access", style: 'destructive', onPress: () => {
                       Alert.alert("Confirm Termination", "This will unassign all tickets instantly and revoke dashboard access. The employee will be moved to Ex-Employees. Proceed?", [
                         { text: "Cancel" },
                         { text: "Terminate", style: 'destructive', onPress: () => updateUserStatus(selectedAgent.id, 'terminated') }
                       ]);
                     }});
                     actions.push({ text: "Reset Password", onPress: () => handleForceReset(selectedAgent.id) });
                     
                     Alert.alert("Employee Actions", `Manage ${selectedAgent.name}\nLevel: ${currentLevel} | Status: ${isSuspended ? 'Suspended' : (selectedAgent.supportStatus || 'Active')}`, actions);
                  }}
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
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>ACTIVE TICKETS</Text>
                 <Text style={[styles.statValue, { color: isSelectedTerminated ? '#94A3B8' : '#3B82F6' }]}>{selectedAgentStats?.stats?.activeTickets || 0}</Text>
               </View>
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>CLOSED / RESOLVED</Text>
                 <Text style={[styles.statValue, isSelectedTerminated && styles.textMuted]}>{selectedAgentStats?.stats?.closedResolvedCount || 0}</Text>
               </View>
               <View style={[styles.statBox, isSelectedTerminated && styles.statBoxTerminated]}>
                 <Text style={styles.statLabel}>AVG RATING</Text>
                 <Text style={[styles.statValue, { color: isSelectedTerminated ? '#94A3B8' : '#F59E0B' }]}>★ {selectedAgentStats?.stats?.csatScore || 'N/A'}</Text>
               </View>
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

            {/* 🕰️ Activity Timeline (v2.6.148 Target) */}
            {selectedAgentStats?.activityTimeline && selectedAgentStats.activityTimeline.length > 0 && (
              <View style={styles.timelineSection}>
                <Text style={styles.timelineTitle}>Recent Activity</Text>
                {selectedAgentStats.activityTimeline.map((act, idx) => {
                  let icon, color, text;
                  if (act.type === 'assignment') { icon = 'person-add'; color = '#3B82F6'; text = `Assigned ticket #${act.ticketId.slice(-4)}`; }
                  else if (act.type === 'reply') { icon = 'chatbubble-ellipses'; color = '#8B5CF6'; text = `Replied to #${act.ticketId.slice(-4)}`; }
                  else if (act.type === 'closure') { icon = 'checkmark-circle'; color = '#10B981'; text = `Closed #${act.ticketId.slice(-4)}`; }
                  else if (act.type === 'resolved') { icon = 'shield-checkmark'; color = '#10B981'; text = `Resolved #${act.ticketId.slice(-4)}`; }
                  else if (act.type === 'csat_received') { icon = 'star'; color = '#F59E0B'; text = `Rated ${act.rating}★ on #${act.ticketId.slice(-4)}`; }
                  
                  return (
                    <View key={idx} style={styles.timelineRow}>
                      <View style={styles.timelineLine} />
                      <View style={[styles.timelineIconNode, { backgroundColor: color + '1A' }]}>
                        <Ionicons name={icon} size={12} color={color} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineText}>{text}</Text>
                        <Text style={styles.timelineTime}>
                           {new Date(act.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  );
                })}
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
      </ScrollView>

      {/* Drill-Down Modal Configuration (Phase 5) */}
      {drillDownConfig && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDrillDownConfig(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{drillDownConfig.title}</Text>
                <TouchableOpacity onPress={() => setDrillDownConfig(null)}>
                  <Ionicons name="close-circle" size={28} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                {(() => {
                  if (!analytics?.tickets) {
                    return (
                      <View style={{ alignItems: 'center', padding: 40 }}>
                        <ActivityIndicator size="large" color="#6366F1" style={{ marginBottom: 16 }} />
                        <Text style={{ color: '#64748B', fontWeight: '600', marginBottom: 20 }}>Synchronizing drill-down data...</Text>
                        <TouchableOpacity 
                          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#EFF6FF', borderRadius: 8 }}
                          onPress={() => fetchTeamAnalytics()}
                        >
                          <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Force Resync</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  let list = analytics.tickets;
                  if (drillDownConfig.category === 'open') list = list.filter(t => ['Open', 'In Progress', 'Awaiting Response'].includes(t.status));
                  else if (drillDownConfig.category === 'resolved') list = list.filter(t => t.status === 'Closed' || t.status === 'Resolved');
                  else if (drillDownConfig.category === 'queue') list = list.filter(t => !t.assignedTo && t.status === 'Open');
                  else if (drillDownConfig.category === 'overdue') {
                    list = list.filter(t => {
                      if (t.status === 'Closed' || t.status === 'Resolved') return false;
                      const created = new Date(t.createdAt);
                      return (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
                    });
                  } else if (drillDownConfig.category === 'type') list = list.filter(t => (t.type || 'Other') === drillDownConfig.typeStr);
                  
                  if (list.length === 0) return <Text style={styles.emptyAgents}>No tickets match this filter.</Text>;

                  return list.map(t => (
                    <TouchableOpacity 
                      key={t.id} 
                      style={styles.drillTicketCard}
                      onPress={() => {
                        setDrillDownConfig(null);
                        onOpenTicket && onOpenTicket(t.id);
                      }}
                    >
                       <View style={styles.drillTicketHeader}>
                         <Text style={styles.drillTicketId}>#{t.id.slice(-5)}</Text>
                         <Text style={[styles.drillTicketStatus, t.status === 'Open' ? { color: '#3B82F6'} : t.status === 'Closed' || t.status === 'Resolved' ? { color: '#10B981' } : { color: '#F59E0B' }]}>{t.status}</Text>
                       </View>
                       <Text style={styles.drillTicketTitle} numberOfLines={1}>{t.title || 'Untitled Ticket'}</Text>
                       <View style={styles.drillTicketMeta}>
                          <Text style={styles.drillTicketAgent}>Agent: {t.assignedTo ? (players?.find(p => p.id === t.assignedTo)?.name || 'Unknown') : 'Unassigned'}</Text>
                          {t.rating && <Text style={styles.drillTicketRating}>★ {t.rating}/5</Text>}
                       </View>
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* 🕐 Attendance Modal (Full Screen) */}
      <Modal visible={showAttendanceModal} transparent animationType="slide" onRequestClose={() => setShowAttendanceModal(false)}>
        <View style={styles.attendanceModalOverlay}>
          <View style={styles.attendanceModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance & Working Hours</Text>
              <TouchableOpacity onPress={() => setShowAttendanceModal(false)}>
                <Ionicons name="close-circle" size={28} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {(() => {
              const agentAttendance = attendanceData?.find(a => String(a.id) === String(selectedAgentId));
              if (!agentAttendance && isLoadingAttendance) {
                return (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={{ marginTop: 12, color: '#64748B', fontWeight: '600' }}>Fetching records...</Text>
                  </View>
                );
              }
              if (!agentAttendance) {
                return (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#64748B', fontWeight: '600' }}>No attendance data available.</Text>
                    <TouchableOpacity onPress={fetchAttendance} style={{ marginTop: 12, padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}>
                      <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Retry Sync</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              // Compute stats for selected date
              const filterDateStr = attendanceDateFilter;
              const isTodayFilter = filterDateStr === new Date().toISOString().split('T')[0];
              
              const dateSessions = (agentAttendance.allSessions || []).filter(s => {
                const sDate = new Date(s.startTime).toISOString().split('T')[0];
                return sDate === filterDateStr;
              });

              // Add live sessions to today's count if today is selected
              let totalMsForDate = dateSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
              let liveSessionDocs = [];
              if (isTodayFilter && agentAttendance.isCurrentlyOnline) {
                liveSessionDocs = agentAttendance.activeSessions || [];
                totalMsForDate += liveSessionDocs.reduce((sum, s) => sum + (s.durationMs || 0), 0);
              }

              const displaySessions = [...liveSessionDocs, ...dateSessions.reverse()];
              const dateHours = Math.floor(totalMsForDate / 3600000);
              const dateMins = Math.floor((totalMsForDate % 3600000) / 60000);
              const dateProgress = Math.min((totalMsForDate / (8 * 3600000)) * 100, 100);
              const maxWeeklyMs = Math.max(...(agentAttendance.weeklyDays || []).map(d => d.totalMs), 1);

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                  
                  {/* Current Live Status (Only show if viewing Today) */}
                  {isTodayFilter && (
                    <View style={[styles.attendanceStatusCard, { borderLeftColor: agentAttendance.isCurrentlyOnline ? '#10B981' : '#94A3B8' }]}>
                      <View style={[styles.attendanceLiveDot, { backgroundColor: agentAttendance.isCurrentlyOnline ? '#10B981' : '#CBD5E1' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.attendanceStatusText, { color: agentAttendance.isCurrentlyOnline ? '#059669' : '#64748B' }]}>
                          {agentAttendance.isCurrentlyOnline ? 'Currently Online' : 'Offline'}
                        </Text>
                        {!agentAttendance.isCurrentlyOnline && agentAttendance.lastSeen && agentAttendance.lastSeen !== 'Now' && (
                          <Text style={styles.attendanceLastSeen}>
                            Last seen {new Date(agentAttendance.lastSeen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                        {agentAttendance.isCurrentlyOnline && agentAttendance.activeSessions?.length > 0 && (
                          <Text style={styles.attendanceLastSeen}>
                            Session started {new Date(agentAttendance.activeSessions[0].startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Date Filter Controls */}
                  <View style={styles.dateFilterContainer}>
                    <TouchableOpacity 
                      onPress={() => {
                        const d = new Date(filterDateStr);
                        d.setDate(d.getDate() - 1);
                        setAttendanceDateFilter(d.toISOString().split('T')[0]);
                      }}
                      style={styles.dateNavBtn}
                    >
                      <Ionicons name="chevron-back" size={20} color="#6366F1" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.dateDisplayBox}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={16} color="#64748B" />
                      <Text style={styles.dateDisplayText}>
                        {isTodayFilter ? 'Today' : new Date(filterDateStr).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      disabled={isTodayFilter}
                      onPress={() => {
                        const d = new Date(filterDateStr);
                        d.setDate(d.getDate() + 1);
                        setAttendanceDateFilter(d.toISOString().split('T')[0]);
                      }}
                      style={[styles.dateNavBtn, isTodayFilter && { opacity: 0.3 }]}
                    >
                      <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                    </TouchableOpacity>
                  </View>

                  {/* Hours Chart for Selected Date */}
                  <View style={styles.todayHoursCard}>
                    <View style={styles.todayHoursTop}>
                      <Text style={styles.todayHoursLabel}>Active Time ({isTodayFilter ? 'Today' : 'Selected Date'})</Text>
                      <Text style={styles.todayHoursValue}>
                        {dateHours > 0 ? `${dateHours}h ` : ''}{dateMins}m
                      </Text>
                    </View>
                    <View style={styles.todayProgressBg}>
                      <View style={[
                        styles.todayProgressBar, 
                        { width: `${dateProgress}%`, backgroundColor: dateProgress >= 80 ? '#10B981' : dateProgress >= 50 ? '#F59E0B' : '#3B82F6' }
                      ]} />
                    </View>
                    <Text style={styles.todayProgressLabel}>{Math.round(dateProgress)}% of 8h target</Text>
                  </View>

                  {/* Sessions for Selected Date */}
                  <View style={styles.sessionLogCard}>
                    <Text style={styles.sessionLogTitle}>Session Log ({displaySessions.length} total)</Text>
                    {displaySessions.length > 0 ? displaySessions.map((sess, i) => {
                      const startDate = new Date(sess.startTime);
                      const endDate = sess.isLive ? new Date() : new Date(sess.endTime);
                      const durHrs = Math.floor(sess.durationMs / 3600000);
                      const durMins = Math.floor((sess.durationMs % 3600000) / 60000);
                      return (
                        <View key={i} style={styles.sessionLogRow}>
                          <View style={[styles.sessionLogDot, sess.isLive && { backgroundColor: '#10B981' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sessionLogTime}>
                              {startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} → {sess.isLive ? 'ACTIVE NOW' : endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <Text style={[styles.sessionLogDuration, sess.isLive && { color: '#10B981' }]}>
                            {durHrs > 0 ? `${durHrs}h ` : ''}{durMins}m
                          </Text>
                        </View>
                      );
                    }) : (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#94A3B8', fontWeight: '600' }}>No sessions on this date.</Text>
                      </View>
                    )}
                  </View>

                  {/* Weekly Summary */}
                  <View style={[styles.weeklyCard, { marginTop: 20 }]}>
                    <Text style={styles.weeklyTitle}>Current Week Summary</Text>
                    <View style={styles.weeklyBarsRow}>
                      {(agentAttendance.weeklyDays || []).map((day, i) => {
                        const barHeight = Math.max((day.totalMs / maxWeeklyMs) * 60, 3);
                        const hrs = Math.floor(day.totalMs / 3600000);
                        const mins = Math.floor((day.totalMs % 3600000) / 60000);
                        const isToday = day.date === new Date().toISOString().split('T')[0];
                        return (
                          <View key={i} style={styles.weeklyBarCol}>
                            <Text style={styles.weeklyBarValue}>
                              {day.totalMs > 0 ? (hrs > 0 ? `${hrs}h` : `${mins}m`) : ''}
                            </Text>
                            <View style={[
                              styles.weeklyBar, 
                              { height: barHeight, backgroundColor: isToday ? '#6366F1' : (day.totalMs > 0 ? '#A5B4FC' : '#E2E8F0') }
                            ]} />
                            <Text style={[styles.weeklyBarLabel, isToday && { color: '#6366F1', fontWeight: '900' }]}>
                              {day.dayName}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                </ScrollView>
              );
            })()}
          </View>
        </View>
        {showDatePicker && (
          <Modal transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.8)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#FFF', borderRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0F172A' }}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>
                <PureJSDateTimePicker 
                    mode="date"
                    value={attendanceDateFilter}
                    maxDate={new Date().toISOString().split('T')[0]}
                    onChange={(val) => { setAttendanceDateFilter(val); setShowDatePicker(false); }}
                />
              </View>
            </View>
          </Modal>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },

  // 🕐 Time Filter
  timeFilterContainer: { marginBottom: 12 },
  timeFilterRow: { gap: 6, paddingVertical: 4 },
  timeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  timeChipActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  timeChipText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  timeChipTextActive: { color: '#FFFFFF' },
  filterNote: { fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },

  // 📅 Custom Range
  customRangeCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E7FF', ...shadows.sm },
  customRangeTitle: { fontSize: 13, fontWeight: '800', color: '#4F46E5', marginBottom: 12 },
  customRangeRow: { flexDirection: 'row', gap: 10 },
  customRangeField: { flex: 1 },
  customRangeLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  customRangeInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0F172A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  customRangeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  customRangeCancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9' },
  customRangeCancelText: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  customRangeApplyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#6366F1' },
  customRangeApplyText: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  // 📊 Team Summary
  teamSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', padding: 10, borderRadius: 12, borderLeftWidth: 3, alignItems: 'center', ...shadows.sm },
  summaryValue: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  summaryLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginTop: 2 },

  // Sub-Tabs
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  subTab: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 16, paddingVertical: 10, 
    borderRadius: 12, backgroundColor: '#F1F5F9', 
    borderWidth: 1, borderColor: '#E2E8F0' 
  },
  subTabActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  subTabTerminated: { backgroundColor: '#EF4444', borderColor: '#DC2626' },
  subTabText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  subTabTextActive: { color: '#FFFFFF' },

  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', fontWeight: '600' },

  // Agent Row
  userRowContainer: { marginBottom: 16 },
  miniCard: { width: 70, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniCardActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  miniCardTerminated: { opacity: 0.7, borderColor: '#FCA5A5' },
  miniName: { fontSize: 9, fontWeight: '800', color: '#64748B', marginTop: 4, textAlign: 'center' },
  miniNameActive: { color: '#FFF' },
  miniNameTerminated: { color: '#94A3B8' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#FFF' },
  avatarTerminated: { opacity: 0.5 },
  emptyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8 },
  emptyAgents: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  // Detail Card
  mainContent: { flex: 1 },
  detailCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...shadows.md, borderWidth: 1, borderColor: '#F1F5F9' },
  detailCardTerminated: { borderColor: '#FCA5A5', backgroundColor: '#FFFBFB' },
  detailHeader: { flexDirection: 'row', alignItems: 'center' },
  detailAvatarBox: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 40 },
  detailNameBox: { flex: 1 },
  detailName: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  detailEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  textTerminated: { color: '#94A3B8' },
  textMuted: { color: '#94A3B8' },

  // Level & Status
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  levelTag: { fontSize: 10, fontWeight: '800', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'uppercase' },
  levelTagTerminated: { color: '#94A3B8', backgroundColor: '#F1F5F9' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  // Terminated Banner
  terminatedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EF4444', paddingVertical: 8, borderRadius: 12, marginBottom: 16 },
  terminatedBannerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Action Buttons
  settingsBtn: { position: 'absolute', top: 20, right: 20, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', zIndex: 10 },
  reOnboardBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, marginTop: 4,
    ...shadows.sm
  },
  reOnboardText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // Stats Grid — Top Cards
  statsGrid: { flexDirection: 'row', gap: 10, marginTop: 24 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statBoxTerminated: { backgroundColor: '#FAFAFA', borderColor: '#F1F5F9' },
  statLabel: { fontSize: 7, fontWeight: '900', color: '#94A3B8', marginBottom: 4, textAlign: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  // Detailed Metrics List
  metricsList: { marginTop: 20, gap: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  mValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // Select Hint
  selectHint: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 },
  selectHintText: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 12, textAlign: 'center' },

  // Leaderboard
  leaderboardSection: { marginTop: 32, marginBottom: 20 },
  leaderboardTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  leaderboardItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  leaderboardItemActive: { borderColor: '#6366F1', backgroundColor: '#F5F3FF' },
  rankText: { fontSize: 12, fontWeight: '900', color: '#94A3B8', width: 30 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1E293B' },
  rankMeta: { marginRight: 12 },
  rankMetaText: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  rankScoreBox: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  rankScore: { fontSize: 16, fontWeight: '900', color: '#6366F1' },
  rankScoreUnits: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },

  // 📊 Caseload Distribution Chart
  caseloadSection: { marginTop: 24, marginBottom: 8, backgroundColor: '#FFF', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', ...shadows.sm },
  caseloadTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  caseloadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  caseloadName: { width: 65, fontSize: 11, fontWeight: '700', color: '#64748B' },
  caseloadBarBg: { flex: 1, height: 14, backgroundColor: '#F8FAFC', borderRadius: 7, marginHorizontal: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  caseloadBar: { height: '100%', borderRadius: 7, minWidth: 4 },
  caseloadCount: { width: 24, fontSize: 12, fontWeight: '900', textAlign: 'right' },

  // Timeline
  timelineSection: { marginTop: 20, paddingHorizontal: 4 },
  timelineTitle: { fontSize: 12, fontWeight: '900', color: '#64748B', textTransform: 'uppercase', marginBottom: 16 },
  timelineRow: { flexDirection: 'row', minHeight: 40 },
  timelineLine: { position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, backgroundColor: '#F1F5F9' },
  timelineIconNode: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, zIndex: 1 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineText: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  timelineTime: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },

  // Phase 4 - Export, Alerts, Breakdown
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4, marginRight: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  exportBtnText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  alertsContainer: { marginBottom: 20 },
  alertRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, gap: 8 },
  alertDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  alertWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  alertText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },
  breakdownContainer: { marginBottom: 20 },
  pillsScroll: { marginTop: 4 },
  pillsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  typePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: 20, gap: 8 },
  typePillLabel: { fontSize: 11, fontWeight: '700', color: '#475569' },
  typePillCountBadge: { backgroundColor: '#3B82F6', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typePillCount: { fontSize: 10, fontWeight: '900', color: '#FFF' },

  // Phase 5 - Drill Down Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  modalBody: { flexGrow: 1, paddingBottom: 20 },
  drillTicketCard: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9', ...shadows.sm },
  drillTicketHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  drillTicketId: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  drillTicketStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  drillTicketTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  drillTicketMeta: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 },
  drillTicketAgent: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  drillTicketRating: { fontSize: 12, color: '#F59E0B', fontWeight: '800' },

  attendanceTriggerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4, marginRight: 8 },
  attendanceTriggerText: { fontSize: 11, fontWeight: '800', color: '#6366F1' },

  // 🕐 Attendance Modal Styles
  attendanceModalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  attendanceModalContent: { backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingTop: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '90%' },
  dateFilterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  dateNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 12 },
  dateDisplayBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateDisplayText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  
  // Existing Attendance Styles (moved to Modal)
  attendanceStatusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 4, gap: 12, marginBottom: 14 },
  attendanceLiveDot: { width: 10, height: 10, borderRadius: 5 },
  attendanceStatusText: { fontSize: 14, fontWeight: '800' },
  attendanceLastSeen: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },

  todayHoursCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 14 },
  todayHoursTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  todayHoursLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  todayHoursValue: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  todayProgressBg: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  todayProgressBar: { height: '100%', borderRadius: 5 },
  todayProgressLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textAlign: 'right' },

  weeklyCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 14 },
  weeklyTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 12 },
  weeklyBarsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 },
  weeklyBarCol: { alignItems: 'center', flex: 1 },
  weeklyBarValue: { fontSize: 9, fontWeight: '800', color: '#6366F1', marginBottom: 4, minHeight: 12 },
  weeklyBar: { width: 20, borderRadius: 4, minHeight: 3 },
  weeklyBarLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 6 },

  sessionLogCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  sessionLogTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 12 },
  sessionLogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  sessionLogDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A5B4FC' },
  sessionLogDate: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  sessionLogTime: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
  sessionLogDuration: { fontSize: 13, fontWeight: '900', color: '#6366F1' }
});

export default AdminSupportTeamPanel;
