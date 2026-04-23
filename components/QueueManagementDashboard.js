import React, { useState, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  Modal, SafeAreaView, Dimensions, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../theme/designSystem';

const { width, height } = Dimensions.get('window');

const QueueManagementDashboard = ({ 
  visible, 
  onClose, 
  tickets, 
  players,
  onSelectTicket
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  const supportAgents = useMemo(() => {
    let list = (players || []).filter(p => p.role === 'support' && p.supportStatus !== 'terminated');
    if (agentSearchQuery) {
      const q = agentSearchQuery.toLowerCase();
      list = list.filter(p => 
        (p.name || '').toLowerCase().includes(q) || 
        (p.email || '').toLowerCase().includes(q) || 
        (p.username || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [players, agentSearchQuery]);

  const statusOptions = ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'];

  const getAgentName = (id) => {
    if (!id) return 'Unassigned';
    const agent = (players || []).find(a => a.id === id);
    return agent ? agent.name : id;
  };

  const filteredTickets = useMemo(() => {
    const q = agentSearchQuery.toLowerCase().trim();

    return (tickets || []).filter(t => {
      // 1. Agent Selection Filter
      const matchAgent = selectedAgentId === 'All' 
        ? true 
        : (selectedAgentId === 'Unassigned' ? !t.assignedTo : t.assignedTo === selectedAgentId);
      
      // 2. Status Filter
      const matchStatus = selectedStatus === 'All' ? true : (t.status || 'Open') === selectedStatus;

      // 3. Real-time Search Filter (v2.6.224)
      let matchSearch = true;
      if (q) {
        const agentName = getAgentName(t.assignedTo).toLowerCase();
        const ticketTitle = (t.title || '').toLowerCase();
        const ticketId = (t.id || '').toString().toLowerCase();
        matchSearch = agentName.includes(q) || ticketTitle.includes(q) || ticketId.includes(q);
      }

      return matchAgent && matchStatus && matchSearch;
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [tickets, selectedAgentId, selectedStatus, agentSearchQuery, players]);

  const stats = useMemo(() => {
    const data = filteredTickets;
    return {
      total: data.length,
      open: data.filter(t => (t.status || 'Open') === 'Open').length,
      active: data.filter(t => t.status === 'In Progress').length,
      awaiting: data.filter(t => t.status === 'Awaiting Response').length
    };
  }, [filteredTickets]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Open': return { bg: '#EFF6FF', text: '#2563EB' };
      case 'In Progress': return { bg: '#FFFBEB', text: '#D97706' };
      case 'Awaiting Response': return { bg: '#FAF5FF', text: '#9333EA' };
      case 'Resolved': return { bg: '#F0FDF4', text: '#16A34A' };
      case 'Closed': return { bg: '#F1F5F9', text: '#64748B' };
      default: return { bg: '#F1F5F9', text: '#64748B' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Queue Management</Text>
            <Text style={styles.headerSubtitle}>Real-time Agent Load Balancing</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalText}>{filteredTickets.length}</Text>
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.agentSearchContainer}>
            <Ionicons name="search" size={16} color="#94A3B8" />
            <TextInput 
              style={styles.agentSearchInput}
              placeholder="Search agents by name, email or username..."
              value={agentSearchQuery}
              onChangeText={setAgentSearchQuery}
              placeholderTextColor="#94A3B8"
            />
            {agentSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setAgentSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.filterLabel}>Filter by Agent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {!agentSearchQuery && (
              <TouchableOpacity 
                onPress={() => setSelectedAgentId('All')}
                style={[styles.filterBtn, selectedAgentId === 'All' && styles.filterBtnActive]}
              >
                <Text style={[styles.filterBtnText, selectedAgentId === 'All' && styles.filterBtnTextActive]}>All Agents</Text>
              </TouchableOpacity>
            )}
            {!agentSearchQuery && (
              <TouchableOpacity 
                onPress={() => setSelectedAgentId('Unassigned')}
                style={[styles.filterBtn, selectedAgentId === 'Unassigned' && styles.filterBtnActive]}
              >
                <Text style={[styles.filterBtnText, selectedAgentId === 'Unassigned' && styles.filterBtnTextActive]}>Unassigned</Text>
              </TouchableOpacity>
            )}
            {supportAgents.map(agent => (
              <TouchableOpacity 
                key={agent.id}
                onPress={() => setSelectedAgentId(agent.id)}
                style={[styles.filterBtn, selectedAgentId === agent.id && styles.filterBtnActive]}
              >
                <Text style={[styles.filterBtnText, selectedAgentId === agent.id && styles.filterBtnTextActive]}>{agent.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { marginTop: 16 }]}>Filter by Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity 
              onPress={() => setSelectedStatus('All')}
              style={[styles.filterBtn, selectedStatus === 'All' && styles.filterBtnActive]}
            >
              <Text style={[styles.filterBtnText, selectedStatus === 'All' && styles.filterBtnTextActive]}>All States</Text>
            </TouchableOpacity>
            {statusOptions.map(s => (
              <TouchableOpacity 
                key={s}
                onPress={() => setSelectedStatus(s)}
                style={[styles.filterBtn, selectedStatus === s && styles.filterBtnActive]}
              >
                <Text style={[styles.filterBtnText, selectedStatus === s && styles.filterBtnTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.statsSummary}>
           <View style={styles.statItem}>
             <Text style={styles.statVal}>{stats.open}</Text>
             <Text style={styles.statLab}>Open</Text>
           </View>
           <View style={styles.statDivider} />
           <View style={styles.statItem}>
             <Text style={styles.statVal}>{stats.active}</Text>
             <Text style={styles.statLab}>Active</Text>
           </View>
           <View style={styles.statDivider} />
           <View style={styles.statItem}>
             <Text style={styles.statVal}>{stats.awaiting}</Text>
             <Text style={styles.statLab}>Awaiting</Text>
           </View>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {filteredTickets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="documents-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No tickets match your filters</Text>
            </View>
          ) : (
            filteredTickets.map(ticket => {
              const sc = getStatusColor(ticket.status || 'Open');
              return (
                <TouchableOpacity 
                  key={ticket.id} 
                  style={styles.ticketCard}
                  onPress={() => {
                    onClose();
                    onSelectTicket(ticket);
                  }}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.ticketId}>ID: {ticket.id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.text }]}>{ticket.status || 'Open'}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title}</Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.assigneeContainer}>
                      <Ionicons name="person-circle-outline" size={14} color="#64748B" />
                      <Text style={styles.assigneeName}>{getAgentName(ticket.assignedTo)}</Text>
                    </View>
                    <Text style={styles.dateText}>
                      {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  closeBtn: { padding: 4 },
  headerTitleContainer: { flex: 1, marginLeft: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  headerSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  totalBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  totalText: { fontSize: 14, fontWeight: 'bold', color: '#2563EB' },
  filterSection: { padding: 20, backgroundColor: '#FFF', gap: 12 },
  agentSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
  },
  agentSearchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    color: '#0F172A',
    marginLeft: 8,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  filterRow: { flexDirection: 'row' },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterBtnTextActive: { color: '#6366F1' },
  statsSummary: { 
    flexDirection: 'row', 
    backgroundColor: '#FFF', 
    margin: 20, 
    padding: 16, 
    borderRadius: 16, 
    ...shadows.sm,
    alignItems: 'center'
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  statLab: { fontSize: 11, color: '#64748B', marginTop: 4 },
  statDivider: { width: 1, height: 24, backgroundColor: '#F1F5F9' },
  list: { flex: 1 },
  listContent: { padding: 20 },
  ticketCard: { 
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...shadows.sm
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  ticketId: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  ticketTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assigneeContainer: { flexDirection: 'row', alignItems: 'center' },
  assigneeName: { fontSize: 12, color: '#64748B', marginLeft: 4, fontWeight: '500' },
  dateText: { fontSize: 11, color: '#94A3B8' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { marginTop: 16, color: '#94A3B8', fontSize: 14 }
});

export default QueueManagementDashboard;
