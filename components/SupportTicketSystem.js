import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { generateAIResponse } from '../services/aiService';

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
  userId, userName, tickets = [], onCreateTicket, onSendMessage, 
  onTypingStart, onTypingStop, onResolvePrompt, onToggleSupport,
  onUpdateStatus, onReply, onRetryMessage, onMarkSeen
}) => {
  const [view, setView] = useState('list');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [listTab, setListTab] = useState('Open'); // 'Open' or 'Closed'

  const [formData, setFormData] = useState({
    type: 'Other',
    title: '',
    description: ''
  });
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureReason, setClosureReason] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [chatSearchText, setChatSearchText] = useState('');
  const [searchMatchIndices, setSearchMatchIndices] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const scrollViewRef = useRef(null);
  const textInputRef = useRef(null);
  const messageYOffsets = useRef({}); // 📍 Track message coordinates (v2.6.27)

  // 🛡️ [Tick System] Mark as 'Seen' when ticket is opened (v2.6.28)
  useEffect(() => {
    if (selectedTicket && selectedTicket.id) {
      onMarkSeen?.(selectedTicket.id);
    }
  }, [selectedTicket?.id]);

  const myTickets = (tickets || []).filter(t => t.userId === userId);

  useEffect(() => {
    if (onToggleSupport) onToggleSupport(true);
    return () => { if (onToggleSupport) onToggleSupport(false); };
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  // 📜 Auto-scroll on Open/Update (v2.6.25)
  useEffect(() => {
    if (view === 'detail' && selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
      setTimeout(() => {
        if (!isSearchingChat) scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [view, selectedTicket?.messages?.length]);

  // 🔍 Conversational Search Logic (v2.6.34)
  useEffect(() => {
    if (chatSearchText.trim() && selectedTicket?.messages) {
      const q = chatSearchText.toLowerCase();
      const matches = [];
      selectedTicket.messages.forEach((msg, idx) => {
        if ((msg.text || '').toLowerCase().includes(q)) {
           matches.push(idx);
        }
      });
      setSearchMatchIndices(matches);
      setActiveMatchIndex(0);
      
      // Auto-jump to first match
      if (matches.length > 0) {
        setTimeout(() => jumpToMatch(0, matches), 100);
      }
    } else {
      setSearchMatchIndices([]);
      setActiveMatchIndex(0);
    }
  }, [chatSearchText, selectedTicket?.id]);

  const jumpToMatch = (idx, matchesOverride = null) => {
    const matches = matchesOverride || searchMatchIndices;
    if (matches.length === 0) return;
    const msgIdx = matches[idx];
    const msg = selectedTicket.messages[msgIdx];
    const targetY = messageYOffsets.current[msg.id || msg.timestamp];
    if (targetY !== undefined) {
      scrollViewRef.current?.scrollTo({ y: targetY - 50, animated: true });
    }
  };

  const handleNextMatch = () => {
    if (searchMatchIndices.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchMatchIndices.length;
    setActiveMatchIndex(nextIdx);
    jumpToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (searchMatchIndices.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + searchMatchIndices.length) % searchMatchIndices.length;
    setActiveMatchIndex(prevIdx);
    jumpToMatch(prevIdx);
  };

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
      messages: [
        {
          senderId: userId,
          text: formData.description,
          timestamp: new Date().toISOString()
        },
        {
          senderId: 'admin',
          text: "Thanks for reaching out to AceTrack Support Team, Our team will look into the issue and provide an update shortly",
          timestamp: new Date(Date.now() + 1000).toISOString(),
          status: 'delivered'
        }
      ]
    });
    setFormData({ type: 'Other', title: '', description: '' });
    setView('list');
  };

  const handleSendMessage = () => {
    if ((!newMessage.trim() && !selectedImage) || !selectedTicket) return;
    onSendMessage(selectedTicket.id, newMessage, selectedImage, replyToMsg);
    setNewMessage('');
    setSelectedImage(null);
    setReplyToMsg(null);
  };

  const renderMessageReply = (reply) => {
    if (!reply) return null;
    const targetY = messageYOffsets.current[reply.id || reply.timestamp];
    
    return (
      <TouchableOpacity 
        style={styles.msgReplyPreview}
        onPress={() => {
          if (targetY !== undefined) {
            scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.msgReplyUser}>{reply.senderId === userId ? 'You' : 'Admin'}</Text>
        <Text style={styles.msgReplyText} numberOfLines={1}>{reply.text}</Text>
      </TouchableOpacity>
    );
  };

  const renderMessage = (msg, index) => {
    // Resilient data extraction
    let text = msg?.text ?? msg?.message ?? (typeof msg === 'string' ? msg : null);
    if (text === null || text === '') {
      text = msg?.image ? '' : 'Empty message';
    }
    const timestamp = msg?.timestamp || new Date().toISOString();
    const senderId = msg?.senderId || userId;
    const isMe = String(senderId) === String(userId);
    
    // 🛡️ Format internal system/event messages for the user
    if (msg.type === 'event' || senderId === 'system') {
      return (
        <View 
          key={msg.id || msg.timestamp || index} 
          style={styles.eventCard}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.eventText}>{text}</Text>
        </View>
      );
    }

    if (msg.type === 'prompt') {
      return (
        <View 
          key={msg.id || msg.timestamp || index} 
          style={styles.promptCard}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.promptText}>{msg.text}</Text>
          <View style={styles.promptActions}>
            <TouchableOpacity onPress={() => onResolvePrompt(selectedTicket.id, 'Yes')} style={styles.promptBtnYes}>
              <Text style={styles.promptBtnText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onResolvePrompt(selectedTicket.id, 'No')} style={styles.promptBtnNo}>
              <Text style={styles.promptBtnText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (msg.type === 'restart') {
      return (
        <View 
          key={msg.id || msg.timestamp || index} 
          style={styles.systemNote}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.systemNoteText}>{msg.text}</Text>
          <TouchableOpacity onPress={() => setView('create')} style={styles.restartBtn}>
            <Text style={styles.restartBtnText}>Restart Chat</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const renderRightActions = () => (
      <View style={styles.swipeToReplyAction}>
        <Ionicons name="arrow-undo" size={20} color="#64748B" />
      </View>
    );

    return (
      <View 
        key={msg.id || msg.timestamp || index} 
        onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
      >
        <Swipeable
          renderRightActions={isMe ? renderRightActions : undefined}
          renderLeftActions={!isMe ? renderRightActions : undefined}
          onSwipeableOpen={() => {
            setReplyToMsg(msg);
            // 🛡️ Auto-focus and scroll to bottom on reply (v2.6.25)
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
              textInputRef.current?.focus();
            }, 100);
          }}
        >
          <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
            {!isMe && <Text style={styles.adminLabel}>Admin Support</Text>}
            {renderMessageReply(msg.replyTo)}
            {msg.image && (
              <Image source={{ uri: msg.image }} style={styles.msgImage} resizeMode="contain" />
            )}
            <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
              {text?.startsWith('CLOSURE_REQUEST_EVENT:') 
                ? `Requested Closure: ${text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
                : text}
            </Text>
            <View style={styles.msgFooter}>
              <Text style={styles.timestamp}>
                {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {isMe && (
                <View style={styles.statusContainer}>
                  {msg.status === 'pending' ? (
                    <TouchableOpacity onPress={() => onRetryMessage?.(selectedTicket.id, msg.id)}>
                      <Ionicons name="alert-circle" size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons 
                      name={['delivered', 'seen'].includes(msg.status) ? "checkmark-done" : "checkmark"} 
                      size={12} 
                      color={msg.status === 'seen' ? "#3B82F6" : (msg.status === 'delivered' ? "#10B981" : "#94A3B8")} 
                      style={{ marginLeft: 4, opacity: msg.status === 'pending' ? 0.3 : 1 }} 
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        </Swipeable>
      </View>
    );
  };

  const handleUserClosure = async () => {
    if (!selectedTicket) return;
    setIsClosing(true);
    
    try {
      // 📝 1. Post the closure message with a neutral identifier
      if (closureReason.trim()) {
        onReply(selectedTicket.id, `CLOSURE_REQUEST_EVENT: ${closureReason.trim()}`);
      }

      // 🤖 2. Generate AI Summary (same logic as admin)
      const history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : (m.senderId === userId ? 'User' : 'Other')}: ${m.text || ''}`
      ).join('\n');

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it into exactly 3 concise sentences. 1) The original issue. 2) The actions taken. 3) The resolution summary. Be clear and objective." },
        { role: 'user', text: `History:\n${history}\n\nClient Resolution Message: ${closureReason.trim() || 'No additional details'}` }
      ];

      const aiSummary = await generateAIResponse(prompt);
      
      // 🏁 3. Finish Closure
      onUpdateStatus(selectedTicket.id, 'Closed', aiSummary);
      setShowClosureModal(false);
      setClosureReason('');
    } catch (e) {
      console.error("User-initiated closure failed:", e);
      // Fallback: simple closure without summary if AI fails
      onUpdateStatus(selectedTicket.id, 'Closed');
    } finally {
      setIsClosing(false);
    }
  };

  const handleReopen = () => {
    if (!selectedTicket) return;
    onUpdateStatus(selectedTicket.id, 'In Progress');
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

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            onPress={() => setListTab('Open')}
            style={[styles.tabBtn, listTab === 'Open' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, listTab === 'Open' && styles.tabBtnTextActive]}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setListTab('Closed')}
            style={[styles.tabBtn, listTab === 'Closed' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, listTab === 'Closed' && styles.tabBtnTextActive]}>Resolved/Closed</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {(() => {
            const openStatuses = ['Open', 'In Progress', 'Awaiting Response'];
            const filtered = myTickets.filter(t => {
              const status = t.status || 'Open';
              return listTab === 'Open' 
                ? openStatuses.includes(status)
                : (status === 'Resolved' || status === 'Closed');
            });

            if (filtered.length === 0) {
              return (
                <View style={styles.emptyContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={48} color="#E2E8F0" />
                  <Text style={styles.emptyTitle}>No {listTab === 'Open' ? 'open' : 'resolved'} tickets</Text>
                  <Text style={styles.emptySubtitle}>
                    {listTab === 'Open' ? 'When you need help, your active tickets will appear here.' : 'Your resolved or history tickets will appear here.'}
                  </Text>
                </View>
              );
            }

            return filtered
              .sort((a, b) => {
                const aMsgs = (a.messages || []);
                const bMsgs = (b.messages || []);
                const aLast = aMsgs[aMsgs.length - 1];
                const bLast = bMsgs[bMsgs.length - 1];
                
                // 🛡️ [v2.6.35] UNREAD LOGIC: Last message from admin && NOT seen
                const aUnread = aLast && aLast.senderId !== userId && aLast.senderId !== 'system' && aLast.status !== 'seen';
                const bUnread = bLast && bLast.senderId !== userId && bLast.senderId !== 'system' && bLast.status !== 'seen';
                
                if (aUnread && !bUnread) return -1;
                if (!aUnread && bUnread) return 1;
                
                // Secondary sort: newest first
                const timeA = new Date(a.updatedAt || a.createdAt).getTime();
                const timeB = new Date(b.updatedAt || b.createdAt).getTime();
                return timeB - timeA;
              })
              .map(ticket => {
                const lastMessage = ticket.messages?.[ticket.messages.length - 1];
                const isSystem = lastMessage?.senderId === 'system';
                const isAdminReply = lastMessage && !isSystem && lastMessage.senderId !== userId;
                const hasUnread = isAdminReply && lastMessage.status !== 'seen';
                const st = statusColors[ticket.status || 'Open'] || statusColors['Open'];

                return (
                  <TouchableOpacity
                    key={ticket.id}
                    onPress={() => { setSelectedTicket(ticket); setView('detail'); }}
                    style={[styles.ticketCard, hasUnread && styles.ticketCardUnread]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={styles.ticketDatePrefix}>
                        Date:- {new Date(ticket.createdAt).toLocaleDateString()}
                      </Text>
                      <Text style={[styles.ticketDatePrefix, { fontWeight: '900', color: '#0F172A' }]}>
                        ID: {ticket.id}
                      </Text>
                    </View>
                    
                    <View style={styles.ticketCardMainRow}>
                      <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                        <Text style={[styles.statusBadgeText, { color: st.text }]}>{ticket.status || 'Open'}</Text>
                      </View>
                    </View>

                    <Text style={styles.ticketTypeParens}>({ticket.type})</Text>

                    {lastMessage && (
                      <View style={styles.lastMessageContainer}>
                        <Text style={styles.lastMessage} numberOfLines={1}>
                          {isSystem ? '' : (isAdminReply ? '🔴 Admin: ' : 'You: ')}
                          {lastMessage.text?.startsWith('CLOSURE_REQUEST_EVENT:') 
                            ? `Requested Closure: ${lastMessage.text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
                            : lastMessage.text}
                        </Text>
                      </View>
                    )}

                    {hasUnread && (
                      <View style={styles.unreadTag}>
                        <View style={styles.unreadDot} />
                        <Text style={styles.unreadText}>New Reply</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              });
          })()}
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
                    onPress={() => setShowTypePicker(true)}
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

        <Modal transparent visible={showTypePicker} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Select Issue Type</Text>
                        <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        {TICKET_TYPES.map((type) => (
                            <TouchableOpacity 
                                key={type} 
                                onPress={() => {
                                    setFormData(p => ({ ...p, type }));
                                    setShowTypePicker(false);
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, formData.type === type && styles.pickerItemTextActive]}>{type}</Text>
                                {formData.type === type && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
      </View>
    );
  }

  if (view === 'detail' && selectedTicket) {
    const isClosed = selectedTicket.status === 'Closed' || selectedTicket.status === 'Resolved';
    const st = statusColors[selectedTicket.status] || statusColors['Open'];

    const canReopen = (() => {
        if (!selectedTicket.closedAt) return false;
        const diff = Date.now() - new Date(selectedTicket.closedAt).getTime();
        return diff < (3 * 24 * 60 * 60 * 1000); // 3 days
    })();

    const renderDateHeader = (dateStr) => {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (date.toDateString() === today.toDateString()) label = 'Today';
      else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';

      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{label}</Text>
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <TouchableOpacity 
                   onPress={() => { 
                      setView('list'); 
                      setSelectedTicket(null); 
                      setIsSearchingChat(false);
                      setChatSearchText('');
                   }} 
                   style={styles.backBtn}
                >
                    <Ionicons name="arrow-back" size={20} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    {isSearchingChat ? (
                      <View style={styles.headerSearchRow}>
                         <TextInput
                            style={styles.headerSearchInput}
                            placeholder="Search messages..."
                            value={chatSearchText}
                            onChangeText={setChatSearchText}
                            autoFocus
                         />
                         {searchMatchIndices.length > 0 && (
                           <View style={styles.headerSearchNav}>
                             <Text style={styles.matchCount}>{activeMatchIndex + 1}/{searchMatchIndices.length}</Text>
                             <View style={styles.navArrows}>
                               <TouchableOpacity onPress={handlePrevMatch} style={styles.navArrowBtn}>
                                 <Ionicons name="chevron-up" size={16} color="#64748B" />
                               </TouchableOpacity>
                               <TouchableOpacity onPress={handleNextMatch} style={styles.navArrowBtn}>
                                 <Ionicons name="chevron-down" size={16} color="#64748B" />
                               </TouchableOpacity>
                             </View>
                           </View>
                         )}
                      </View>
                    ) : (
                      <>
                        <Text style={styles.ticketTitleDetail} numberOfLines={1}>{selectedTicket.title}</Text>
                        <View style={{ marginTop: 2 }}>
                            <Text style={styles.typeTag}>{selectedTicket.type}</Text>
                            <Text style={[styles.typeTag, { fontSize: 8, color: '#94A3B8', marginTop: 1 }]}>ID: {selectedTicket.id}</Text>
                        </View>
                      </>
                    )}
                </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity 
                  onPress={() => {
                    setIsSearchingChat(!isSearchingChat);
                    if (isSearchingChat) setChatSearchText('');
                  }}
                  style={styles.headerSearchBtn}
                >
                  <Ionicons name={isSearchingChat ? "close-circle" : "search-outline"} size={20} color={isSearchingChat ? "#EF4444" : "#64748B"} />
                </TouchableOpacity>
                
                {!isSearchingChat && (
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
                      <View style={styles.statusBadgeUnified}>
                          <Text style={[styles.statusBadgeTextUnified, { color: st.text }]}>{selectedTicket.status}</Text>
                      </View>
                      {!isClosed && (
                          <TouchableOpacity onPress={() => setShowClosureModal(true)} style={styles.reqCloseBtnUnified}>
                              <Text style={styles.reqCloseBtnText}>Request Closure</Text>
                          </TouchableOpacity>
                      )}
                  </View>
                )}
            </View>
        </View>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          style={styles.flex}
        >
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatArea} 
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {selectedTicket.closureSummary && (
              <View style={styles.resolutionCard}>
                <View style={styles.resHeader}>
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
                  <Text style={styles.resTitle}>Closure Summary</Text>
                </View>
                <Text style={styles.resText}>{selectedTicket.closureSummary}</Text>
              </View>
            )}
            
            {(selectedTicket.messages || []).map((msg, idx) => {
              const currentMsgDate = new Date(msg.timestamp).toDateString();
              const prevMsgDate = idx > 0 ? new Date(selectedTicket.messages[idx-1].timestamp).toDateString() : null;
              const showDateHeader = currentMsgDate !== prevMsgDate;
              const isHighlighted = searchMatchIndices[activeMatchIndex] === idx;

              return (
                <View 
                   key={idx} 
                   style={isHighlighted && styles.highlightedMessage}
                   onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
                >
                  {showDateHeader && !chatSearchText && renderDateHeader(msg.timestamp)}
                  {renderMessage(msg, idx)}
                </View>
              );
            })}
            
            {isAdminTyping && (
              <View style={styles.typingIndicator}>
                <Text style={styles.typingText}>Admin is typing...</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputArea}>
            {replyToMsg && (
              <View style={styles.replyPreviewBar}>
                <View style={styles.replyPreviewInner}>
                  <Text style={styles.replyPreviewUser}>Replying to {replyToMsg.senderId === userId ? 'yourself' : 'Admin'}</Text>
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
                  ref={textInputRef}
                  value={newMessage}
                  onChangeText={(txt) => {
                    setNewMessage(txt);
                    if (txt.length > 0) onTypingStart?.(selectedTicket.id);
                    else onTypingStop?.(selectedTicket.id);
                  }}
                  onBlur={() => onTypingStop?.(selectedTicket.id)}
                  placeholder="Type your message..."
                  style={styles.chatInput}
                  multiline
                />
                <TouchableOpacity 
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim() && !selectedImage}
                  style={[styles.sendBtn, (!newMessage.trim() && !selectedImage) && styles.sendBtnDisabled]}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.closedNote}>
                <Text style={styles.closedNoteText}>
                    {canReopen 
                        ? "This Ticket is Closed" 
                        : "This Ticket is Closed and cannot be reopened"}
                </Text>
                {canReopen && (
                    <TouchableOpacity onPress={handleReopen} style={styles.reopenButtonBox}>
                        <Text style={styles.reopenButtonText}>Reopen</Text>
                    </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

        <Modal transparent visible={showClosureModal} animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.closureBox}>
                    <View style={styles.confirmIcon}>
                        <Ionicons name="checkmark-done-circle" size={32} color="#16A34A" />
                    </View>
                    <Text style={styles.confirmTitle}>Request Closure</Text>
                    <Text style={styles.confirmSub}>If your issue is resolved, providing a brief detail helps us improve!</Text>
                    
                    <TextInput
                        value={closureReason}
                        onChangeText={setClosureReason}
                        placeholder="Resolution details (optional)..."
                        style={styles.closureInput}
                        multiline
                        numberOfLines={3}
                    />

                    <View style={styles.confirmActions}>
                        <TouchableOpacity 
                           onPress={() => {
                             setShowClosureModal(false);
                             setClosureReason('');
                           }} 
                           style={styles.confirmNo}
                        >
                            <Text style={styles.confirmNoText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                           onPress={handleUserClosure} 
                           disabled={isClosing}
                           style={[styles.confirmYes, { backgroundColor: '#16A34A' }]}
                        >
                            {isClosing ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.confirmYesText}>Submit & Close</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
      </View>
    );
  }

  return null;
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#EF4444',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabBtnTextActive: {
    color: '#EF4444',
  },
  eventCard: {
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  eventText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  dateHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  dateHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    textTransform: 'uppercase',
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
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  ticketCardUnread: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  ticketDatePrefix: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
  },
  ticketCardMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticketTypeParens: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 12,
  },
  lastMessageContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketInfo: {
    flex: 1,
    gap: 4,
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  ticketMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMsg: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
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
  chatArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  chatContent: {
    padding: 20,
    gap: 12,
    paddingBottom: 40,
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
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  myText: {
    color: '#FFFFFF',
  },
  otherText: {
    color: '#0F172A',
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
    marginLeft: 16,
  },
  typingText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
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
  plusBtn: {
    paddingHorizontal: 8,
  },
  plusMenu: {
    position: 'absolute',
    bottom: 50,
    left: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 100,
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
  promptCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    alignItems: 'center',
  },
  promptText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A3412',
    textAlign: 'center',
    marginBottom: 12,
  },
  promptActions: {
    flexDirection: 'row',
    gap: 12,
  },
  promptBtnYes: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  promptBtnNo: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  promptBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  systemNote: {
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 32,
  },
  systemNoteText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 8,
  },
  restartBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  restartBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
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
    color: '#94A3B8',
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
    padding: 24,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  closedNoteText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    padding: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  pickerList: {
    marginBottom: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#475569',
  },
  pickerItemTextActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  resolutionCard: {
    backgroundColor: '#ECFDF5',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  resHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  resTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
    textTransform: 'uppercase',
  },
  resText: {
    fontSize: 13,
    color: '#064E3B',
    lineHeight: 20,
    fontWeight: '500',
  },
  reopenButtonBox: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  reopenButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  statusBadgeUnified: {
    width: 100,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  reqCloseBtnUnified: {
    width: 100,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeTextUnified: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  highlightedMessage: {
    backgroundColor: '#FEF9C3',
    borderRadius: 12,
  },
  headerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerSearchInput: {
    flex: 1,
    height: 32,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerSearchNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 4,
  },
  matchCount: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    minWidth: 28,
    textAlign: 'center',
  },
  navArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 2,
  },
  navArrowBtn: {
    padding: 2,
  },
  headerSearchBtn: {
    padding: 6,
  },
  reqCloseBtnText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  closedNote: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  closedNoteText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  closureBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    maxWidth: 340,
    alignItems: 'center',
    marginBottom: 40, // offset for keyboard
  },
  closureInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    width: '100%',
    height: 80,
    textAlignVertical: 'top',
    marginVertical: 16,
  },
  confirmNo: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  confirmNoText: {
    color: '#64748B',
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  confirmYes: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  confirmYesText: {
    color: '#FFFFFF',
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  confirmSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
