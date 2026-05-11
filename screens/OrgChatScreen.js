import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, TextInput, ScrollView, 
  StyleSheet, Platform, useWindowDimensions, SafeAreaView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdminCoreStore } from '../stores/useAdminCoreStore';
import { useCommsStore } from '../stores/useCommsStore';
import { useAuth } from '../context/AuthContext';
import { socketService } from '../services/sync/SocketService';

const OrgChatScreen = ({ navigation }) => {
  const { currentUser } = useAuth();
  const { teamDirectory, fetchTeamDirectory } = useAdminCoreStore();
  const { messages, fetchMessages, sendMessage, appendMessage, markAsSeen } = useCommsStore();
  
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgText, setMsgText] = useState('');
  const chatScrollRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && windowWidth < 768;

  useEffect(() => {
    fetchTeamDirectory();
    fetchMessages();
  }, []);

  useEffect(() => {
    if (selectedContact) {
      markAsSeen(selectedContact.id);
    }
  }, [selectedContact, messages]); // Re-run when new messages arrive if conversation is open

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    const handleNewMessage = (newMsg) => appendMessage(newMsg);
    socket.on('org_chat_message', handleNewMessage);
    return () => socket.off('org_chat_message', handleNewMessage);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (selectedContact) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    }
  }, [messages, selectedContact]);

  const contacts = (teamDirectory || []).filter(c => {
    const role = (c.role || '').toLowerCase();
    if (role !== 'support' && role !== 'admin') return false;
    if (!searchQuery) return true;
    return (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (c.username || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getConversation = () => {
    if (!selectedContact || !currentUser) return [];
    return (messages || []).filter(m =>
      (String(m.senderId) === String(currentUser.id) && String(m.receiverId) === String(selectedContact.id)) ||
      (String(m.senderId) === String(selectedContact.id) && String(m.receiverId) === String(currentUser.id))
    );
  };

  const getLastMessage = (contactId) => {
    const conv = (messages || []).filter(m =>
      (String(m.senderId) === String(currentUser?.id) && String(m.receiverId) === String(contactId)) ||
      (String(m.senderId) === String(contactId) && String(m.receiverId) === String(currentUser?.id))
    );
    return conv.length > 0 ? conv[conv.length - 1] : null;
  };

  const getUnreadCount = (contactId) => {
    return (messages || []).filter(m =>
      String(m.senderId) === String(contactId) && String(m.receiverId) === String(currentUser?.id) && m.status !== 'seen'
    ).length;
  };

  const handleSend = async () => {
    if (!msgText.trim() || !selectedContact) return;
    const text = msgText.trim();
    setMsgText('');
    const success = await sendMessage(text, selectedContact.id);
    if (success) {
      // Also re-fetch from server to ensure consistency
      await fetchMessages();
    }
  };

  // 🛡️ [WEB_UX] (v2.6.344): Enter to send, Shift+Enter for newline
  const handleKeyPress = (e) => {
    if (Platform.OS !== 'web') return;
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getStatusText = (contact) => {
    if (!contact) return '';
    // 🛡️ [PRESENCE_UI] (v2.6.392): Use the real-time injected isLive flag
    if (contact.isLive || contact.status === 'active' || contact.supportStatus === 'active') {
      return 'Online';
    }
    
    // Fallback to recency only if not live
    const theirMessages = (messages || []).filter(m => String(m.senderId) === String(contact.id));
    if (theirMessages.length > 0) {
      const lastMsg = theirMessages[theirMessages.length - 1];
      const diffMs = new Date() - new Date(lastMsg.timestamp);
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 5) return 'Online';
      if (diffMins < 60) return `Active ${diffMins} mins ago`;
      if (diffMins < 1440) return `Active ${Math.floor(diffMins/60)} hours ago`;
      return `Active yesterday`;
    }
    return 'Offline';
  };

  // ─── Contact List Panel ───────────────────────
  const renderContactList = () => (
    <View style={[styles.contactPanel, isMobileWeb && selectedContact && { display: 'none' }]}>
      {/* Search Header */}
      <View style={styles.contactHeader}>
        <Text style={styles.contactHeaderTitle}>Chat</Text>
        <TouchableOpacity onPress={() => { navigation.goBack(); }} style={styles.contactCloseBtn}>
          <Ionicons name="close" size={22} color="#64748B" />
        </TouchableOpacity>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Contact List */}
      <ScrollView style={styles.contactList} showsVerticalScrollIndicator={false}>
        {contacts.length === 0 ? (
          <View style={styles.emptyContacts}>
            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
            <Text style={styles.emptyText}>No contacts found</Text>
          </View>
        ) : (
          contacts
            .sort((a, b) => {
              // 🛡️ [SORTING_LOGIC] (v2.6.258): Unread first, then recency
              const unreadA = getUnreadCount(a.id);
              const unreadB = getUnreadCount(b.id);
              if (unreadA !== unreadB) return unreadB - unreadA;
              
              const lastA = getLastMessage(a.id)?.timestamp || 0;
              const lastB = getLastMessage(b.id)?.timestamp || 0;
              return new Date(lastB) - new Date(lastA);
            })
            .map(contact => {
              const lastMsg = getLastMessage(contact.id);
              const unread = getUnreadCount(contact.id);
              const isActive = selectedContact?.id === contact.id;
              const hasUnread = unread > 0;

              return (
                <TouchableOpacity
                  key={contact.id}
                  style={[
                    styles.contactItem, 
                    isActive && styles.contactItemActive,
                    hasUnread && styles.contactItemUnread
                  ]}
                  onPress={() => setSelectedContact(contact)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatarContainer}>
                    <View style={[styles.avatar, hasUnread ? styles.avatarActive : (isActive && { backgroundColor: '#475569' })]}>
                      <Text style={[styles.avatarText, (isActive || hasUnread) && { color: '#FFF' }]}>{getInitials(contact.name)}</Text>
                    </View>
                    {getStatusText(contact) === 'Online' && <View style={styles.avatarOnlineDot} />}
                  </View>
                  <View style={styles.contactInfo}>
                    <View style={styles.contactNameRow}>
                      <Text style={[styles.contactName, hasUnread && styles.contactNameActive]} numberOfLines={1}>
                        {contact.name || 'Unknown'}{String(contact.id) === String(currentUser?.id) ? ' (You)' : ''}
                      </Text>
                      {lastMsg && (
                        <Text style={[styles.contactTime, hasUnread && { color: '#6366F1', fontWeight: 'bold' }]}>{formatTime(lastMsg.timestamp)}</Text>
                      )}
                    </View>
                    <View style={styles.contactPreviewRow}>
                      <Text style={[styles.contactPreview, hasUnread && { color: '#E2E8F0', fontWeight: '700' }]} numberOfLines={1}>
                        {lastMsg ? (String(lastMsg.senderId) === String(currentUser?.id) ? `You: ${lastMsg.content}` : lastMsg.content) : contact.role}
                      </Text>
                      {unread > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{unread}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
        )}
      </ScrollView>
    </View>
  );

  // ─── Chat Panel ───────────────────────
  const renderChatPanel = () => {
    if (!selectedContact) {
      return (
        <View style={[styles.chatPanel, isMobileWeb && { display: 'none' }]}>
          <View style={styles.emptyChatContainer}>
            <View style={styles.emptyChatIcon}>
              <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
            </View>
            <Text style={styles.emptyChatTitle}>Select a conversation</Text>
            <Text style={styles.emptyChatSub}>Choose a team member from the left to start chatting</Text>
          </View>
        </View>
      );
    }

    const conversation = getConversation();

    return (
      <View style={[styles.chatPanel, isMobileWeb && !selectedContact && { display: 'none' }]}>
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          {isMobileWeb && (
            <TouchableOpacity onPress={() => setSelectedContact(null)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
          )}
          <View style={styles.chatHeaderAvatar}>
            <Text style={styles.chatHeaderAvatarText}>{getInitials(selectedContact.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.chatHeaderName}>{selectedContact.name || 'Unknown'}</Text>
              <View style={[styles.statusIndicator, { backgroundColor: getStatusText(selectedContact) === 'Online' ? '#10B981' : '#94A3B8' }]} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.chatHeaderRole}>{(selectedContact.role || '').charAt(0).toUpperCase() + (selectedContact.role || '').slice(1)}</Text>
              <Text style={styles.statusText}> • {getStatusText(selectedContact)}</Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        <ScrollView 
          ref={chatScrollRef}
          style={styles.messageArea}
          contentContainerStyle={styles.messageAreaContent}
          showsVerticalScrollIndicator={false}
        >
          {conversation.length === 0 ? (
            <View style={styles.noMsgContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={36} color="#E2E8F0" />
              <Text style={styles.noMsgText}>No messages yet</Text>
              <Text style={styles.noMsgSub}>Start a conversation with {selectedContact.name}</Text>
            </View>
          ) : (
            conversation.map((msg, idx) => {
              const isMe = String(msg.senderId) === String(currentUser?.id);
              const showDate = idx === 0 || new Date(msg.timestamp).toDateString() !== new Date(conversation[idx - 1].timestamp).toDateString();
              
              return (
                <View key={msg._id || msg.timestamp || idx}>
                  {showDate && (
                    <View style={styles.dateDivider}>
                      <View style={styles.dateLine} />
                      <Text style={styles.dateText}>
                        {new Date(msg.timestamp).toDateString() === new Date().toDateString() ? 'Today' : 
                         new Date(msg.timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <View style={styles.dateLine} />
                    </View>
                  )}
                  <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
                    {!isMe && (
                      <View style={styles.msgAvatarSmall}>
                        <Text style={styles.msgAvatarSmallText}>{getInitials(selectedContact.name)}</Text>
                      </View>
                    )}
                    <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
                      <Text style={[styles.msgContent, isMe && { color: '#FFF' }]}>{msg.content}</Text>
                      <Text style={[styles.msgTimestamp, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.chatInput}
            placeholder={`Message ${selectedContact.name}...`}
            placeholderTextColor="#94A3B8"
            value={msgText}
            onChangeText={setMsgText}
            onSubmitEditing={handleSend}
            onKeyPress={handleKeyPress}
            blurOnSubmit={false}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendBtn, !msgText.trim() && styles.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={!msgText.trim()}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainLayout}>
        {renderContactList()}
        {renderChatPanel()}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  mainLayout: { flex: 1, flexDirection: 'row' },

  // ─── Contact Panel ───────────────
  contactPanel: {
    width: 340,
    backgroundColor: '#0F172A', // Dark sidebar theme
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    ...Platform.select({ web: { maxWidth: 340, minWidth: 280 } }),
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  contactHeaderTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },
  contactCloseBtn: { padding: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#FFFFFF', ...Platform.select({ web: { outlineStyle: 'none' } }) },
  contactList: { flex: 1 },
  emptyContacts: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },

  // ─── Contact Item ───────────────
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  contactItemActive: { backgroundColor: '#1E293B' },
  contactItemUnread: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  avatarContainer: {
    marginRight: 14,
    position: 'relative'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A'
  },
  avatarActive: { backgroundColor: '#6366F1' },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#94A3B8' },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  contactName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', flex: 1, marginRight: 8 },
  contactNameActive: { color: '#6366F1' },
  contactTime: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  contactPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactPreview: { fontSize: 12, color: '#94A3B8', flex: 1, marginRight: 8 },
  unreadBadge: { backgroundColor: '#6366F1', borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  unreadText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  // ─── Chat Panel ───────────────
  chatPanel: { flex: 1, backgroundColor: '#FAFBFC' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chatHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  chatHeaderAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  chatHeaderName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500'
  },
  chatHeaderRole: { fontSize: 12, color: '#64748B', textTransform: 'capitalize' },

  // ─── Empty Chat ───────────────
  emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyChatTitle: { fontSize: 18, fontWeight: '800', color: '#334155', marginBottom: 8 },
  emptyChatSub: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  // ─── Messages ───────────────
  messageArea: { flex: 1, backgroundColor: '#FAFBFC' },
  messageAreaContent: { padding: 20, paddingBottom: 10 },
  noMsgContainer: { alignItems: 'center', marginTop: 80 },
  noMsgText: { fontSize: 16, fontWeight: '700', color: '#94A3B8', marginTop: 12 },
  noMsgSub: { fontSize: 13, color: '#CBD5E1', marginTop: 4 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dateLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dateText: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginHorizontal: 12, textTransform: 'uppercase' },

  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '75%' },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgRowOther: { alignSelf: 'flex-start' },
  msgAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  msgAvatarSmallText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  msgBubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, maxWidth: '100%' },
  msgBubbleMe: { backgroundColor: '#6366F1', borderBottomRightRadius: 6 },
  msgBubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  msgContent: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  msgTimestamp: { fontSize: 10, color: '#94A3B8', marginTop: 4, alignSelf: 'flex-end' },

  // ─── Input Area ───────────────
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 100,
    marginRight: 10,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
});

export default OrgChatScreen;
