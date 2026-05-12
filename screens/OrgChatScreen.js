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
  const { messages, fetchMessages, sendMessage, appendMessage, markAsSeen, uploadAttachment, uploadingFile, replyTo, setReplyTo, toggleReaction, deleteMessage } = useCommsStore();
  
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgText, setMsgText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [hoveredMessageId, setHoveredMessageId] = useState(null); // 🖱️ [HOVER_STATE]
  const [activeMenuId, setActiveMenuId] = useState(null); // ⋯ [DROPDOWN_STATE]
  const fileInputRef = useRef(null);
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
    
    // 📡 [SOCKET_HANDLERS] (v2.6.405)
    const handleReaction = (payload) => useCommsStore.getState().updateReactions(payload.messageId, payload.reactions);
    const handleDelete = (payload) => useCommsStore.getState().removeMessage(payload.messageId);

    socket.on('org_chat_message', handleNewMessage);
    socket.on('org_chat_reaction', handleReaction);
    socket.on('org_chat_delete', handleDelete);

    return () => {
      socket.off('org_chat_message', handleNewMessage);
      socket.off('org_chat_reaction', handleReaction);
      socket.off('org_chat_delete', handleDelete);
    };
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

  const renderLastMessagePreview = (msg) => {
    if (!msg) return '';
    const prefix = String(msg.senderId) === String(currentUser?.id) ? 'You: ' : '';
    if (msg.attachments && msg.attachments.length > 0) {
      const isImage = msg.attachments[0].mimeType?.startsWith('image/');
      return `${prefix}[${isImage ? 'Image' : 'File'}] ${msg.content || ''}`;
    }
    return `${prefix}${msg.content}`;
  };

  const getUnreadCount = (contactId) => {
    return (messages || []).filter(m =>
      String(m.senderId) === String(contactId) && String(m.receiverId) === String(currentUser?.id) && m.status !== 'seen'
    ).length;
  };

  const handleFileSelect = async (event) => {
    if (Platform.OS === 'web') {
      const file = event.target.files[0];
      if (!file) return;
      
      const attachment = await uploadAttachment(file);
      if (attachment) {
        setPendingAttachments(prev => [...prev, attachment]);
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      // Mobile implementation would use expo-document-picker or expo-image-picker
      alert('File selection is currently optimized for Web.');
    }
  };

  const removeAttachment = (publicId) => {
    setPendingAttachments(prev => prev.filter(a => a.publicId !== publicId));
  };

  const handleSend = async () => {
    if ((!msgText.trim() && pendingAttachments.length === 0) || !selectedContact) return;
    
    const text = msgText.trim();
    const attachments = [...pendingAttachments];
    const rTo = replyTo?._id || null;
    
    setMsgText('');
    setPendingAttachments([]);
    setReplyTo(null); // Clear reply state
    
    const success = await sendMessage(text, selectedContact.id, attachments);
    if (success) {
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
    // 🛡️ [PRESENCE_UI] (v2.6.393): Use real-time injected isLive flag
    if (contact.isLive || contact.status === 'active' || contact.supportStatus === 'active') {
      return 'Online';
    }
    
    // 🛡️ [HISTORY_UI] (v2.6.393): Use enriched lastActive timestamp
    const lastActiveTs = contact.lastActive || 0;
    if (lastActiveTs > 0) {
      const diffMs = Date.now() - new Date(lastActiveTs).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 5) return 'Online';
      if (diffMins < 60) return `Active ${diffMins}m ago`;
      if (diffMins < 1440) return `Active ${Math.floor(diffMins/60)}h ago`;
      if (diffMins < 2880) return 'Active yesterday';
      return `Active ${new Date(lastActiveTs).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
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
                        {lastMsg ? renderLastMessagePreview(lastMsg) : contact.role}
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
                    <View 
                        style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther, { position: 'relative' }]}
                        onMouseEnter={() => isWeb && setHoveredMessageId(msg._id)}
                        onMouseLeave={() => isWeb && setHoveredMessageId(null)}
                    >
                      {/* 🛡️ [REPLY_TO_UI] (v2.6.407): Show populated quoted message */}
                      {msg.replyTo && (
                        <View style={[styles.replyQuote, isMe ? styles.replyQuoteMe : styles.replyQuoteOther]}>
                          {typeof msg.replyTo === 'object' && (
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isMe ? 'rgba(255,255,255,0.9)' : '#6366F1', marginBottom: 2 }}>
                              {msg.replyTo.senderName}
                            </Text>
                          )}
                          <Text style={styles.replyQuoteText} numberOfLines={1}>
                            {typeof msg.replyTo === 'object' ? 
                              (msg.replyTo.content || (msg.replyTo.attachments?.length ? '[Attachment]' : 'Original message deleted'))
                              : 'Original message deleted'
                            }
                          </Text>
                        </View>
                      )}

                      {msg.content && msg.content !== '(empty)' && (
                        <Text style={[styles.msgContent, isMe && { color: '#FFF' }]}>{msg.content}</Text>
                      )}
                      
                      {msg.attachments && msg.attachments.length > 0 && (
                        <View style={styles.attachmentContainer}>
                          {msg.attachments.map((att, attIdx) => {
                            const isImage = att.mimeType?.startsWith('image/');
                            const isExpired = att.expired;
                            
                            if (isExpired) {
                              return (
                                <View key={attIdx} style={styles.expiredAttachment}>
                                  <Ionicons name="lock-closed" size={16} color="#94A3B8" />
                                  <Text style={styles.expiredText}>File Expired (7d Policy)</Text>
                                </View>
                              );
                            }

                            if (isImage) {
                              return (
                                <TouchableOpacity 
                                  key={attIdx} 
                                  onPress={() => window.open(att.url, '_blank')}
                                  style={styles.imageAttachmentContainer}
                                >
                                  <View style={styles.imagePlaceholder}>
                                    {/* Web image rendering */}
                                    {isWeb ? (
                                      <img src={att.url} style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }} alt={att.filename} />
                                    ) : (
                                      <Ionicons name="image" size={24} color="#94A3B8" />
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            }

                            return (
                              <TouchableOpacity 
                                key={attIdx} 
                                onPress={() => window.open(att.url, '_blank')}
                                style={styles.fileAttachmentChip}
                              >
                                <Ionicons name="document-attach" size={20} color={isMe ? "#FFF" : "#6366F1"} />
                                <View style={{ marginLeft: 8, flex: 1 }}>
                                  <Text style={[styles.fileName, isMe && { color: '#FFF' }]} numberOfLines={1}>{att.filename}</Text>
                                  <Text style={[styles.fileSize, isMe && { color: 'rgba(255,255,255,0.7)' }]}>{(att.size / 1024).toFixed(1)} KB</Text>
                                </View>
                                <Ionicons name="download-outline" size={16} color={isMe ? "rgba(255,255,255,0.7)" : "#94A3B8"} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* 😄 [REACTION_CHIPS] (v2.6.410): Added Long-Press Tooltips */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <View style={styles.reactionRow}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <TouchableOpacity 
                              key={emoji} 
                              style={styles.reactionChip}
                              onPress={() => toggleReaction(msg._id, emoji)}
                              onLongPress={() => {
                                const reactorNames = users.map(uid => {
                                    if (uid === user.id) return 'You';
                                    return contacts.find(c => c.id === uid)?.name || 'Unknown User';
                                }).join(', ');
                                alert(`${emoji} reacted by:\n${reactorNames}`);
                              }}
                            >
                              <Text style={{ fontSize: 12 }}>{emoji}</Text>
                              <Text style={styles.reactionCount}>{users.length}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <Text style={[styles.msgTimestamp, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>

                      {/* 🛠️ [MESSAGE_TOOLBAR] (v2.6.411) */}
                      {(hoveredMessageId === (msg._id || msg.id) || activeMenuId === (msg._id || msg.id)) && (
                        <View style={[styles.msgToolbar, isMe ? styles.msgToolbarMe : styles.msgToolbarOther]}>
                          <View style={styles.emojiStrip}>
                            {['👍', '❤️', '😂', '😮'].map(e => (
                              <TouchableOpacity key={e} onPress={() => toggleReaction(msg._id || msg.id, e)} style={styles.emojiBtn}>
                                <Text style={styles.emojiBtnText}>{e}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TouchableOpacity 
                            style={styles.moreBtn} 
                            onPress={() => setActiveMenuId(activeMenuId === (msg._id || msg.id) ? null : (msg._id || msg.id))}
                          >
                            <Ionicons name="ellipsis-horizontal" size={16} color="#64748B" />
                          </TouchableOpacity>
                          
                          {activeMenuId === (msg._id || msg.id) && (
                            <View style={[styles.actionsDropdown, isMe ? styles.actionsDropdownMe : styles.actionsDropdownOther]}>
                              <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyTo(msg); setActiveMenuId(null); }}>
                                <Ionicons name="return-up-back" size={16} color="#475569" />
                                <Text style={styles.actionItemText}>Reply with quote</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.actionItem} onPress={() => { alert('Forwarding feature coming soon'); setActiveMenuId(null); }}>
                                <Ionicons name="arrow-redo" size={16} color="#475569" />
                                <Text style={styles.actionItemText}>Forward</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.actionItem, { borderBottomWidth: 0 }]} onPress={() => { deleteMessage(msg._id || msg.id); setActiveMenuId(null); }}>
                                <Ionicons name="trash" size={16} color="#EF4444" />
                                <Text style={[styles.actionItemText, { color: '#EF4444' }]}>Delete</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* 💬 [REPLY_PREVIEW] (v2.6.405) */}
        {replyTo && (
          <View style={styles.replyPreviewBar}>
            <View style={styles.replyPreviewIndicator} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>Replying to {replyTo.senderName}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyTo.content || (replyTo.attachments?.length ? '[Attachment]' : '')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyPreviewClose}>
              <Ionicons name="close-circle" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* 📎 [ATTACHMENT_PREVIEW] (v2.6.395) */}
        {pendingAttachments.length > 0 && (
          <View style={styles.pendingAttachmentsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {pendingAttachments.map((att, idx) => (
                <View key={idx} style={styles.pendingAttachmentChip}>
                  <Ionicons 
                    name={att.mimeType?.startsWith('image/') ? "image" : "document"} 
                    size={16} 
                    color="#6366F1" 
                  />
                  <Text style={styles.pendingAttachmentText} numberOfLines={1}>{att.filename}</Text>
                  <TouchableOpacity onPress={() => removeAttachment(att.publicId)}>
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputArea}>
          {isWeb && (
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileSelect}
            />
          )}
          
          <TouchableOpacity 
            style={styles.attachBtn} 
            onPress={() => isWeb ? fileInputRef.current?.click() : handleFileSelect()}
            disabled={uploadingFile}
          >
            {uploadingFile ? (
              <ActivityIndicator size="small" color="#6366F1" />
            ) : (
              <Ionicons name="attach" size={24} color="#64748B" />
            )}
          </TouchableOpacity>
          
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
            style={[styles.sendBtn, (!msgText.trim() && pendingAttachments.length === 0) && styles.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={!msgText.trim() && pendingAttachments.length === 0}
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
  
  // ─── Attachments Styles ───────────
  attachBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  pendingAttachmentsBar: {
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 10,
  },
  pendingAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pendingAttachmentText: { fontSize: 12, color: '#334155', marginHorizontal: 6, maxWidth: 120 },
  attachmentContainer: { marginTop: 8, gap: 6 },
  imageAttachmentContainer: { width: '100%', marginBottom: 4 },
  imagePlaceholder: { width: '100%', backgroundColor: '#F1F5F9', borderRadius: 8, overflow: 'hidden' },
  fileAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  fileName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  fileSize: { fontSize: 11, color: '#64748B', marginTop: 2 },
  expiredAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    opacity: 0.8,
  },
  expiredText: { fontSize: 12, color: '#94A3B8', marginLeft: 8, fontWeight: '500' },

  // ─── Interaction Styles (v2.6.405) ───────────
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  reactionChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center' },
  reactionCount: { fontSize: 10, color: '#64748B', marginLeft: 4, fontWeight: '700' },
  msgToolbar: { position: 'absolute', top: -40, flexDirection: 'row', backgroundColor: '#FFF', padding: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 100 },
  msgToolbarMe: { right: 0 },
  msgToolbarOther: { left: 0 },
  emojiStrip: { flexDirection: 'row', borderRightWidth: 1, borderRightColor: '#F1F5F9', paddingRight: 4 },
  emojiBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  emojiBtnText: { fontSize: 16 },
  moreBtn: { paddingHorizontal: 10, justifyContent: 'center' },
  actionsDropdown: { position: 'absolute', top: 44, right: 0, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', width: 160, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, zIndex: 1000, overflow: 'hidden' },
  actionsDropdownMe: { right: 0 },
  actionsDropdownOther: { left: 0 },
  actionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  actionItemText: { fontSize: 13, marginLeft: 10, color: '#475569', fontWeight: '500' },
  replyQuote: { padding: 8, borderRadius: 8, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#6366F1', backgroundColor: 'rgba(0,0,0,0.03)' },
  replyQuoteMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: '#FFF' },
  replyQuoteOther: { backgroundColor: 'rgba(0,0,0,0.03)' },
  replyQuoteText: { fontSize: 12, fontStyle: 'italic', color: '#64748B' },
  replyPreviewBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  replyPreviewIndicator: { width: 4, height: '100%', backgroundColor: '#6366F1', borderRadius: 2 },
  replyPreviewContent: { flex: 1, marginLeft: 12 },
  replyPreviewName: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  replyPreviewText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  replyPreviewClose: { padding: 4 },
});

export default OrgChatScreen;
