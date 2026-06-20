import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayersStore } from '../../stores';
import { useAdmin } from '../../context/AdminContext';
import SafeAvatar from '../SafeAvatar';
import config from '../../config';
import storage from '../../utils/storage';
import { apiFetch } from '../../utils/apiFetch';

const AdminShiftManagementPanel = ({ onOpenAttendance }) => {
  const { players } = usePlayersStore();
  const { auditLogs } = useAdmin();
  const [analytics, setAnalytics] = useState(null);

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

  useEffect(() => {
    fetchTeamAnalytics();
  }, [fetchTeamAnalytics]);

  const allSupportAgents = (players || []).filter(p => p.role === 'support' || p.supportLevel);
  const activeAgents = allSupportAgents.filter(a => a.supportStatus !== 'terminated' && a.supportStatus !== 'inactive' && a.supportLevel !== 'EX-EMPLOYEE');

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

  return (
    <View style={styles.container}>
      <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E293B' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Ionicons name="time-outline" size={18} color="#6366F1" style={{ marginRight: 8 }} />
          <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Shift Overview</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 6 }} />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>{onShift} On Shift</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 6 }} />
              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '800' }}>{offShift} Off Shift</Text>
            </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 }
});

export default AdminShiftManagementPanel;
