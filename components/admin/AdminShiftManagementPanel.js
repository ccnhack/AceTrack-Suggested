import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { usePlayersStore } from '../../stores';
import { useAdminCoreStore } from '../../stores/useAdminCoreStore';
import { useAdmin } from '../../context/AdminContext';
import SafeAvatar from '../SafeAvatar';
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

  let allSupportAgents = (players || []).filter(p => (['support', 'admin', 'superadmin'].includes(p.role) || p.supportLevel) && p.id !== 'admin');
  
  if (currentUser?.supportLevel === 'Manager') {
    allSupportAgents = allSupportAgents.filter(p => p.managerId === currentUser.id || p.id === currentUser.id);
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
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/* 📅 SHIFT HISTORY SUB-COMPONENT                                */
/* ═══════════════════════════════════════════════════════════════ */
const ShiftHistorySection = ({ allSupportAgents }) => {
  const [historyData, setHistoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Date range state
  const today = new Date();
  const todayStr = formatDateISO(today);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [dateMode, setDateMode] = useState('single'); // 'single' or 'range'

  // Display format state (for the text inputs)
  const [startDateDisplay, setStartDateDisplay] = useState(formatDateDDMMYYYY(todayStr));
  const [endDateDisplay, setEndDateDisplay] = useState(formatDateDDMMYYYY(todayStr));

  // Employee filter
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Calendar Modal state
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState(null); // 'start' or 'end'

  const fetchHistory = useCallback(async (sDate, eDate, userId) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await storage.getItem('userToken');
      const headers = {
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let url = `${config.API_BASE_URL}/api/v1/admin-core/shift-history?startDate=${sDate}`;
      if (eDate && eDate !== sDate) url += `&endDate=${eDate}`;
      if (userId) url += `&userId=${userId}`;

      const res = await apiFetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.message || 'Failed to fetch shift history');
      }
    } catch (e) {
      setError('Network error fetching shift history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Quick date presets
  const getQuickDates = useCallback(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push({
        label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        date: formatDateISO(d),
        displayDate: formatDateDDMMYYYY(formatDateISO(d))
      });
    }
    return dates;
  }, []);

  const handleQuickDate = (dateStr) => {
    setDateMode('single');
    setStartDate(dateStr);
    setEndDate(dateStr);
    setStartDateDisplay(formatDateDDMMYYYY(dateStr));
    setEndDateDisplay(formatDateDDMMYYYY(dateStr));
    fetchHistory(dateStr, dateStr, selectedEmployee?.id || null);
  };

  const handleApplyDateRange = () => {
    const isoStart = parseDDMMYYYYToISO(startDateDisplay);
    const isoEnd = parseDDMMYYYYToISO(endDateDisplay);
    if (!isoStart) { setError('Invalid start date. Use DD-MM-YYYY.'); return; }
    if (dateMode === 'range' && !isoEnd) { setError('Invalid end date. Use DD-MM-YYYY.'); return; }
    setStartDate(isoStart);
    setEndDate(isoEnd || isoStart);
    setError(null);
    fetchHistory(isoStart, isoEnd || isoStart, selectedEmployee?.id || null);
  };

  const handleEmployeeSelect = (agent) => {
    setSelectedEmployee(agent);
    setShowEmployeeDropdown(false);
    setEmployeeSearch('');
    if (startDate) fetchHistory(startDate, endDate, agent?.id || null);
  };

  const handleClearEmployee = () => {
    setSelectedEmployee(null);
    if (startDate) fetchHistory(startDate, endDate, null);
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!historyData?.shifts?.length) return;
    const rows = [['Date', 'Employee', 'Email', 'Level', 'Manager', 'Check-In', 'Check-Out', 'Duration', 'Overtime', 'Early Checkout', 'Auto Checkout', 'Justification']];
    for (const s of historyData.shifts) {
      const dur = s.totalShiftMs != null ? `${Math.floor(s.totalShiftMs / 3600000)}h ${Math.floor((s.totalShiftMs % 3600000) / 60000)}m` : 'In Progress';
      const ot = s.overtimeMs > 0 ? `${Math.floor(s.overtimeMs / 60000)}m` : '—';
      rows.push([
        formatDateDDMMYYYY(s.date),
        s.name,
        s.email,
        s.supportLevel,
        s.managerName || '—',
        s.checkinTime ? new Date(s.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
        s.checkoutTime ? new Date(s.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
        dur,
        ot,
        s.isEarlyCheckout ? 'Yes' : 'No',
        s.isAutoCheckout ? 'Yes' : 'No',
        s.justification || '—'
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    if (typeof window !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const rangeLabel = startDate === endDate ? formatDateDDMMYYYY(startDate) : `${formatDateDDMMYYYY(startDate)}_to_${formatDateDDMMYYYY(endDate)}`;
      a.download = `shift_history_${rangeLabel}${selectedEmployee ? `_${selectedEmployee.name.replace(/\s+/g, '_')}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const quickDates = getQuickDates();
  const filteredEmployees = (allSupportAgents || []).filter(a =>
    !employeeSearch || a.name?.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // Group shifts by date for range view
  const groupedShifts = useMemo(() => {
    if (!historyData?.shifts) return {};
    const groups = {};
    for (const s of historyData.shifts) {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    }
    return groups;
  }, [historyData]);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', overflow: 'hidden' }}>
      {/* Header */}
      <TouchableOpacity
        onPress={() => { setIsExpanded(!isExpanded); if (!isExpanded && !historyData) fetchHistory(startDate, endDate, selectedEmployee?.id || null); }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}
      >
        <Ionicons name="calendar-outline" size={18} color="#6366F1" style={{ marginRight: 8 }} />
        <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Shift History</Text>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          {/* Date Mode Toggle */}
          <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
            <TouchableOpacity
              onPress={() => setDateMode('single')}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: dateMode === 'single' ? '#6366F1' : 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: dateMode === 'single' ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
            >
              <Text style={{ color: dateMode === 'single' ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: '700' }}>Single Day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDateMode('range')}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: dateMode === 'range' ? '#6366F1' : 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: dateMode === 'range' ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
            >
              <Text style={{ color: dateMode === 'range' ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: '700' }}>Date Range</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Date Chips */}
          {dateMode === 'single' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {quickDates.map(qd => {
                  const isSelected = startDate === qd.date && dateMode === 'single';
                  return (
                    <TouchableOpacity
                      key={qd.date}
                      onPress={() => handleQuickDate(qd.date)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isSelected ? '#6366F1' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: isSelected ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
                    >
                      <Text style={{ color: isSelected ? '#FFF' : '#CBD5E1', fontSize: 11, fontWeight: '700' }}>{qd.label}</Text>
                      <Text style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : '#64748B', fontSize: 9, fontWeight: '600', marginTop: 2 }}>{qd.displayDate}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Custom Date Inputs */}
          {dateMode === 'range' && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748B', fontSize: 9, fontWeight: '700', marginBottom: 4 }}>FROM (DD-MM-YYYY)</Text>
                <TouchableOpacity
                  onPress={() => { setCalendarTarget('start'); setShowCalendar(true); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: startDateDisplay ? '#F8FAFC' : '#475569', fontSize: 13, fontWeight: '600' }}>
                    {startDateDisplay || "DD-MM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#475569" style={{ marginTop: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748B', fontSize: 9, fontWeight: '700', marginBottom: 4 }}>TO (DD-MM-YYYY)</Text>
                <TouchableOpacity
                  onPress={() => { setCalendarTarget('end'); setShowCalendar(true); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: endDateDisplay ? '#F8FAFC' : '#475569', fontSize: 13, fontWeight: '600' }}>
                    {endDateDisplay || "DD-MM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleApplyDateRange}
                style={{ marginTop: 16, backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              >
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>Go</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Employee Filter */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <Ionicons name="person-outline" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                <Text style={{ color: selectedEmployee ? '#F8FAFC' : '#64748B', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {selectedEmployee ? selectedEmployee.name : 'All Employees'}
                </Text>
                <Ionicons name={showEmployeeDropdown ? 'chevron-up' : 'chevron-down'} size={14} color="#64748B" />
              </TouchableOpacity>
              {selectedEmployee && (
                <TouchableOpacity onPress={handleClearEmployee} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
              {/* Export Button */}
              {historyData?.shifts?.length > 0 && (
                <TouchableOpacity
                  onPress={handleExportCSV}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
                >
                  <Ionicons name="download-outline" size={14} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800' }}>CSV</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Employee Dropdown */}
            {showEmployeeDropdown && (
              <View style={{ marginTop: 8, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', maxHeight: 200 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
                  <Ionicons name="search" size={14} color="#64748B" />
                  <TextInput
                    value={employeeSearch}
                    onChangeText={setEmployeeSearch}
                    placeholder="Search..."
                    placeholderTextColor="#475569"
                    style={{ flex: 1, marginLeft: 8, color: '#F8FAFC', fontSize: 13 }}
                    autoFocus
                  />
                </View>
                <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                  <TouchableOpacity
                    onPress={() => handleEmployeeSelect(null)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: !selectedEmployee ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                  >
                    <Ionicons name="people" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '600' }}>All Employees</Text>
                  </TouchableOpacity>
                  {filteredEmployees.map(agent => (
                    <TouchableOpacity
                      key={agent.id}
                      onPress={() => handleEmployeeSelect(agent)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: selectedEmployee?.id === agent.id ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                    >
                      <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={20} borderRadius={6} />
                      <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>{agent.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '600' }}>{error}</Text>
            </View>
          )}

          {/* Loading */}
          {isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600' }}>Loading shift history...</Text>
            </View>
          )}

          {/* Summary Stats */}
          {!isLoading && historyData?.summary && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' }}>
                <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>TOTAL SHIFTS</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{historyData.summary.totalShifts}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.totalWorkers} employees</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
                <Text style={{ color: '#34D399', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>AVG DURATION</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{formatDuration(historyData.summary.avgDurationMs)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.completedShifts} completed</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                <Text style={{ color: '#F87171', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>OVERTIME</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{formatDuration(historyData.summary.totalOvertimeMs)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.earlyCheckouts} early exits</Text>
              </View>
            </View>
          )}

          {/* Shift Cards */}
          {!isLoading && historyData && (
            <View>
              {historyData.shifts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                  <Ionicons name="calendar-clear-outline" size={24} color="#475569" />
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 8 }}>No shift records found for this period</Text>
                </View>
              ) : (
                Object.keys(groupedShifts).sort((a, b) => b.localeCompare(a)).map(dateKey => (
                  <View key={dateKey} style={{ marginBottom: 16 }}>
                    {/* Date Header (only show in range mode or multi-day results) */}
                    {Object.keys(groupedShifts).length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Ionicons name="calendar" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#C7D2FE', fontSize: 12, fontWeight: '800' }}>{formatDateDDMMYYYY(dateKey)}</Text>
                        <Text style={{ color: '#475569', fontSize: 10, fontWeight: '600', marginLeft: 8 }}>({groupedShifts[dateKey].length} shifts)</Text>
                      </View>
                    )}
                    {(() => {
                        const employeeGroups = {};
                        groupedShifts[dateKey].forEach(s => {
                            if (!employeeGroups[s.userId]) employeeGroups[s.userId] = [];
                            employeeGroups[s.userId].push(s);
                        });
                        return Object.values(employeeGroups).map(shifts => (
                            <GroupedShiftCard key={shifts[0].userId} shifts={shifts} />
                        ));
                    })()}
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      )}

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 350, padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                Select {calendarTarget === 'start' ? 'Start' : 'End'} Date
              </Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Calendar
              current={calendarTarget === 'start' ? parseDDMMYYYYToISO(startDateDisplay) : parseDDMMYYYYToISO(endDateDisplay)}
              maxDate={formatDateISO(new Date())}
              onDayPress={(day) => {
                const selectedIso = day.dateString;
                const formattedDate = formatDateDDMMYYYY(selectedIso);
                if (calendarTarget === 'start') {
                  setStartDateDisplay(formattedDate);
                } else {
                  setEndDateDisplay(formattedDate);
                }
                setShowCalendar(false);
              }}
              theme={{
                todayTextColor: '#6366F1',
                arrowColor: '#6366F1',
                textDayFontWeight: '500',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: 'bold'
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════ */
/* 🃏 SHIFT CARD SUB-COMPONENT                                */
/* ═══════════════════════════════════════════════════════════ */
const GroupedShiftCard = ({ shifts }) => {
  const baseUser = shifts[0]; // All segments share the same employee profile details
  
  let totalDurationMs = 0;
  let totalActiveDurationMs = 0;
  let hasInProgress = false;
  let hasOnBreak = false;
  let hasAutoCheckout = false;
  let hasEarlyCheckout = false;
  let totalOvertimeMs = 0;

  shifts.forEach(s => {
    if (s.totalShiftMs != null) totalDurationMs += s.totalShiftMs;
    else hasInProgress = true;
    
    if (s.isOnBreak) hasOnBreak = true;
    
    if (s.activeDurationMs != null) totalActiveDurationMs += s.activeDurationMs;
    if (s.isAutoCheckout) hasAutoCheckout = true;
    if (s.isEarlyCheckout) hasEarlyCheckout = true;
    if (s.overtimeMs > 0) totalOvertimeMs += s.overtimeMs;
  });

  const durationStr = totalDurationMs > 0 ? formatDuration(totalDurationMs) : '0m';
  const finalDurationStr = hasInProgress ? (totalDurationMs > 0 ? `${durationStr} + In Progress` : 'In Progress') : durationStr;
  
  const activeDurationStr = totalActiveDurationMs > 0 ? formatDuration(totalActiveDurationMs) : '0m';
  const finalActiveDurationStr = hasInProgress ? (totalActiveDurationMs > 0 ? `${activeDurationStr} + In Progress` : 'In Progress') : activeDurationStr;
  const overtimeStr = totalOvertimeMs > 0 ? `+${Math.floor(totalOvertimeMs / 60000)}m` : null;

  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: hasEarlyCheckout ? 'rgba(245,158,11,0.3)' : totalOvertimeMs > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)' }}>
      {/* Name Row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <SafeAvatar uri={baseUser.avatar} name={baseUser.name} size={28} borderRadius={8} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700' }}>{baseUser.name}</Text>
          <Text style={{ color: '#64748B', fontSize: 10 }}>{baseUser.email || baseUser.supportLevel}</Text>
          {baseUser.managerName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="person-circle-outline" size={10} color="#6366F1" style={{ marginRight: 3 }} />
              <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '600' }}>Reports to: {baseUser.managerName}</Text>
            </View>
          ) : null}
        </View>
        
        {/* Aggregated Badges */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {hasOnBreak ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#FBBF24', fontSize: 9, fontWeight: '800' }}>ON BREAK</Text>
            </View>
          ) : hasInProgress ? (
            <View style={{ backgroundColor: 'rgba(99,102,241,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '800' }}>IN PROGRESS</Text>
            </View>
          ) : null}
          {hasAutoCheckout && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#FBBF24', fontSize: 9, fontWeight: '800' }}>AUTO</Text>
            </View>
          )}
          {hasEarlyCheckout && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '800' }}>EARLY</Text>
            </View>
          )}
          {overtimeStr && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#F87171', fontSize: 9, fontWeight: '800' }}>{overtimeStr} OT</Text>
            </View>
          )}
        </View>
      </View>

      {/* Segments Header */}
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>SHIFT SEGMENTS</Text>
      </View>

      {/* Shift Segments List */}
      <View style={{ gap: 6 }}>
        {shifts.map((shift, shiftIdx) => {
            // Render explicit segments if available
            if (shift.segments && shift.segments.length > 0) {
                return shift.segments.map((seg, segIdx) => {
                    const startStr = seg.start ? new Date(seg.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                    const endStr = seg.end ? new Date(seg.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                    const durStr = seg.durationMs != null ? formatDuration(seg.durationMs) : 'In Progress';
                    
                    if (seg.type === 'break') {
                        return (
                            <View key={`${shiftIdx}-${segIdx}`} style={{ backgroundColor: 'rgba(245,158,11,0.05)', padding: 10, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#F59E0B' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Ionicons name="cafe-outline" size={12} color="#F59E0B" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '600' }}>{startStr} <Text style={{ color: '#D97706' }}>to</Text> {endStr}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '700' }}>{durStr} {seg.lateDurationMinutes ? `(Late ${seg.lateDurationMinutes}m)` : ''}</Text>
                                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Break</Text>
                                    </View>
                                </View>
                                {seg.justification && (
                                    <View style={{ marginTop: 6 }}>
                                        <Text style={{ color: '#FBBF24', fontSize: 10, fontStyle: 'italic' }}>"{seg.justification}"</Text>
                                    </View>
                                )}
                            </View>
                        );
                    }
                    
                    // Active shift segment
                    return (
                        <View key={`${shiftIdx}-${segIdx}`} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Ionicons name="time-outline" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600' }}>{startStr} <Text style={{ color: '#64748B' }}>to</Text> {endStr}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#A5B4FC', fontSize: 11, fontWeight: '700' }}>{durStr}</Text>
                                    <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Actual Active</Text>
                                </View>
                            </View>
                        </View>
                    );
                });
            }
            
            // Fallback for older data without explicit segments
            const checkinStr = shift.checkinTime ? new Date(shift.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
            const checkoutStr = shift.checkoutTime ? new Date(shift.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
            const durStr = shift.totalShiftMs != null ? formatDuration(shift.totalShiftMs) : 'In Progress';
            const activeDurStr = shift.activeDurationMs != null ? formatDuration(shift.activeDurationMs) : '0m';
            return (
                <View key={shiftIdx} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600' }}>{checkinStr} <Text style={{ color: '#64748B' }}>to</Text> {checkoutStr}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: '#A5B4FC', fontSize: 11, fontWeight: '700' }}>{durStr}</Text>
                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Actual Active: {activeDurStr}</Text>
                        </View>
                    </View>
                    {shift.justification && (
                        <View style={{ marginTop: 6, backgroundColor: 'rgba(245,158,11,0.05)', padding: 6, borderRadius: 6, borderLeftWidth: 2, borderLeftColor: '#F59E0B' }}>
                            <Text style={{ color: '#FDE68A', fontSize: 10, fontStyle: 'italic' }}>"{shift.justification}"</Text>
                        </View>
                    )}
                </View>
            );
        })}
      </View>

      {/* Total Duration Footer */}
      {shifts.length > 1 && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL SHIFT DURATION</Text>
                <Text style={{ color: '#A5B4FC', fontSize: 12, fontWeight: '800' }}>{finalDurationStr}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL ACTIVE DURATION</Text>
                <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '800' }}>{finalActiveDurationStr}</Text>
            </View>
        </View>
      )}
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════ */
/* 🛠️ HELPER FUNCTIONS                                       */
/* ═══════════════════════════════════════════════════════════ */
function formatDateISO(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDDMMYYYY(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseDDMMYYYYToISO(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (isNaN(d.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }
});

export default AdminShiftManagementPanel;

