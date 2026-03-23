import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TICKET_TYPES = [
  'Technical Issue', 'Bug', 'Refund', 'Enhancement Request',
  'Fraud Report', 'Match Recordings', 'Payment Issue', 'Tournament Issue', 'Other'
];

const statusColors = {
  'Open': { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  'In Progress': { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA', border: '#F3E8FF' },
  'Resolved': { bg: '#F0FDF4', text: '#16A34A', border: '#DCFCE7' },
  'Closed': { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' },
};

export const SupportTicketSystem = ({
  userId, userName, tickets = [], onCreateTicket, onSendMessage
}) => {
  const [view, setView] = useState('list');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [formData, setFormData] = useState({
    type: 'Other',
    title: '',
    description: ''
  });
  const scrollViewRef = useRef(null);

  const myTickets = (tickets || []).filter(t => t.userId === userId);

  useEffect(() => {
    if (view === 'detail' && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
        scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [selectedTicket?.messages, view]);

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  const handleCreate = () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      alert('Please fill in both title and description.');
      return;
    }
    onCreateTicket({
      userId,
      type: formData.type,
      title: formData.title,
      description: formData.description,
      messages: [{
        senderId: userId,
        text: formData.description,
        timestamp: new Date().toISOString()
      }]
    });
    setFormData({ type: 'Other', title: '', description: '' });
    setView('list');
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedTicket) return;
    onSendMessage(selectedTicket.id, newMessage);
    setNewMessage('');
  };

  if (view === 'list') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Support Requests</Text>
            <Text style={styles.subtitle}>{myTickets.length} ticket{myTickets.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => setView('create')} style={styles.newTicketBtn}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.btnText}>New Ticket</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {myTickets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#E2E8F0" />
              <Text style={styles.emptyTitle}>No support tickets yet</Text>
              <Text style={styles.emptySubtitle}>Create a new ticket to get help</Text>
            </View>
          ) : (
            myTickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(ticket => {
              const lastMessage = ticket.messages[ticket.messages.length - 1];
              const isAdminReply = lastMessage && lastMessage.senderId !== userId;
              const hasUnread = isAdminReply && ticket.status === 'Awaiting Response';
              const st = statusColors[ticket.status] || statusColors['Open'];

              return (
                <TouchableOpacity
                  key={ticket.id}
                  onPress={() => { setSelectedTicket(ticket); setView('detail'); }}
                  style={[styles.ticketCard, hasUnread && styles.ticketCardUnread]}
                >
                  <View style={styles.ticketCardHeader}>
                    <Text style={[styles.ticketTitle, { flex: 1 }]} numberOfLines={1}>{ticket.title}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                      <Text style={[styles.statusBadgeText, { color: st.text }]}>{ticket.status}</Text>
                    </View>
                  </View>
                  <View style={styles.ticketCardFooter}>
                    <Text style={styles.ticketType}>{ticket.type}</Text>
                    <Text style={styles.ticketDate}>
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {lastMessage && (
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {isAdminReply ? '🔴 Admin: ' : 'You: '}{lastMessage.text}
                    </Text>
                  )}
                  {hasUnread && (
                    <View style={styles.unreadTag}>
                      <View style={styles.unreadDot} />
                      <Text style={styles.unreadText}>New Reply</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  if (view === 'create') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.title}>Raise a Ticket</Text>
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Issue Type</Text>
                <TouchableOpacity 
                    onPress={() => {
                        const nextIdx = (TICKET_TYPES.indexOf(formData.type) + 1) % TICKET_TYPES.length;
                        setFormData(p => ({ ...p, type: TICKET_TYPES[nextIdx] }));
                    }}
                    style={styles.picker}
                >
                    <Text style={styles.pickerText}>{formData.type}</Text>
                    <Ionicons name="chevron-down" size={16} color="#64748B" />
                </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                    value={formData.title}
                    onChangeText={t => setFormData(p => ({ ...p, title: t }))}
                    placeholder="Brief summary of the issue"
                    style={styles.input}
                    maxLength={100}
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                    value={formData.description}
                    onChangeText={d => setFormData(p => ({ ...p, description: d }))}
                    placeholder="Describe the issue in detail..."
                    style={[styles.input, styles.textArea]}
                    multiline
                    numberOfLines={5}
                    maxLength={500}
                />
                <Text style={styles.charCount}>{formData.description.length}/500</Text>
            </View>

            <TouchableOpacity 
                onPress={handleCreate}
                disabled={!formData.title.trim() || !formData.description.trim()}
                style={[styles.submitBtn, (!formData.title.trim() || !formData.description.trim()) && styles.submitBtnDisabled]}
            >
                <Text style={styles.submitBtnText}>Submit Ticket</Text>
            </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (view === 'detail' && selectedTicket) {
    const isClosed = selectedTicket.status === 'Closed' || selectedTicket.status === 'Resolved';
    const st = statusColors[selectedTicket.status] || statusColors['Open'];

    return (
      <View style={styles.container}>
        <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
            <TouchableOpacity onPress={() => { setView('list'); setSelectedTicket(null); }} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.ticketTitleDetail} numberOfLines={1}>{selectedTicket.title}</Text>
                <View style={styles.detailBadgeRow}>
                    <Text style={styles.typeTag}>{selectedTicket.type}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                        <Text style={[styles.statusBadgeText, { color: st.text, fontSize: 8 }]}>{selectedTicket.status}</Text>
                    </View>
                </View>
            </View>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.flex}
          keyboardVerticalOffset={100}
        >
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
          >
            {selectedTicket.messages.map((msg, i) => {
              const text = typeof msg === 'string' ? msg : (msg.text || '');
              const senderId = typeof msg === 'string' ? selectedTicket.userId : (msg.senderId || '');
              const timestamp = typeof msg === 'string' ? selectedTicket.createdAt : (msg.timestamp || selectedTicket.createdAt);
              const isMe = String(senderId) === String(userId);

              return (
                <View key={i} style={[styles.messageRow, isMe ? styles.messageMe : styles.messageOther]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    {!isMe && <Text style={styles.adminLabel}>Admin Support</Text>}
                    <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>{text}</Text>
                    <Text style={[styles.timestamp, isMe ? styles.timeMe : styles.timeOther]}>
                      {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.inputArea}>
            {!isClosed ? (
              <View style={styles.chatInputRow}>
                <TextInput
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type your message..."
                  style={styles.chatInput}
                  multiline
                />
                <TouchableOpacity 
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim()}
                  style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.closedNote}>
                <Text style={styles.closedNoteText}>This ticket is {selectedTicket.status.toLowerCase()}</Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  newTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  btnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    gap: 12,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F1F5F9',
    borderRadius: 32,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 10,
    color: '#CBD5E1',
    marginTop: 4,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  ticketCardUnread: {
    borderColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ticketCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketType: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  ticketDate: {
    fontSize: 9,
    color: '#CBD5E1',
  },
  lastMessage: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  unreadTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  unreadText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  formContainer: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  charCount: {
    fontSize: 9,
    color: '#CBD5E1',
    textAlign: 'right',
  },
  submitBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#F1F5F9',
    shadowOpacity: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ticketTitleDetail: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  detailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  typeTag: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#94A3B8',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  chatContent: {
    padding: 20,
    gap: 12,
    paddingBottom: 40,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageMe: {
    justifyContent: 'flex-end',
  },
  messageOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: '#0F172A',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  adminLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
  },
  textMe: { color: '#FFFFFF' },
  textOther: { color: '#334155' },
  timestamp: {
    fontSize: 8,
    marginTop: 4,
  },
  timeMe: { color: '#64748B', textAlign: 'right' },
  timeOther: { color: '#94A3B8' },
  inputArea: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chatInput: {
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
    backgroundColor: '#F1F5F9',
  },
  closedNote: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    alignItems: 'center',
  },
  closedNoteText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
});
