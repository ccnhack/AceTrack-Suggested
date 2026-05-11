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
  const { 
    messages, fetchMessages, sendMessage, appendMessage, markAsSeen, 
    uploadAttachment, uploadingFile, replyTo, setReplyTo, 
    toggleReaction, deleteMessage 
  } = useCommsStore();
  
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgText, setMsgText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  
  const fileInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && windowWidth < 768;

  useEffect(() => {
    fetchTeamDirectory();
    fetchMessages();
    
    // Subscribe to socket updates
    const onNewMessage = (msg) => {
      if (selectedContact && (String(msg.senderId) === String(selectedContact.id) || String(msg.receiverId) === String(selectedContact.id))) {
        appendMessage(msg);
      }
    };

    socketService.on('org_chat_message', onNewMessage);
    return () => {
        // Socket cleanups are usually handled by SocketService, but we can add specific ones if needed
    };
  }, [selectedContact]);

  useEffect(() => {
    if (chatScrollRef.current) {
      setTimeout(() => chatScrollRef.current.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusText = (contact) => {
    if (contact.isLive) return 'Online';
    if (contact.lastActive) {
      const diff = Date.now() - new Date(contact.lastActive).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 5) return 'Active now';
      if (mins < 60) return `Active ${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `Active ${hours}h ago`;
      return `Active ${Math.floor(hours / 24)}d ago`;
    }
    return 'Offline';
  };

  const getConversation = () => {
    if (!selectedContact) return [];
    return messages.filter(m => 
      (String(m.senderId) === String(currentUser?.id) && String(m.receiverId) === String(selectedContact.id)) ||
      (String(m.senderId) === String(selectedContact.id) && String(m.receiverId) === String(currentUser?.id)) ||
      (!m.receiverId && !selectedContact.id) // Global chat case
    );
  };

  const getUnreadCount = (contactId) => {
    return messages.filter(m => 
      String(m.senderId) === String(contactId) && 
      String(m.receiverId) === String(currentUser?.id) && 
      m.status !== 'seen'
    ).length;
  };

  const getLastMessage = (contactId) => {
    const conv = messages.filter(m => 
      (String(m.senderId) === String(currentUser?.id) && String(m.receiverId) === String(contactId)) ||
      (String(m.senderId) === String(contactId) && String(m.receiverId) === String(currentUser?.id))
    );
    return conv[conv.length - 1];
  };

  const handleFileSelect = async (event) => {
    if (isWeb) {
      const file = event.target.files[0];
      if (!file) return;
      const att = await uploadAttachment(file);
      if (att) setPendingAttachments(prev => [...prev, att]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if ((!msgText.trim() && pendingAttachments.length === 0) || !selectedContact) return;
    const text = msgText.trim();
    const atts = [...pendingAttachments];
    setMsgText('');
    setPendingAttachments([]);
    await sendMessage(text, selectedContact.id, atts);
    fetchMessages();
  };

  const handleKeyPress = (e) => {
    if (isWeb && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderContactList = () => (
    <View style={[styles.contactPanel, isMobileWeb && selectedContact && { display: 'none' }]}>
      <View style={styles.contactHeader}>
        <Text style={styles.contactHeaderTitle}>Team Chat</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search team..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <ScrollView style={styles.contactList}>
        {teamDirectory
          .filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(contact => {
            const lastMsg = getLastMessage(contact.id);
            const unread = getUnreadCount(contact.id);
            const isActive = selectedContact?.id === contact.id;
            return (
              <TouchableOpacity
                key={contact.id}
                style={[styles.contactItem, isActive && styles.contactItemActive]}
                onPress={() => setSelectedContact(contact)}
              >
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, unread > 0 && styles.avatarActive]}>
                    <Text style={[styles.avatarText, unread > 0 && { color: '#FFF' }]}>{getInitials(contact.name)}</Text>
                  </View>
                  {getStatusText(contact) === 'Online' && <View style={styles.avatarOnlineDot} />}
                </View>
                <View style={styles.contactInfo}>
                  <View style={styles.contactNameRow}>
                    <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
                    {lastMsg && <Text style={styles.contactTime}>{formatTime(lastMsg.timestamp)}</Text>}
                  </View>
                  <Text style={styles.contactPreview} numberOfLines={1}>
                    {lastMsg ? lastMsg.content : contact.role}
                  </Text>
                </View>
                {unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );

  const renderChatPanel = () => {
    if (!selectedContact) {
      return (
        <View style={styles.chatPanel}>
          <View style={styles.emptyChatContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyChatTitle}>Select a conversation</Text>
          </View>
        </View>
      );
    }

    const conversation = getConversation();

    return (
      <View style={styles.chatPanel}>
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
            <Text style={styles.chatHeaderName}>{selectedContact.name}</Text>
            <Text style={styles.statusText}>{getStatusText(selectedContact)}</Text>
          </View>
        </View>

        <ScrollView 
          ref={chatScrollRef}
          style={styles.messageArea}
          contentContainerStyle={styles.messageAreaContent}
        >
          {conversation.map((msg, idx) => {
            const isMe = String(msg.senderId) === String(currentUser?.id);
            return (
              <View 
                key={msg._id || idx} 
                style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}
              >
                <View 
                    style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}
                    onMouseEnter={() => isWeb && setHoveredMessageId(msg._id)}
                    onMouseLeave={() => isWeb && setHoveredMessageId(null)}
                >
                  {/* 🛡️ [REPLY_TO] */}
                  {msg.replyTo && (
                    <View style={styles.replyQuote}>
                      <Text style={styles.replyQuoteText} numberOfLines={1}>
                        {messages.find(m => m._id === msg.replyTo)?.content || 'Original message'}
                      </Text>
                    </View>
                  )}

                  {msg.content && <Text style={[styles.msgContent, isMe && { color: '#FFF' }]}>{msg.content}</Text>}
                  
                  {/* 📎 [ATTACHMENTS] */}
                  {msg.attachments?.map((att, i) => (
                    <TouchableOpacity key={i} onPress={() => window.open(att.url, '_blank')} style={styles.attachmentChip}>
                        <Ionicons name={att.mimeType?.startsWith('image/') ? "image" : "document"} size={16} color={isMe ? "#FFF" : "#6366F1"} />
                        <Text style={[styles.attachmentText, isMe && { color: '#FFF' }]} numberOfLines={1}>{att.filename}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* 😄 [REACTIONS] */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <View style={styles.reactionRow}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => (
                        <TouchableOpacity key={emoji} style={styles.reactionChip} onPress={() => toggleReaction(msg._id, emoji)}>
                          <Text style={{ fontSize: 12 }}>{emoji} {users.length}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={[styles.msgTimestamp, isMe && { color: 'rgba(255,255,255,0.6)' }]}>{formatTime(msg.timestamp)}</Text>

                  {/* 🛠️ [TOOLBAR] */}
                  {(hoveredMessageId === msg._id || activeMenuId === msg._id) && (
                    <View style={[styles.msgToolbar, isMe ? styles.msgToolbarMe : styles.msgToolbarOther]}>
                        <View style={styles.emojiStrip}>
                            {['👍', '❤️', '😂', '😮'].map(e => (
                                <TouchableOpacity key={e} onPress={() => toggleReaction(msg._id, e)} style={styles.emojiBtn}>
                                    <Text>{e}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity onPress={() => setActiveMenuId(activeMenuId === msg._id ? null : msg._id)} style={styles.moreBtn}>
                            <Ionicons name="ellipsis-horizontal" size={16} color="#64748B" />
                        </TouchableOpacity>

                        {activeMenuId === msg._id && (
                            <View style={styles.actionsDropdown}>
                                <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyTo(msg); setActiveMenuId(null); }}>
                                    <Ionicons name="return-up-back" size={14} color="#475569" />
                                    <Text style={styles.actionItemText}>Reply</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionItem} onPress={() => { deleteMessage(msg._id); setActiveMenuId(null); }}>
                                    <Ionicons name="trash" size={14} color="#EF4444" />
                                    <Text style={[styles.actionItemText, { color: '#EF4444' }]}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* 💬 [REPLY_PREVIEW] */}
        {replyTo && (
            <View style={styles.replyPreview}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.replyPreviewTitle}>Replying to {replyTo.senderName}</Text>
                    <Text style={styles.replyPreviewText} numberOfLines={1}>{replyTo.content}</Text>
                </View>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                    <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </TouchableOpacity>
            </View>
        )}

        <View style={styles.inputArea}>
          {isWeb && <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />}
          <TouchableOpacity onPress={() => fileInputRef.current?.click()} style={styles.attachBtn}>
            {uploadingFile ? <ActivityIndicator size="small" color="#6366F1" /> : <Ionicons name="attach" size={24} color="#64748B" />}
          </TouchableOpacity>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            value={msgText}
            onChangeText={setMsgText}
            onKeyPress={handleKeyPress}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
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
  contactPanel: { width: 340, backgroundColor: '#0F172A', borderRightWidth: 1, borderRightColor: '#1E293B' },
  contactHeader: { padding: 20 },
  contactHeaderTitle: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', marginHorizontal: 16, padding: 10, borderRadius: 12 },
  searchInput: { flex: 1, marginLeft: 10, color: '#FFF', outlineStyle: 'none' },
  contactList: { flex: 1 },
  contactItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  contactItemActive: { backgroundColor: '#1E293B' },
  avatarContainer: { marginRight: 14, position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  avatarActive: { backgroundColor: '#6366F1' },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#94A3B8' },
  avatarOnlineDot: { position: 'absolute', bottom: 0, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#0F172A' },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  contactName: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  contactTime: { fontSize: 11, color: '#64748B' },
  contactPreview: { fontSize: 12, color: '#94A3B8' },
  unreadBadge: { backgroundColor: '#6366F1', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  unreadText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  chatPanel: { flex: 1, backgroundColor: '#FAFBFC' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  chatHeaderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  chatHeaderAvatarText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  chatHeaderName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  statusText: { fontSize: 11, color: '#94A3B8' },
  messageArea: { flex: 1 },
  messageAreaContent: { padding: 20 },
  msgRow: { marginBottom: 12, width: '100%' },
  msgRowMe: { alignItems: 'flex-end' },
  msgRowOther: { alignItems: 'flex-start' },
  msgBubble: { padding: 12, borderRadius: 18, maxWidth: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  msgBubbleMe: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  msgContent: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  msgTimestamp: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 8 },
  attachmentText: { fontSize: 12, marginLeft: 6, flex: 1 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  reactionChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  msgToolbar: { position: 'absolute', top: -36, flexDirection: 'row', backgroundColor: '#FFF', padding: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 10 },
  msgToolbarMe: { right: 0 },
  msgToolbarOther: { left: 0 },
  emojiStrip: { flexDirection: 'row', borderRightWidth: 1, borderRightColor: '#F1F5F9', paddingRight: 4 },
  emojiBtn: { paddingHorizontal: 6 },
  moreBtn: { paddingHorizontal: 8, justifyContent: 'center' },
  actionsDropdown: { position: 'absolute', top: 40, right: 0, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, zIndex: 20 },
  actionItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  actionItemText: { fontSize: 13, marginLeft: 8, color: '#475569' },
  replyQuote: { backgroundColor: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#6366F1' },
  replyQuoteText: { fontSize: 12, fontStyle: 'italic', color: '#64748B' },
  replyPreview: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', padding: 12, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#6366F1' },
  replyPreviewTitle: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  replyPreviewText: { fontSize: 12, color: '#64748B' },
  inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#0F172A', outlineStyle: 'none' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
});

export default OrgChatScreen;
