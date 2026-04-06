import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { generateAIResponse } from '../services/aiService';

const statusColors = {
  'Open': { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  'In Progress': { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA', border: '#F3E8FF' },
  'Resolved': { bg: '#F0FDF4', text: '#16A34A', border: '#DCFCE7' },
  'Closed': { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' },
};

const statusOptions = ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'];

export const AdminGrievancesPanel = ({
  tickets, players, onReply, onUpdateStatus, onTypingStart, onTypingStop, search
}) => {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenJustification, setReopenJustification] = useState('');
  const [pendingReopenStatus, setPendingReopenStatus] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const scrollViewRef = useRef(null);
  const textInputRef = useRef(null);
  const messageYOffsets = useRef({}); // 📍 Track message coordinates (v2.6.27)

  // 📜 Auto-scroll on Open/Update (v2.6.26)
  useEffect(() => {
    if (selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
      // 🛡️ Staged scroll for Android robustness: immediate + slight delay
      scrollViewRef.current.scrollToEnd({ animated: false });
      
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200); // Increased delay for Android layout stability

      return () => clearTimeout(timer);
    }
  }, [selectedTicket?.id, selectedTicket?.messages?.length]);

  useEffect(() => {
    if (selectedTicket) {
      const updated = (tickets || []).find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  const handleStatusChangeRequest = (status) => {
    // ⚡ Resolved -> Closed shortcut: bypassing confirmation if it's already resolved.
    if (selectedTicket?.status === 'Resolved' && status === 'Closed') {
      onUpdateStatus(selectedTicket.id, status);
      return;
    }

    // 🛡️ Justification Prompt: Moving from Resolved back to Active status
    const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
    if (selectedTicket?.status === 'Resolved' && activeStates.includes(status)) {
      setPendingReopenStatus(status);
      setShowReopenModal(true);
      return;
    }

    if (status === 'Resolved' || status === 'Closed') {
      setPendingStatus(status);
      setShowStatusConfirm(true);
    } else {
      onUpdateStatus(selectedTicket.id, status);
    }
  };

  const handleReopenSubmit = () => {
    if (!reopenJustification.trim()) {
      alert("Please provide a justification for reopening this ticket.");
      return;
    }
    onUpdateStatus(selectedTicket.id, pendingReopenStatus);
    onReply(selectedTicket.id, `REOPEN JUSTIFICATION: ${reopenJustification.trim()}`);
    
    setShowReopenModal(false);
    setReopenJustification('');
    setPendingReopenStatus(null);
  };

  const processStatusConfirmation = async (confirmed) => {
    if (!selectedTicket || !pendingStatus) {
      setShowStatusConfirm(false);
      setPendingStatus(null);
      return;
    }

    if (!confirmed) {
      setShowStatusConfirm(false);
      setPendingStatus(null);
      return;
    }

    setShowStatusConfirm(false);
    setIsGeneratingSummary(true);

    try {
      // 🤖 Analysis Prompt for Groq: Extract issue, troubleshooting, and fix.
      const history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : (players.find(p => p.id === m.senderId)?.name || 'User')}: ${m.text || ''}`
      ).join('\n');

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it into exactly 3 concise sentences. 1) The original issue. 2) The troubleshooting steps taken. 3) The final fix/resolution. Be clear and objective." },
        { role: 'user', text: `History:\n${history}` }
      ];

      const aiSummary = await generateAIResponse(prompt);
      onUpdateStatus(selectedTicket.id, pendingStatus, aiSummary);
    } catch (e) {
      console.error("AI Resolution Summary Failed:", e);
      // Fallback: resolution without summary
      onUpdateStatus(selectedTicket.id, pendingStatus);
    } finally {
      setIsGeneratingSummary(false);
      setPendingStatus(null);
    }
  };

  const getUserName = (userId) => (players || []).find(pl => pl.id === userId)?.name || userId;
  const getUserRole = (userId) => (players || []).find(pl => pl.id === userId)?.role || 'user';

  const filteredTickets = (tickets || [])
    .filter(t => {
      const status = t?.status || 'Open';
      return filterStatus === 'All' || status === filterStatus;
    })
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      const userName = (getUserName(t.userId) || '').toLowerCase();
      const userId = (String(t.userId || '')).toLowerCase();
      const title = (t.title || '').toLowerCase();
      const tid = (String(t.id || '')).toLowerCase();
      
      // 💬 Deep Search: Check all messages in the conversation
      const conversation = (t.messages || []).some(m => (m.text || '').toLowerCase().includes(q));
      
      return title.includes(q) || tid.includes(q) || userName.includes(q) || userId.includes(q) || conversation;
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
        <Text style={styles.msgReplyUser}>{reply.senderId === 'admin' ? 'Admin' : getUserName(reply.senderId)}</Text>
        <Text style={styles.msgReplyText} numberOfLines={1}>{reply.text}</Text>
      </TouchableOpacity>
    );
  };

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

  const renderMessage = (msg, index) => {
    // Resilient data extraction
    const text = msg?.text || msg?.message || (typeof msg === 'string' ? msg : 'Empty message');
    const timestamp = msg?.timestamp || new Date().toISOString();
    const legacySender = selectedTicket?.userId || 'user';
    const senderId = msg?.senderId || legacySender;
    const isMe = senderId === 'admin';
    const senderName = isMe ? 'Admin Support' : getUserName(senderId);

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
          {renderMessageReply(msg.replyTo)}
          {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
          {msg.image && (
            <Image source={{ uri: msg.image }} style={styles.msgImage} resizeMode="contain" />
          )}
          <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
            {text?.startsWith('CLOSURE_REQUEST_EVENT:') 
              ? `User requested closure: ${text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
              : text}
          </Text>
          <Text style={styles.timestamp}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </Swipeable>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      {selectedTicket ? (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>{selectedTicket.title}</Text>
              <Text style={styles.headerId}>ID: {selectedTicket.id}</Text>
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
                    <View style={[styles.roleBadge, getUserRole(selectedTicket.userId) === 'academy' ? styles.roleAcademy : styles.roleCoach]}>
                      <Text style={styles.roleText}>{getUserRole(selectedTicket.userId)}</Text>
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
                        onPress={() => handleStatusChangeRequest(s)}
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

            {selectedTicket.closureSummary && (
              <View style={styles.resolutionCard}>
                <View style={styles.resHeader}>
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
                  <Text style={styles.resTitle}>Closure Summary</Text>
                </View>
                <Text style={styles.resText}>{selectedTicket.closureSummary}</Text>
              </View>
            )}

            <View style={styles.chatContainer}>
              <ScrollView 
                ref={scrollViewRef} 
                style={styles.chatScroll} 
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              >
                {(selectedTicket?.messages || []).map((msg, index) => {
                  const currentMsgDate = new Date(msg.timestamp).toDateString();
                  const prevMsgDate = index > 0 ? new Date(selectedTicket.messages[index-1].timestamp).toDateString() : null;
                  const showDateHeader = currentMsgDate !== prevMsgDate;

                  return (
                    <React.Fragment key={index}>
                      {showDateHeader && renderDateHeader(msg.timestamp)}
                      {renderMessage(msg, index)}
                    </React.Fragment>
                  );
                })}
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

                {selectedTicket.status !== 'Closed' && selectedTicket.status !== 'Resolved' ? (
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
                    <Text style={styles.closedNoteText}>This ticket is resolved/closed</Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: '#EFF6FF' }]}>
              <Text style={styles.statLabel}>Open</Text>
              <Text style={[styles.statValue, { color: '#2563EB' }]}>{(tickets || []).filter(t => t && (t.status === 'Open' || !t.status)).length}</Text>
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
            {(filteredTickets || []).map((ticket, idx) => {
              const status = ticket.status || 'Open';
              const st = statusColors[status] || statusColors['Open'];
              const date = ticket.createdAt ? new Date(ticket.createdAt) : null;
              return (
                <TouchableOpacity 
                  key={ticket.id || `temp-${idx}`} 
                  onPress={() => setSelectedTicket(ticket)}
                  style={styles.ticketCard}
                >
                  <View style={styles.ticketTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title || 'Untitled Ticket'}</Text>
                      <Text style={styles.ticketMeta}>{getUserName(ticket.userId)} • ID: {ticket.id || 'NO-ID'}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                      <Text style={[styles.statusBadgeText, { color: st.text }]}>{status}</Text>
                    </View>
                  </View>
                  <View style={styles.ticketBottom}>
                    <Text style={styles.ticketType}>{ticket.type || 'General'}</Text>
                    <Text style={styles.ticketDate}>{date && !isNaN(date) ? date.toLocaleDateString() : 'Invalid Date'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Resolution Confirmation Prompt */}
      {showStatusConfirm && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.confirmBox}>
              <View style={styles.confirmIcon}>
                <Ionicons name="help-circle" size={32} color="#2563EB" />
              </View>
              <Text style={styles.confirmTitle}>Issue Resolved?</Text>
              <Text style={styles.confirmSub}>ACE AI will automatically generate a closure summary from the conversation history.</Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity onPress={() => processStatusConfirmation(false)} style={styles.confirmNo}>
                  <Text style={styles.confirmNoText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => processStatusConfirmation(true)} style={styles.confirmYes}>
                  <Text style={styles.confirmYesText}>Yes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Reopen Justification Modal */}
      {showReopenModal && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.confirmBox}>
              <View style={styles.confirmIcon}>
                <Ionicons name="refresh-circle" size={32} color="#EF4444" />
              </View>
              <Text style={styles.confirmTitle}>Reopen Ticket?</Text>
              <Text style={styles.confirmSub}>Please provide a justification for moving this ticket back to {pendingReopenStatus?.toLowerCase()}.</Text>
              
              <TextInput
                value={reopenJustification}
                onChangeText={setReopenJustification}
                placeholder="Reason for reopening..."
                style={styles.reopenInput}
                multiline
                numberOfLines={3}
              />

              <View style={styles.confirmActions}>
                <TouchableOpacity 
                   onPress={() => {
                     setShowReopenModal(false);
                     setReopenJustification('');
                     setPendingReopenStatus(null);
                   }} 
                   style={styles.confirmNo}
                >
                  <Text style={styles.confirmNoText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleReopenSubmit} style={styles.confirmYes}>
                  <Text style={styles.confirmYesText}>Reopen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* AI Processing Overlay */}
      {isGeneratingSummary && (
        <Modal transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#2563EB" size="large" />
              <Text style={styles.loadingText}>ACE AI Analyzing Conversation...</Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  eventCard: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
  },
  eventText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
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
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
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
  reopenInput: {
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
  loadingBox: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  resolutionCard: {
    backgroundColor: '#ECFDF5',
    margin: 16,
    marginTop: 0,
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
});
