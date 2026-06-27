import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { usePlayersStore } from '../../stores';
import { useAdminCoreStore } from '../../stores/useAdminCoreStore';
import { useAdminStore as useAdmin } from '../../stores/useAdminStore';
import SafeAvatar from '../SafeAvatar';
import ShiftHistorySection from './shift/ShiftHistorySection';
import { useAuth } from '../../context/AuthContext';
import config from '../../config';
import storage from '../../utils/storage';
import { apiFetch } from '../../utils/apiFetch';

const AdminShiftManagementPanel = ({ onOpenAttendance }) => {
  const { players } = usePlayersStore();
  const { auditLogs } = useAdmin();
  const { auditLogs: coreLogs, fetchAuditLogs } = useAdminCoreStore();
  const [analytics, setAnalytics] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: null });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (modalState.isOpen && modalState.type === 'off_shift') {
      fetchAuditLogs({ limit: 100 });
    }
  }, [modalState.isOpen, modalState.type, fetchAuditLogs]);

  const fetchTeamAnalytics = useCallback(async () => {
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/analytics`, {
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (e) {
      console.warn("[SHIFT_PANEL] Failed to fetch analytics");
    }
  }, []);

  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showLeaveHistoryModal, setShowLeaveHistoryModal] = useState(false);
  const [leaveHistorySearch, setLeaveHistorySearch] = useState('');

  const handleResolveShortLeave = async (agentId, leaveId, action) => {
    if (leaveLoading) return;
    setLeaveLoading(true);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json',
        'x-user-id': currentUser?.id || 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/resolve-short-leave`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ agentId, leaveId, action })
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to resolve leave request.');
      }
    } catch (e) {
      alert(`Error resolving leave: ${e.message}`);
    } finally {
      setLeaveLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamAnalytics();
  }, [fetchTeamAnalytics]);

  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // ═══════════════════════════════════════════════════════════════
  // ⚠️ ANOMALY ALERTS STATE (Admin Only)
  // ═══════════════════════════════════════════════════════════════
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);

  const fetchAnomalies = useCallback(async () => {
    if (!isAdmin) return;
    setAnomaliesLoading(true);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-user-id': currentUser?.id || 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/admin-core/shift-anomalies`, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.anomalies || []);
      }
    } catch (e) { console.warn('[SHIFT] Failed to fetch anomalies'); }
    finally { setAnomaliesLoading(false); }
  }, [isAdmin, currentUser?.id]);

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

  // ═══════════════════════════════════════════════════════════════
  // 📊 ATTENDANCE PATTERNS STATE
  // ═══════════════════════════════════════════════════════════════
  const [attendancePatterns, setAttendancePatterns] = useState([]);
  const [showAttendancePatterns, setShowAttendancePatterns] = useState(false);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [expandedPatternIdx, setExpandedPatternIdx] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState('Dashboard');

  const fetchAttendancePatterns = useCallback(async () => {
    setPatternsLoading(true);
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'x-user-id': currentUser?.id || 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/admin-core/shift-attendance-patterns`, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAttendancePatterns(data.patterns || []);
      }
    } catch (e) { console.warn('[SHIFT] Failed to fetch patterns'); }
    finally { setPatternsLoading(false); }
  }, [currentUser?.id]);

  let allSupportAgents = (players || []).filter(p => (['support', 'admin', 'superadmin'].includes(p.role) || p.supportLevel) && p.id !== 'admin');
  
  if (currentUser?.supportLevel === 'Manager') {
    allSupportAgents = allSupportAgents.filter(p => p.managerId === currentUser.id);
  }
  const activeAgents = allSupportAgents.filter(a => {
    const status = (a.supportStatus || a.status || 'active').toLowerCase();
    const level = (a.supportLevel || a.level || '').toUpperCase();
    
    // Lifecycle Guard: Terminated unless re-onboarded later
    const hasActiveTermination = !!a.terminatedAt && (!a.reOnboardedAt || new Date(a.terminatedAt) > new Date(a.reOnboardedAt));
    
    const isExplicitlyEx = 
      status === 'terminated' || 
      status === 'inactive' || 
      status === 'left' ||
      level === 'EX-EMPLOYEE' ||
      hasActiveTermination;

    return !isExplicitlyEx;
  });

  const onShift = activeAgents.filter(a => a.shiftStatus === 'on_shift').length;
  const offShift = activeAgents.length - onShift;

  const onShiftAgents = activeAgents.filter(a => a.shiftStatus === 'on_shift');

  const candidates = activeAgents.filter(a => a.shiftStatus === 'on_shift' && (a.supportStatus === 'active' || !a.supportStatus));
  const withLoad = candidates.map(agent => {
    const agentTickets = analytics?.tickets || [];
    const activeCount = agentTickets.filter(t => t.assignedTo === agent.id && ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)).length;
    return { ...agent, currentLoad: activeCount, lifetime: agent.metrics?.totalHandled || 0 };
  }).sort((a, b) => {
    if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
    return a.lifetime - b.lifetime;
  }).slice(0, 5);

  const overtimeEvents = auditLogs
    ? auditLogs
        .filter(log => log.action === 'SUPPORT_OVERTIME_DETECTED')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
    : [];

  // ═══════════════════════════════════════════════════════════════
  // 📅 ALL SHORT LEAVES HISTORY MODAL
  // ═══════════════════════════════════════════════════════════════
  const renderLeaveHistoryModal = () => {
    if (!showLeaveHistoryModal) return null;

    const allLeaves = activeAgents.flatMap(agent => 
      (agent.shortLeaves || []).map(leave => ({ agent, leave }))
    ).sort((a, b) => new Date(b.leave.date) - new Date(a.leave.date));

    const filteredLeaves = allLeaves.filter(({ agent, leave }) => {
      if (!leaveHistorySearch) return true;
      return agent.name?.toLowerCase().includes(leaveHistorySearch.toLowerCase());
    });

    return (
      <Modal visible={showLeaveHistoryModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%', maxWidth: 600, padding: 0 }]}>
            <View style={{ backgroundColor: '#0F172A', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="list" size={20} color="#6366F1" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>All Short Leaves History</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLeaveHistoryModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, backgroundColor: '#F8FAFC' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Ionicons name="search" size={16} color="#94A3B8" />
                <TextInput 
                  placeholder="Search by employee name..."
                  value={leaveHistorySearch}
                  onChangeText={setLeaveHistorySearch}
                  style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#334155' }}
                />
              </View>
            </View>

            <ScrollView style={{ paddingHorizontal: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {filteredLeaves.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 30 }}>
                  <Ionicons name="document-text-outline" size={32} color="#CBD5E1" />
                  <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '600', marginTop: 12 }}>No leave requests found.</Text>
                </View>
              ) : (
                <>
                  {leaveHistorySearch ? (
                    <View style={{ backgroundColor: 'rgba(99,102,241,0.05)', padding: 12, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' }}>
                      <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
                        Search Summary:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Completed: {filteredLeaves.filter(l => l.leave.status === 'completed').length}</Text>
                        <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Late Returns: {filteredLeaves.filter(l => l.leave.isLateReturn).length}</Text>
                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Early Returns: {filteredLeaves.filter(l => l.leave.isEarlyReturn).length}</Text>
                      </View>
                    </View>
                  ) : null}
                  {filteredLeaves.map(({ agent, leave }) => (
                    <View key={`hist_${agent.id}_${leave.id}`} style={{ backgroundColor: leave.status === 'approved' ? 'rgba(16,185,129,0.05)' : leave.status === 'rejected' ? 'rgba(239,68,68,0.05)' : leave.status === 'completed' ? 'rgba(99,102,241,0.05)' : leave.status === 'cancelled' ? 'rgba(100,116,139,0.05)' : 'rgba(245,158,11,0.05)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: leave.status === 'approved' ? 'rgba(16,185,129,0.2)' : leave.status === 'rejected' ? 'rgba(239,68,68,0.2)' : leave.status === 'completed' ? 'rgba(99,102,241,0.2)' : leave.status === 'cancelled' ? 'rgba(100,116,139,0.2)' : 'rgba(245,158,11,0.2)', marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={36} borderRadius={10} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: '#1E293B', fontSize: 14, fontWeight: '800' }}>{agent.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: leave.status === 'approved' ? '#10B981' : leave.status === 'rejected' ? '#EF4444' : leave.status === 'completed' ? '#6366F1' : leave.status === 'cancelled' ? '#64748B' : '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{leave.status}</Text>
                            </View>
                          </View>
                          <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                            <Ionicons name="calendar-outline" size={11} /> {leave.date} ({leave.startTime} - {leave.endTime})
                          </Text>
                          <Text style={{ color: '#475569', fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>"{leave.reason}"</Text>
                          
                          {leave.status === 'completed' && leave.actualReturnTime && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                              <Text style={{ color: '#6366F1', fontSize: 11, fontWeight: '700' }}>
                                Returned: {leave.actualReturnTime}
                              </Text>
                              {leave.isLateReturn && (
                                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                                  <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>LATE BY {leave.lateDurationMinutes}m</Text>
                                </View>
                              )}
                              {leave.isEarlyReturn && (
                                <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                                  <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>EARLY BY {leave.earlyDurationMinutes}m</Text>
                                </View>
                              )}
                            </View>
                          )}

                          {leave.status === 'cancelled' && leave.cancellationNote && (
                            <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 8 }}>
                              Note: {leave.cancellationNote}
                            </Text>
                          )}
                        </View>
                      </View>
                      {/* Action buttons if not rejected or completed already */}
                      {leave.status !== 'rejected' && leave.status !== 'completed' && leave.status !== 'cancelled' && agent.id !== currentUser?.id && (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 }}>
                          {leave.status === 'pending' && (
                            <TouchableOpacity 
                              onPress={() => handleResolveShortLeave(agent.id, leave.id, 'approve')}
                              disabled={leaveLoading}
                              style={{ backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginRight: 8 }}
                            >
                              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>Approve</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity 
                            onPress={() => handleResolveShortLeave(agent.id, leave.id, 'reject')}
                            disabled={leaveLoading}
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                          >
                            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>{leave.status === 'approved' ? 'Cancel Leave' : 'Reject'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 16, marginBottom: 8, gap: 12 }}>
        {['Dashboard', 'Anomalies & Alerts'].map(tab => (
          <TouchableOpacity 
            key={tab}
            onPress={() => setActiveMainTab(tab)}
            style={{ 
              paddingVertical: 8, paddingHorizontal: 16, 
              backgroundColor: activeMainTab === tab ? '#6366F1' : 'rgba(255,255,255,0.05)', 
              borderRadius: 8, borderWidth: 1, 
              borderColor: activeMainTab === tab ? '#818CF8' : 'rgba(255,255,255,0.1)' 
            }}
          >
            <Text style={{ color: activeMainTab === tab ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: '700' }}>
              {tab === 'Anomalies & Alerts' && anomalies.length > 0 ? `${tab} (${anomalies.length})` : tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeMainTab === 'Anomalies & Alerts' ? (
        <View style={{ flex: 1, marginHorizontal: 16 }}>
          {isAdmin && anomalies.length > 0 ? (
            <View style={{ marginTop: 8, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Ionicons name="warning" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FCA5A5', fontSize: 15, fontWeight: '900', flex: 1 }}>Anomaly Alerts</Text>
                <View style={{ backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '800' }}>{anomalies.length} Alert{anomalies.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <ScrollView style={{ maxHeight: 600 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 8 }}>
                  {anomalies.map((a, idx) => {
                    const isCritical = a.severity === 'critical';
                    const iconMap = {
                      excessive_auto_checkouts: 'log-out-outline',
                      break_policy_violation: 'cafe-outline',
                      chronic_late_returns: 'alarm-outline',
                      excessive_overtime: 'flame-outline',
                      orphan_checkin: 'help-circle-outline',
                      overlapping_checkin: 'duplicate-outline',
                      pending_overtime: 'time-outline'
                    };
                    const labelMap = {
                      excessive_auto_checkouts: 'Auto-Checkouts',
                      break_policy_violation: 'Break Exceeded',
                      chronic_late_returns: 'Late Returns',
                      excessive_overtime: 'Excess Overtime',
                      orphan_checkin: 'Orphan Check-In',
                      overlapping_checkin: 'Overlapping',
                      pending_overtime: 'Pending OT'
                    };
                    return (
                      <View key={idx} style={{ backgroundColor: isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <SafeAvatar uri={a.agentAvatar} name={a.agentName} size={28} borderRadius={8} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: '#F8FAFC', fontSize: 12, fontWeight: '700' }}>{a.agentName}</Text>
                            <Text style={{ color: isCritical ? '#FCA5A5' : '#FDE68A', fontSize: 10, marginTop: 2 }}>{a.details}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ color: isCritical ? '#F87171' : '#FBBF24', fontSize: 8, fontWeight: '900' }}>{isCritical ? 'CRITICAL' : 'WARNING'}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name={iconMap[a.type] || 'alert-circle-outline'} size={12} color={isCritical ? '#F87171' : '#FBBF24'} />
                              <Text style={{ color: isCritical ? '#FCA5A5' : '#FDE68A', fontSize: 9, fontWeight: '700', marginLeft: 4 }}>{labelMap[a.type] || a.type}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={{ alignItems: 'center', padding: 40, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 20, marginTop: 8 }}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
              <Text style={{ color: '#A7F3D0', fontSize: 16, fontWeight: '800', marginTop: 16 }}>All Clear!</Text>
              <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>No shift anomalies detected across the team right now.</Text>
            </View>
          )}
        </View>
      ) : (
        <>

      <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E293B' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Ionicons name="time-outline" size={18} color="#6366F1" style={{ marginRight: 8 }} />
          <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Shift Overview</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity 
              onPress={() => { setModalState({ isOpen: true, type: 'on_shift' }); setSearchQuery(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 6 }} />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>{onShift} On Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => { setModalState({ isOpen: true, type: 'off_shift' }); setSearchQuery(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 6 }} />
              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '800' }}>{offShift} Off Shift</Text>
            </TouchableOpacity>
          </View>
        </View>



        {/* Shift Timeline */}
        {onShiftAgents.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
            <Ionicons name="moon-outline" size={20} color="#475569" />
            <Text style={{ color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 4 }}>No employees currently on shift</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {onShiftAgents.map(agent => {
                const checkinTime = agent.shiftCheckinRounded ? new Date(agent.shiftCheckinRounded).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                const checkoutDue = agent.shiftCheckoutDue ? new Date(agent.shiftCheckoutDue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                const isOvertime = agent.shiftCheckoutDue && new Date() > new Date(agent.shiftCheckoutDue);
                return (
                  <View key={agent.id} style={{ backgroundColor: isOvertime ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 10, minWidth: 130, borderWidth: 1, borderColor: isOvertime ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={24} borderRadius={8} />
                      <Text style={{ color: '#E2E8F0', fontSize: 11, fontWeight: '700', marginLeft: 6, flex: 1 }} numberOfLines={1}>{agent.name?.split(' ')[0]}</Text>
                      {isOvertime && <Ionicons name="alert-circle" size={12} color="#EF4444" />}
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '600' }}>{checkinTime}</Text>
                      <Ionicons name="arrow-forward" size={8} color="#475569" />
                      <Text style={{ color: isOvertime ? '#F87171' : '#94A3B8', fontSize: 9, fontWeight: '600' }}>{checkoutDue}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Round-Robin Queue */}
        {withLoad.length > 0 && (
          <View style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="swap-horizontal" size={14} color="#818CF8" style={{ marginRight: 6 }} />
              <Text style={{ color: '#C7D2FE', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>Round-Robin Queue — Next 5</Text>
            </View>
            {withLoad.map((agent, idx) => (
              <View key={agent.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                <Text style={{ color: idx === 0 ? '#10B981' : '#94A3B8', fontSize: 12, fontWeight: '900', width: 24 }}>#{idx + 1}</Text>
                <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={20} borderRadius={6} />
                <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '700', marginLeft: 8, flex: 1 }} numberOfLines={1}>{agent.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>{agent.currentLoad} active</Text>
                  {idx === 0 && <View style={{ backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: '#FFF', fontSize: 8, fontWeight: '900' }}>NEXT</Text></View>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Overtime Logs */}
        {overtimeEvents.length > 0 && (
          <View style={{ marginTop: 12, backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="warning-outline" size={14} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={{ color: '#FCA5A5', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>Recent Overtime Activity</Text>
            </View>
            {overtimeEvents.map((log, idx) => {
              const agent = allSupportAgents.find(a => a.id === log.userId);
              const agentName = agent?.name || log.userId;
              const mins = log.metadata?.overtimeMinutes || Math.floor((log.metadata?.overtimeMs || 0) / 60000);
              const dt = new Date(log.timestamp);
              return (
                <View key={log._id || idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(239,68,68,0.1)' }}>
                  <Text style={{ color: '#FCA5A5', fontSize: 10, fontWeight: '600', width: 45 }}>{dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                  <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600', flex: 1, marginHorizontal: 8 }} numberOfLines={1}>
                    {agentName}
                  </Text>
                  <View style={{ backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: '#F87171', fontSize: 10, fontWeight: '700' }}>+{mins}m</Text>
                  </View>
                  {onOpenAttendance && (
                    <TouchableOpacity 
                      onPress={() => {
                        const sessEnd = dt.getTime();
                        const sessStart = sessEnd - (8 * 3600000) - (log.metadata?.overtimeMs || 0);
                        onOpenAttendance(log.userId, sessStart, sessEnd);
                      }}
                      style={{ marginLeft: 8 }}
                    >
                      <Ionicons name="list" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 📅 SHIFT HISTORY SECTION                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <ShiftHistorySection allSupportAgents={activeAgents} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 📊 ATTENDANCE PATTERNS (30 Days)                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E293B' }}>
        <TouchableOpacity 
          onPress={() => { 
            setShowAttendancePatterns(!showAttendancePatterns); 
            if (!showAttendancePatterns && attendancePatterns.length === 0) fetchAttendancePatterns(); 
          }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <Ionicons name="bar-chart-outline" size={18} color="#6366F1" style={{ marginRight: 8 }} />
          <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Attendance Patterns (30 Days)</Text>
          <Ionicons name={showAttendancePatterns ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
        </TouchableOpacity>

        {showAttendancePatterns && (
          <View style={{ marginTop: 14 }}>
            {patternsLoading ? (
              <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>Loading patterns...</Text>
            ) : attendancePatterns.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>No attendance data available.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {/* Header Row */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 2 }}>EMPLOYEE</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'center' }}>DAYS</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'center' }}>LATE</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'center' }}>AUTO</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'center' }}>AVG</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'center' }}>RATE</Text>
                </View>
                {attendancePatterns.map((p, idx) => {
                  const avgH = Math.floor((p.avgShiftMs || 0) / 3600000);
                  const avgM = Math.floor(((p.avgShiftMs || 0) % 3600000) / 60000);
                  const rateColor = p.attendanceRate >= 80 ? '#10B981' : p.attendanceRate >= 50 ? '#FBBF24' : '#EF4444';
                  const lateColor = p.lateCheckins > 3 ? '#EF4444' : p.lateCheckins > 1 ? '#FBBF24' : '#10B981';
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      onPress={() => setExpandedPatternIdx(expandedPatternIdx === idx ? null : idx)}
                      style={{ paddingVertical: 8, paddingHorizontal: 8, backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: 8 }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                          <SafeAvatar uri={p.avatar} name={p.name} size={22} borderRadius={6} />
                          <View style={{ marginLeft: 8, flex: 1 }}>
                            <Text style={{ color: '#E2E8F0', fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
                            <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '500' }}>Shift: {p.scheduledStart} - {p.scheduledEnd}</Text>
                          </View>
                        </View>
                        <Text style={{ color: '#A5B4FC', fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'center' }}>{p.daysWorked}/30</Text>
                        <Text style={{ color: lateColor, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'center', textDecorationLine: p.lateCheckins > 0 ? 'underline' : 'none' }}>{p.lateCheckins}</Text>
                        <Text style={{ color: p.autoCheckouts > 0 ? '#FBBF24' : '#64748B', fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'center', textDecorationLine: p.autoCheckouts > 0 ? 'underline' : 'none' }}>{p.autoCheckouts}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', flex: 1, textAlign: 'center' }}>{avgH}h{avgM}m</Text>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, width: '80%' }}>
                            <View style={{ backgroundColor: rateColor, borderRadius: 4, height: 6, width: `${Math.min(100, p.attendanceRate)}%` }} />
                          </View>
                          <Text style={{ color: rateColor, fontSize: 8, fontWeight: '800', marginTop: 2 }}>{p.attendanceRate}%</Text>
                        </View>
                      </View>
                      
                      {expandedPatternIdx === idx && (
                        <View style={{ marginTop: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                          <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 }}>DETAILED BREAKDOWN</Text>
                          {(!p.lateCheckinDates?.length && !p.autoCheckoutDates?.length && !p.earlyCheckoutDates?.length) ? (
                             <Text style={{ color: '#64748B', fontSize: 11, fontStyle: 'italic' }}>No anomalies recorded in this period.</Text>
                          ) : (
                             <View style={{ gap: 4 }}>
                               {p.lateCheckinDates?.length > 0 && (
                                 <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '700', width: 90 }}>Late Check-in:</Text>
                                    <Text style={{ color: '#E2E8F0', fontSize: 11, flex: 1, lineHeight: 16 }}>
                                      {p.lateCheckinDates.map(item => {
                                          if (item.includes('|')) {
                                              const [dateStr, timeStr, mins, expectedShift] = item.split('|');
                                              let formattedTime = timeStr;
                                              if (timeStr) {
                                                  const [h, m] = timeStr.split(':').map(Number);
                                                  const ampm = h >= 12 ? 'PM' : 'AM';
                                                  const h12 = h % 12 || 12;
                                                  formattedTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                                              }
                                              let durationStr = `${mins}m`;
                                              const mNum = parseInt(mins, 10);
                                              if (!isNaN(mNum) && mNum >= 60) {
                                                  const h = Math.floor(mNum / 60);
                                                  const rem = mNum % 60;
                                                  durationStr = rem > 0 ? `${h}h ${rem}m` : `${h}h`;
                                              }
                                              const expectedText = expectedShift ? ` [Expected: ${expectedShift}]` : '';
                                              return `${formatDateDDMMYYYY(dateStr)} - ${formattedTime} (${durationStr} late)${expectedText}`;
                                          }
                                          return formatDateDDMMYYYY(item);
                                      }).join('\n')}
                                    </Text>
                                 </View>
                               )}
                               {p.autoCheckoutDates?.length > 0 && (
                                 <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '700', width: 90 }}>Auto Checkout:</Text>
                                    <Text style={{ color: '#E2E8F0', fontSize: 11, flex: 1 }}>{p.autoCheckoutDates.map(formatDateDDMMYYYY).join(', ')}</Text>
                                 </View>
                               )}
                               {p.earlyCheckoutDates?.length > 0 && (
                                 <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700', width: 90 }}>Early Checkout:</Text>
                                    <Text style={{ color: '#E2E8F0', fontSize: 11, flex: 1, lineHeight: 16 }}>
                                      {p.earlyCheckoutDates.map(item => {
                                          if (item.includes('|')) {
                                              const [dateStr, timeStr, mins, expectedShift] = item.split('|');
                                              let formattedTime = timeStr;
                                              if (timeStr) {
                                                  const [h, m] = timeStr.split(':').map(Number);
                                                  const ampm = h >= 12 ? 'PM' : 'AM';
                                                  const h12 = h % 12 || 12;
                                                  formattedTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                                              }
                                              let durationStr = `${mins}m`;
                                              const mNum = parseInt(mins, 10);
                                              if (!isNaN(mNum) && mNum >= 60) {
                                                  const h = Math.floor(mNum / 60);
                                                  const rem = mNum % 60;
                                                  durationStr = rem > 0 ? `${h}h ${rem}m` : `${h}h`;
                                              }
                                              const expectedText = expectedShift ? ` [Expected: ${expectedShift}]` : '';
                                              return `${formatDateDDMMYYYY(dateStr)} - ${formattedTime} (${durationStr} early)${expectedText}`;
                                          }
                                          return formatDateDDMMYYYY(item);
                                      }).join('\n')}
                                    </Text>
                                 </View>
                               )}
                             </View>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 📅 PENDING SHORT LEAVES                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E293B' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Ionicons name="time" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
          <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Pending Short Leaves</Text>
          <TouchableOpacity 
            onPress={() => setShowLeaveHistoryModal(true)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <Ionicons name="list" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
            <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700' }}>View Leave History</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const pendingLeaves = activeAgents.flatMap(agent => 
            (agent.shortLeaves || []).filter(l => l.status === 'pending').map(leave => ({ agent, leave }))
          );

          if (pendingLeaves.length === 0) {
            return (
              <View style={{ padding: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
                <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>No pending short leave requests.</Text>
              </View>
            );
          }

          return pendingLeaves.map(({ agent, leave }) => (
            <View key={`leave_${leave.id}`} style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={32} borderRadius={8} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>{agent.name}</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '600', marginTop: 2 }}>{leave.date} ({leave.startTime} - {leave.endTime})</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>"{leave.reason}"</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {agent.id !== currentUser?.id ? (
                    <>
                      <TouchableOpacity 
                        onPress={() => handleResolveShortLeave(agent.id, leave.id, 'approve')}
                        disabled={leaveLoading}
                        style={{ backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.5)' }}
                      >
                        <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800' }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => handleResolveShortLeave(agent.id, leave.id, 'reject')}
                        disabled={leaveLoading}
                        style={{ backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)' }}
                      >
                        <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '800' }}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                      <Text style={{ color: '#94A3B8', fontSize: 10, fontStyle: 'italic', fontWeight: '600' }}>Pending Admin Approval</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ));
        })()}
      </View>

      {/* Details Modal */}
      <Modal visible={modalState.isOpen} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>
                {modalState.type === 'on_shift' ? 'On-Shift Employees' : 'Off-Shift Employees'}
              </Text>
              <TouchableOpacity onPress={() => setModalState({ isOpen: false, type: null })}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput 
                placeholder="Search employees..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#334155' }}
              />
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const targetList = modalState.type === 'on_shift' 
                  ? activeAgents.filter(a => a.shiftStatus === 'on_shift')
                  : activeAgents.filter(a => a.shiftStatus !== 'on_shift');
                  
                const filtered = targetList.filter(a => 
                  searchQuery === '' || a.name?.toLowerCase().includes(searchQuery.toLowerCase())
                );

                if (filtered.length === 0) return (
                  <Text style={{ textAlign: 'center', color: '#94A3B8', marginTop: 20 }}>No employees found.</Text>
                );

                return filtered.map(agent => {
                  let durationStr = 'N/A';
                  let checkinStr = '—';
                  let checkoutStr = '—';
                  let lastActiveStr = agent.lastActive ? new Date(agent.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

                  const checkinTimeSource = agent.shiftCheckinAt || agent.shiftCheckinRounded;
                  if (checkinTimeSource) {
                    checkinStr = new Date(checkinTimeSource).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    if (modalState.type === 'on_shift') {
                      const ms = new Date().getTime() - new Date(checkinTimeSource).getTime();
                      durationStr = `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
                    } else if (agent.shiftCheckoutAt) {
                      checkoutStr = new Date(agent.shiftCheckoutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const ms = new Date(agent.shiftCheckoutAt).getTime() - new Date(checkinTimeSource).getTime();
                      durationStr = `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
                    }
                  }

                  let justificationStr = agent.shiftCheckoutJustification || null;
                  if (!justificationStr && modalState.type === 'off_shift' && agent.shiftCheckoutAt) {
                    const justificationLog = [...(auditLogs || []), ...(coreLogs || [])].find(log => 
                      log.action === 'SUPPORT_SHIFT_CHECKOUT' && 
                      log.userId === agent.id && 
                      new Date(log.timestamp).toDateString() === new Date(agent.shiftCheckoutAt).toDateString() &&
                      log.details?.justification
                    );
                    if (justificationLog) {
                      justificationStr = justificationLog.details.justification;
                    }
                  }

                  return (
                    <View key={agent.id} style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={32} borderRadius={10} />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{agent.name}</Text>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>{agent.email || agent.phone}</Text>
                        </View>
                      </View>
                      
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <View style={{ backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>CHECK-IN</Text>
                          <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{checkinStr}</Text>
                        </View>
                        
                        {modalState.type === 'off_shift' && (
                          <View style={{ backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                            <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>CHECK-OUT</Text>
                            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{checkoutStr}</Text>
                          </View>
                        )}
                        
                        <View style={{ backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>DURATION</Text>
                          <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '700' }}>{durationStr}</Text>
                        </View>

                        {modalState.type === 'off_shift' && (
                          <View style={{ backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                            <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>LAST ACTIVE</Text>
                            <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>{lastActiveStr}</Text>
                          </View>
                        )}
                      </View>

                      {justificationStr && (
                        <View style={{ marginTop: 10, backgroundColor: '#FFFBEB', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <Ionicons name="warning" size={12} color="#D97706" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309' }}>Early Checkout Justification</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#92400E', fontStyle: 'italic' }}>"{justificationStr}"</Text>
                        </View>
                      )}
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {renderLeaveHistoryModal()}
      </>
      )}
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/* 📅 SHIFT HISTORY SUB-COMPONENT                                */
/* ═══════════════════════════════════════════════════════════════ */


export default AdminShiftManagementPanel;
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }
});

