import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';

const statusColors = {
  'Open': { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  'In Progress': { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA', border: '#F3E8FF' },
  'Resolved': { bg: '#F0FDF4', text: '#16A34A', border: '#DCFCE7' },
  'Closed': { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' },
};

const statusOptions = ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'];

export const AdminGrievancesPanel = ({
  tickets, players, onReply, onUpdateStatus, onTypingStart, onTypingStop
}) => {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    if (selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
        scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [selectedTicket?.messages]);

  useEffect(() => {
    if (selectedTicket) {
      const updated = (tickets || []).find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  const getUserName = (userId) => (players || []).find(pl => pl.id === userId)?.name || userId;
  const getUserRole = (userId) => (players || []).find(pl => pl.id === userId)?.role || 'user';

  const filteredTickets = (tickets || [])
    .filter(t => filterStatus === 'All' || t.status === filterStatus)
    .filter(t => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const userName = getUserName(t.userId).toLowerCase();
      const userId = t.userId.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || userName.includes(q) || userId.includes(q);
    });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true
    });
    if (!result.canceled) {
      setSelectedImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setShowPlusMenu(false);
    }
  };

  const handleSendReply = () => {
    if ((!replyText.trim() && !selectedImage) || !selectedTicket) return;
    onReply(selectedTicket.id, replyText, selectedImage, replyToMsg);
    setReplyText('');
    setSelectedImage(null);
    setReplyToMsg(null);
  };

  const renderMessageReply = (reply) => {
    if (!reply) return null;
    return (
      <View style={styles.msgReplyPreview}>
        <Text style={styles.msgReplyUser}>{reply.senderId === 'admin' ? 'Admin' : getUserName(reply.senderId)}</Text>
        <Text style={styles.msgReplyText} numberOfLines={1}>{reply.text}</Text>
      </View>
    );
  };

  const renderMessage = (msg, index) => {
    // Resilient data extraction
    const text = msg?.text || msg?.message || (typeof msg === 'string' ? msg : 'Empty message');
    const timestamp = msg?.timestamp || new Date().toISOString();
    const legacySender = selectedTicket?.userId || 'user';
    const senderId = msg?.senderId || legacySender;
    const isMe = senderId === 'admin';
    const senderName = isMe ? 'Admin Support' : getUserName(senderId);

    const renderRightActions = () => (
      <View style={styles.swipeToReplyAction}>
        <Ionicons name="arrow-undo" size={20} color="#64748B" />
      </View>
    );

    return (
      <Swipeable
        key={msg.id || index}
        renderRightActions={isMe ? renderRightActions : undefined}
        renderLeftActions={!isMe ? renderRightActions : undefined}
        onSwipeableOpen={() => setReplyToMsg(msg)}
      >
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          {renderMessageReply(msg.replyTo)}
          {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
          {msg.image && (
            <Image source={{ uri: msg.image }} style={styles.msgImage} resizeMode="contain" />
          )}
          <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
            {text}
          </Text>
          <Text style={styles.timestamp}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </Swipeable>
    );
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
          <ScrollView style={styles.detailList} showsVerticalScrollIndicator={false}>
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
          </ScrollView>

          <View style={styles.chatContainer}>
            <ScrollView 
              ref={scrollViewRef} 
              style={styles.chatScroll} 
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {(selectedTicket?.messages || []).map((msg, index) => renderMessage(msg, index))}
              {isUserTyping && (
                <View style={styles.typingIndicator}>
                  <Text style={styles.typingText}>User is typing...</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputArea}>
              {replyToMsg && (
                <View style={styles.replyPreviewBar}>
                  <View style={styles.replyPreviewInner}>
                    <Text style={styles.replyPreviewUser}>Replying to {replyToMsg.senderId === 'admin' ? 'yourself' : getUserName(replyToMsg.senderId)}</Text>
                    <Text style={styles.replyPreviewText} numberOfLines={1}>{replyToMsg.text}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyToMsg(null)}>
                    <Ionicons name="close-circle" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
              )}

              {selectedImage && (
                <View style={styles.imagePreviewBar}>
                  <Image source={{ uri: selectedImage }} style={styles.imagePreviewThumb} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}

              {!isClosed ? (
                <View style={styles.chatInputRow}>
                  <TouchableOpacity 
                    onPress={() => setShowPlusMenu(!showPlusMenu)} 
                    style={styles.plusBtn}
                  >
                    <Ionicons name="add-circle" size={28} color="#2563EB" />
                  </TouchableOpacity>

                  {showPlusMenu && (
                    <View style={styles.plusMenu}>
                      <TouchableOpacity style={styles.plusMenuItem} onPress={pickImage}>
                        <Ionicons name="image" size={18} color="#2563EB" />
                        <Text style={styles.plusMenuText}>Gallery</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TextInput
                    style={styles.chatInput}
                    value={replyText}
                    onChangeText={(txt) => {
                      setReplyText(txt);
                      if (txt.length > 0) onTypingStart?.(selectedTicket.id);
                      else onTypingStop?.(selectedTicket.id);
                    }}
                    onBlur={() => onTypingStop?.(selectedTicket.id)}
                    placeholder="Type a reply..."
                    multiline
                  />
                  <TouchableOpacity 
                    style={[styles.sendBtn, (!replyText.trim() && !selectedImage) && styles.sendDisabled]} 
                    disabled={!replyText.trim() && !selectedImage}
                    onPress={handleSendReply}
                  >
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.closedNote}>
                  <Text style={styles.closedNoteText}>This ticket is closed</Text>
                </View>
              )}
            </View>
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
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{(tickets || []).filter(t => t && t.status === 'Open').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.statLabel}>Active</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{(tickets || []).filter(t => t && t.status === 'In Progress').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={styles.statLabel}>Done</Text>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{(tickets || []).filter(t => t && (t.status === 'Resolved' || t.status === 'Closed')).length}</Text>
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
        {(filteredTickets || []).map(ticket => {
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
  // Advanced Chat Styles
  chatContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  chatScroll: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 20,
    marginBottom: 8,
    maxWidth: '85%',
  },
  myBubble: {
    backgroundColor: '#2563EB',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  myText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  otherText: {
    color: '#0F172A',
    fontSize: 14,
  },
  senderLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563EB',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 9,
    color: '#94A3B8',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  msgImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  msgReplyPreview: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  msgReplyUser: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 2,
  },
  msgReplyText: {
    fontSize: 11,
    color: '#64748B',
  },
  swipeToReplyAction: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingIndicator: {
    padding: 8,
    marginBottom: 16,
  },
  typingText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  inputArea: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    maxHeight: 100,
  },
  plusBtn: {
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: '#F1F5F9',
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  replyPreviewInner: {
    flex: 1,
  },
  replyPreviewUser: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#64748B',
  },
  imagePreviewBar: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
  },
  imagePreviewThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    left: 56,
  },
  plusMenu: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 1000,
  },
  plusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  plusMenuText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  closedNote: {
    padding: 20,
    alignItems: 'center',
  },
  closedNoteText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
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
