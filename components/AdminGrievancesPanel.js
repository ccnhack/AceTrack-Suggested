import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const statusColors = {
  'Open': { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  'In Progress': { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA', border: '#F3E8FF' },
  'Resolved': { bg: '#F0FDF4', text: '#16A34A', border: '#DCFCE7' },
  'Closed': { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' },
};

const statusOptions = ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'];

export const AdminGrievancesPanel = ({
  tickets, players, onReply, onUpdateStatus
}) => {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollViewRef = useRef(null);

  useEffect(() => {
    if (selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
        scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [selectedTicket?.messages]);

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  const getUserName = (userId) => players.find(pl => pl.id === userId)?.name || userId;
  const getUserRole = (userId) => players.find(pl => pl.id === userId)?.role || 'user';

  const filteredTickets = tickets
    .filter(t => filterStatus === 'All' || t.status === filterStatus)
    .filter(t => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || getUserName(t.userId).toLowerCase().includes(q);
    });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    onReply(selectedTicket.id, replyText);
    setReplyText('');
  };

  if (selectedTicket) {
    const userRole = getUserRole(selectedTicket.userId);
    const isClosed = selectedTicket.status === 'Closed';
    const st = statusColors[selectedTicket.status] || statusColors['Open'];

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>{selectedTicket.title}</Text>
            <Text style={styles.headerId}>#{selectedTicket.id}</Text>
          </View>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.flex}
        >
          <ScrollView ref={scrollViewRef} style={styles.detailList} showsVerticalScrollIndicator={false}>
            <View style={styles.infoCard}>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>User</Text>
                  <Text style={styles.infoValue}>{getUserName(selectedTicket.userId)}</Text>
                </View>
                <View style={[styles.infoItem, { alignItems: 'flex-end' }]}>
                  <Text style={styles.infoLabel}>Role</Text>
                  <View style={[styles.roleBadge, userRole === 'academy' ? styles.roleAcademy : styles.roleCoach]}>
                    <Text style={styles.roleText}>{userRole}</Text>
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Type</Text>
                  <Text style={styles.infoValue}>{selectedTicket.type}</Text>
                </View>
                <View style={[styles.infoItem, { alignItems: 'flex-end' }]}>
                  <Text style={styles.infoLabel}>Created</Text>
                  <Text style={styles.infoValue}>{new Date(selectedTicket.createdAt).toLocaleDateString()}</Text>
                </View>
              </View>

              <View style={styles.statusControl}>
                <Text style={styles.infoLabel}>Update Status</Text>
                <View style={styles.statusBtnRow}>
                  {statusOptions.map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => onUpdateStatus(selectedTicket.id, s)}
                      style={[
                        styles.statusToggleBtn, 
                        selectedTicket.status === s ? { backgroundColor: statusColors[s].bg, borderColor: statusColors[s].border } : styles.statusToggleBtnOff
                      ]}
                    >
                      <Text style={[styles.statusToggleText, { color: selectedTicket.status === s ? statusColors[s].text : '#94A3B8' }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.chatArea}>
              {selectedTicket.messages.map((msg, i) => {
                const text = typeof msg === 'string' ? msg : (msg.text || '');
                const senderId = typeof msg === 'string' ? selectedTicket.userId : (msg.senderId || '');
                const timestamp = typeof msg === 'string' ? selectedTicket.createdAt : (msg.timestamp || selectedTicket.createdAt);
                
                const isAdmin = senderId === 'admin_sys' || senderId === 'admin';
                return (
                  <View key={i} style={[styles.messageRow, isAdmin ? styles.messageMe : styles.messageOther]}>
                    <View style={[styles.bubble, isAdmin ? styles.bubbleMe : styles.bubbleOther]}>
                      <Text style={[styles.msgSender, isAdmin ? { color: '#FECACA' } : { color: '#94A3B8' }]}>
                        {isAdmin ? 'Admin' : getUserName(senderId)}
                      </Text>
                      <Text style={[styles.msgText, isAdmin ? { color: '#FFFFFF' } : { color: '#334155' }]}>{text}</Text>
                      <Text style={[styles.msgTime, isAdmin ? { color: '#FCA5A5' } : { color: '#CBD5E1' }]}>
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.inputArea}>
            {!isClosed ? (
              <View style={styles.replyRow}>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Type admin response..."
                  style={styles.replyInput}
                  multiline
                />
                <TouchableOpacity 
                  onPress={handleSendReply}
                  disabled={!replyText.trim()}
                  style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => onUpdateStatus(selectedTicket.id, 'Open')} style={styles.reopenBtn}>
                <Text style={styles.reopenBtnText}>Reopen Ticket</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: '#EFF6FF' }]}>
          <Text style={styles.statLabel}>Open</Text>
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{tickets.filter(t => t.status === 'Open').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.statLabel}>Active</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{tickets.filter(t => t.status === 'In Progress').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={styles.statLabel}>Done</Text>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          placeholder="Search tickets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchField}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        {['All', ...statusOptions].map(s => (
          <TouchableOpacity 
            key={s} 
            onPress={() => setFilterStatus(s)}
            style={[styles.filterTab, filterStatus === s && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabText, filterStatus === s && styles.filterTabTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filteredTickets.map(ticket => {
          const st = statusColors[ticket.status] || statusColors['Open'];
          return (
            <TouchableOpacity 
              key={ticket.id} 
              onPress={() => setSelectedTicket(ticket)}
              style={styles.ticketCard}
            >
              <View style={styles.ticketTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title}</Text>
                  <Text style={styles.ticketMeta}>{getUserName(ticket.userId)} • #{ticket.id}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                  <Text style={[styles.statusBadgeText, { color: st.text }]}>{ticket.status}</Text>
                </View>
              </View>
              <View style={styles.ticketBottom}>
                <Text style={styles.ticketType}>{ticket.type}</Text>
                <Text style={styles.ticketDate}>{new Date(ticket.createdAt).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  headerId: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  detailList: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    width: '45%',
  },
  infoLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleAcademy: { backgroundColor: '#FFFBEB' },
  roleCoach: { backgroundColor: '#EFF6FF' },
  roleText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#D97706',
    textTransform: 'uppercase',
  },
  statusControl: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statusToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusToggleBtnOff: {
    backgroundColor: '#F8FAFC',
    borderColor: '#F1F5F9',
  },
  statusToggleText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  chatArea: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageMe: { justifyContent: 'flex-end' },
  messageOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: '#EF4444',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  msgSender: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  msgText: {
    fontSize: 12,
    lineHeight: 18,
  },
  msgTime: {
    fontSize: 8,
    marginTop: 4,
    textAlign: 'right',
  },
  inputArea: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#EF4444',
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  reopenBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reopenBtnText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchField: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    marginLeft: 8,
  },
  filterTabs: {
    paddingHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    maxHeight: 40,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  filterTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  ticketMeta: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ticketBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketType: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748B',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ticketDate: {
    fontSize: 8,
    color: '#CBD5E1',
  },
});
