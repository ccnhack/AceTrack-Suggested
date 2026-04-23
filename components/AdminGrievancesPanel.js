import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { generateAIResponse } from '../services/aiService';
import notify from '../utils/notify';
import logger from '../utils/logger';
import { colors, shadows } from '../theme/designSystem';
import config from '../config';
import QueueManagementDashboard from './QueueManagementDashboard';

const statusColors = {
  'Open': { bg: '#EFF6FF', text: '#2563EB', border: '#DBEAFE' },
  'In Progress': { bg: '#FFFBEB', text: '#D97706', border: '#FEF3C7' },
  'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA', border: '#F3E8FF' },
  'Resolved': { bg: '#F0FDF4', text: '#16A34A', border: '#DCFCE7' },
  'Closed': { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' },
};

const statusOptions = ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'];
const getOrdinalSuffix = (day) => {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};
const formatTicketDateFull = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date)) return 'Invalid Date';
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const dayStr = day < 10 ? `0${day}` : `${day}`;
  return `${dayStr}${getOrdinalSuffix(day)} ${month}, ${year} ${hours}:${minutes}`;
};

export const AdminGrievancesPanel = ({
  tickets, players, onReply, onUpdateStatus, onReassignTicket, onTypingStart, onTypingStop, search, onRetryMessage, onMarkSeen, onDetailToggle, autoSelectUser, autoSelectTicketId, onConsumeTicketId, onConsumeAutoSelect, currentUser, setSeenAdminActionIds, ...restProps
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
  const [pendingStatus, setPendingStatus] = useState(null);
  const [pendingReopenStatus, setPendingReopenStatus] = useState(null);
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [chatSearchText, setChatSearchText] = useState('');
  const [searchMatchIndices, setSearchMatchIndices] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0); // 0-indexed internal, 1-indexed UI
  const [showQueueDashboard, setShowQueueDashboard] = useState(false);
  const scrollViewRef = useRef(null);
  const textInputRef = useRef(null);
  const messageYOffsets = useRef({}); // 📍 Track message coordinates (v2.6.27)
  const swipeableRefs = useRef({}); // 🛡️ Track swipeable instances for snap-back (v2.6.35)
  const [tempHighlightedId, setTempHighlightedId] = useState(null); // 🔦 Temporary highlight on jump
  const [showReassignModal, setShowReassignModal] = useState(false); // 🛡️ Searchable Reassign (v2.6.242)
  const [reassignSearch, setReassignSearch] = useState('');

  // 🛡️ [STABILITY] Sync local selectedTicket with updated props (v2.6.228)
  useEffect(() => {
    if (selectedTicket) {
      const updated = (tickets || []).find(t => t.id === selectedTicket.id || t._id === selectedTicket.id);
      if (updated) {
        // Only update if something meaningful changed (e.g. status, messages, assignedTo)
        const hasChanged = updated.status !== selectedTicket.status || 
                           updated.assignedTo !== selectedTicket.assignedTo ||
                           (updated.messages?.length !== selectedTicket.messages?.length);
        
        if (hasChanged) {
          console.log(`[AdminGrievancesPanel] [STABILITY] Syncing local selectedTicket: ${selectedTicket.id}`);
          setSelectedTicket(updated);
        }
      }
    }
  }, [tickets]);

  // 🛡️ [Tick System] Mark as 'Seen' when ticket is opened (v2.6.28 hardened)
  useEffect(() => {
    if (selectedTicket && selectedTicket.id) {
      onMarkSeen?.(selectedTicket.id);
      onDetailToggle?.(true); // Lock parent scroll

      // 🛡️ [SYNC v2.6.230]: Persistently clear from AdminContext seen IDs
      if (setSeenAdminActionIds && restProps.seenAdminActionIds) {
        const tid = String(selectedTicket.id);
        if (!restProps.seenAdminActionIds.has(tid)) {
          const next = new Set(restProps.seenAdminActionIds);
          next.add(tid);
          setSeenAdminActionIds(next);
        }
      }
    } else {
      onDetailToggle?.(false); // Unlock parent scroll
    }
  }, [selectedTicket?.id, selectedTicket?.messages?.length]);

  // Handle deep-linking auto-selection (v2.6.151 hardened)
  useEffect(() => {
    if (!autoSelectTicketId && !autoSelectUser) return;
    
    const trySelect = () => {
      if (autoSelectTicketId && tickets) {
        const ticket = (tickets || []).find(t => t.id === autoSelectTicketId || t._id === autoSelectTicketId);
        if (ticket) { 
          setSelectedTicket(ticket); 
          onConsumeTicketId?.(); 
          return true; 
        }
      } else if (autoSelectUser && tickets) {
        const userTicket = (tickets || []).find(t => t.userId === autoSelectUser);
        if (userTicket) { 
          setSelectedTicket(userTicket); 
          onConsumeAutoSelect?.();
          return true; 
        }
      }
      return false;
    };
    
    // Immediate attempt
    if (!trySelect()) {
      // Retry after a short delay in case tickets are still loading
      const timer = setTimeout(() => trySelect(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoSelectUser, autoSelectTicketId, tickets]);

  // 📜 Auto-scroll on Open/Update (v2.6.26)
  useEffect(() => {
    if (selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
      setTimeout(() => {
        if (!isSearchingChat) scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [selectedTicket?.messages?.length]);

  // 🔍 Conversational Search Logic (v2.6.33)
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
      // 🔦 Trigger temporary highlight (v2.6.35)
      const msgId = msg.id || msg.timestamp;
      setTempHighlightedId(msgId);
      setTimeout(() => setTempHighlightedId(null), 2000);
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

    // 🛡️ Justification Prompt: Moving from Resolved/Closed back to Active status
    const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
    const isInactive = selectedTicket?.status === 'Resolved' || selectedTicket?.status === 'Closed';
    
    if (isInactive && activeStates.includes(status)) {
      setPendingReopenStatus(status);
      setShowReopenModal(true);
      return;
    }

    // ⚡ Closed -> Resolved shortcut: bypassing AI summary if it's already closed.
    if (selectedTicket?.status === 'Closed' && status === 'Resolved') {
      onUpdateStatus(selectedTicket.id, status);
      return;
    }

    if (status === 'Resolved' || status === 'Closed') {
      setPendingStatus(status);
      setShowStatusConfirm(true);
    } else {
      onUpdateStatus(selectedTicket.id, status);
    }
  };

  const handleReopenSubmit = async () => {
    if (!reopenJustification.trim()) {
      alert("Please provide a justification for reopening this ticket.");
      return;
    }
    const statusRes = await onUpdateStatus(selectedTicket.id, pendingReopenStatus);
    if (statusRes.success) {
      await onReply(selectedTicket.id, `REOPEN JUSTIFICATION: ${reopenJustification.trim()}`);
      setShowReopenModal(false);
      setReopenJustification('');
      setPendingReopenStatus(null);
    }
    notify(statusRes);
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
      const history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : (players.find(p => p.id === m.senderId)?.name || 'User')}: ${m.text || ''}`
      ).join('\n');
    
      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it into exactly 3 concise sentences. 1) The original issue. 2) The troubleshooting steps taken. 3) The final fix/resolution. Be clear and objective." },
        { role: 'user', text: `History:\n${history}` }
      ];
    
      const aiSummary = await generateAIResponse(prompt);
      const res = await onUpdateStatus(selectedTicket.id, pendingStatus, aiSummary);
      notify(res);
    } catch (e) {
      console.error("AI Resolution Summary Failed:", e);
      const res = await onUpdateStatus(selectedTicket.id, pendingStatus);
      notify(res);
    } finally {
      setIsGeneratingSummary(false);
      setPendingStatus(null);
    }
  };

  const handleReassign = () => {
    setReassignSearch('');
    setShowReassignModal(true);
  };


  const getUserName = (userId) => {
    const p = (players || []).find(pl => pl.id === userId);
    if (!p) return userId;
    return p.username ? `${p.name} (${p.username})` : p.name;
  };
  const getUserRole = (userId) => (players || []).find(pl => pl.id === userId)?.role || 'user';

  const isTicketUnread = (ticket) => {
    if (!ticket) return false;
    
    // 🛡️ SYNC (v2.6.227): Dynamically detect admin identity
    const myId = currentUser?.id || 'admin';
    const status = ticket.status || 'Open';
    const isUnseenStatus = (status === 'Open' || status === 'Awaiting Response');
    const wasOpenedByAdmin = restProps.seenAdminActionIds?.has ? restProps.seenAdminActionIds.has(String(ticket.id)) : false;
    
    // Unread if: contains unread user messages OR is an unseen 'Open'/'Awaiting' status
    const hasUnreadMessages = (ticket.messages || []).some(m => m && m.senderId !== myId && m.status !== 'seen');
    
    return hasUnreadMessages || (isUnseenStatus && !wasOpenedByAdmin);
  };

  const filteredTickets = (tickets || [])
    .filter(t => {
      const status = t?.status || 'Open';
      if (filterStatus === 'Unassigned') return !t.assignedTo;
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
    })
    .sort((a, b) => {
      const aUnread = isTicketUnread(a);
      const bUnread = isTicketUnread(b);
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
      
      // Secondary sort: newest first
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
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

  const handleSendReply = async () => {
    if ((!replyText.trim() && !selectedImage) || !selectedTicket) return;
    const res = await onReply(selectedTicket.id, replyText, selectedImage, replyToMsg);
    if (res.success) {
      setReplyText('');
      setSelectedImage(null);
      setReplyToMsg(null);
    }
  };

  const renderMessageReply = (reply) => {
    if (!reply) return null;
    const targetY = messageYOffsets.current[reply.id || reply.timestamp];
    
    return (
      <TouchableOpacity 
        style={styles.msgReplyPreview}
        onPress={() => {
          if (targetY !== undefined) {
             scrollViewRef.current?.scrollTo({ y: targetY - 50, animated: true });
             // 🔦 Trigger temporary highlight (v2.6.35)
             const msgId = reply.id || reply.timestamp;
             setTempHighlightedId(msgId);
             setTimeout(() => setTempHighlightedId(null), 2000);
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
    // 🚀 ACE TRACK STABILITY VERSION (v2.6.46)
    const APP_VERSION = "2.6.46"; 
    const currentAppVersion = APP_VERSION;
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
          style={[styles.eventCard, (tempHighlightedId === (msg.id || msg.timestamp)) && styles.highlightedMessage]}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.eventText}>{text}</Text>
        </View>
      );
    }

    const isClosed = selectedTicket?.status === 'Closed' || selectedTicket?.status === 'Resolved';

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
          ref={ref => { swipeableRefs.current[msg.id || msg.timestamp] = ref; }}
          enabled={!isClosed}
          renderRightActions={!isClosed && isMe ? renderRightActions : undefined}
          renderLeftActions={!isClosed && !isMe ? renderRightActions : undefined}
          onSwipeableOpen={() => {
            if (isClosed) return;
            setReplyToMsg(msg);
            // 🛡️ Snap-back: Close swipeable once action is registered (v2.6.35)
            swipeableRefs.current[msg.id || msg.timestamp]?.close();
            
            // 🛡️ Auto-focus and scroll to bottom on reply (v2.6.25)
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
              textInputRef.current?.focus();
            }, 100);
          }}
        >
        <View style={[
          styles.messageBubble, 
          isMe ? styles.myBubble : styles.otherBubble,
          (tempHighlightedId === (msg.id || msg.timestamp)) && styles.highlightedMessage
        ]}>
          {renderMessageReply(msg.replyTo)}
          {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
          {msg.image && (
            <Image source={{ uri: config.sanitizeUrl(msg.image) }} style={styles.msgImage} resizeMode="contain" />
          )}
          <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
            {text?.startsWith('CLOSURE_REQUEST_EVENT:') 
              ? `User requested closure: ${text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
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
                  size={15} 
                  color={msg.status === 'seen' ? "#34B7F1" : "#94A3B8"} 
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

  return (
    <View style={styles.container}>
      <Modal
        visible={!!selectedTicket}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setSelectedTicket(null);
          setIsSearchingChat(false);
          setChatSearchText('');
        }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={styles.fullScreenModal}>
            {selectedTicket && (
              <>
                <View style={styles.header}>
                  <TouchableOpacity 
                    onPress={() => {
                      setSelectedTicket(null);
                      setIsSearchingChat(false);
                      setChatSearchText('');
                    }} 
                    style={styles.backBtn}
                  >
                    <Ionicons name="arrow-back" size={20} color="#0F172A" />
                  </TouchableOpacity>
                  <View style={styles.headerInfo}>
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
                                 <Ionicons name="chevron-up" size={18} color="#64748B" />
                               </TouchableOpacity>
                               <TouchableOpacity onPress={handleNextMatch} style={styles.navArrowBtn}>
                                 <Ionicons name="chevron-down" size={18} color="#64748B" />
                               </TouchableOpacity>
                             </View>
                           </View>
                         )}
                      </View>
                    ) : (
                      <>
                        <Text style={styles.headerTitle} numberOfLines={1}>{selectedTicket.title}</Text>
                        <Text style={styles.headerId}>ID: {selectedTicket.id}</Text>
                      </>
                    )}
                  </View>
                  <TouchableOpacity 
                    onPress={() => {
                      setIsSearchingChat(!isSearchingChat);
                      if (isSearchingChat) setChatSearchText('');
                    }}
                    style={styles.headerSearchBtn}
                  >
                    <Ionicons name={isSearchingChat ? "close-circle" : "search-outline"} size={20} color={isSearchingChat ? "#EF4444" : "#64748B"} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailHeaderScrollWrapper}>
                  <ScrollView style={styles.detailHeaderList} showsVerticalScrollIndicator={false}>
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
                          <Text style={styles.infoValue}>{formatTicketDateFull(selectedTicket.createdAt)}</Text>
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

                      <View style={[styles.statusControl, { marginTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 }]}>
                         <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                           <TouchableOpacity 
                             onPress={handleReassign}
                             style={{ 
                               flexDirection: 'row', 
                               alignItems: 'center', 
                               backgroundColor: '#6366F1', 
                               paddingHorizontal: 16, 
                               paddingVertical: 10, 
                               borderRadius: 12,
                               shadowColor: '#6366F1',
                               shadowOffset: { width: 0, height: 4 },
                               shadowOpacity: 0.2,
                               shadowRadius: 8,
                               elevation: 4
                             }}
                           >
                             <Ionicons name="person-outline" size={16} color="#FFF" />
                             <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
                               {selectedTicket.assignedTo ? `Assigned: ${getUserName(selectedTicket.assignedTo)}` : 'Assign Agent'}
                             </Text>
                             <Ionicons name="chevron-down" size={14} color="#FFF" style={{ marginLeft: 8, opacity: 0.8 }} />
                           </TouchableOpacity>
                         </View>
                      </View>
                    </View>


                    {selectedTicket.closureSummary && (
                      <View style={styles.resolutionCard}>
                        <View style={styles.resHeader}>
                          <Ionicons name="shield-checkmark" size={16} color="#059669" />
                          <Text style={styles.resTitle}>Closure Summary</Text>
                        </View>
                        <Text style={styles.resText}>{selectedTicket.closureSummary}</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                <KeyboardAvoidingView 
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                  style={styles.flex}
                >
                  <View style={styles.chatContainer}>
                    <ScrollView 
                      ref={scrollViewRef} 
                      style={styles.chatScroll} 
                      contentContainerStyle={styles.chatScrollContent}
                      onContentSizeChange={() => {
                        if (!isSearchingChat) scrollViewRef.current?.scrollToEnd({ animated: true });
                      }}
                      showsVerticalScrollIndicator={true}
                    >
                      {(selectedTicket?.messages || [])
                        .map((msg, idx) => {
                          const currentMsgDate = new Date(msg.timestamp).toDateString();
                          const prevMsgDate = idx > 0 ? new Date(selectedTicket.messages[idx-1].timestamp).toDateString() : null;
                          const showDateHeader = currentMsgDate !== prevMsgDate;
                          const isHighlighted = searchMatchIndices[activeMatchIndex] === idx;

                          return (
                            <View 
                              key={`${msg.timestamp || 'no-ts'}-${idx}`} 
                              style={isHighlighted && styles.highlightedMessage}
                              onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
                            >
                              {showDateHeader && !chatSearchText && renderDateHeader(msg.timestamp)}
                              {renderMessage(msg, idx)}
                            </View>
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
                            testID="admin.support.reply.input"
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
                            testID="admin.support.reply.submit"
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
            )}
          </SafeAreaView>

          {/* 🛡️ [SYNC v2.6.230] Replaced nested Modals with absolute Views to prevent iOS occlusion delay */}
          {showStatusConfirm && (
            <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
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
          )}

          {showReopenModal && (
            <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
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
          )}

          {isGeneratingSummary && (
            <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1001 }]}>
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#2563EB" size="large" />
                <Text style={styles.loadingText}>ACE AI Analyzing Conversation...</Text>
              </View>
            </View>
          )}

          {showReassignModal && (
            <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1002 }]}>
               <View style={styles.reassignModalContainer}>
                  <View style={styles.reassignHeader}>
                    <Text style={styles.reassignTitle}>Reassign Ticket</Text>
                    <TouchableOpacity onPress={() => setShowReassignModal(false)}>
                      <Ionicons name="close" size={24} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.reassignSearchBox}>
                    <Ionicons name="search" size={16} color="#94A3B8" />
                    <TextInput
                      style={styles.reassignSearchInput}
                      placeholder="Search active agents..."
                      value={reassignSearch}
                      onChangeText={setReassignSearch}
                      autoFocus={Platform.OS !== 'web'}
                    />
                  </View>

                  <ScrollView style={styles.agentList} showsVerticalScrollIndicator={false}>
                    {(players || [])
                      .filter(p => {
                        const role = (p.role || '').toLowerCase();
                        const status = (p.supportStatus || '').toLowerCase();
                        const level = (p.supportLevel || '').toLowerCase();
                        const username = (p.username || '').toLowerCase();
                        
                        const isAgent = role === 'support' || role === 'admin';
                        
                        // 🛡️ [SMART LIFECYCLE GUARD] (v2.6.249)
                        // An agent is inactive if they have a terminatedAt date that is NOT superseded by a reOnboardedAt date
                        const hasActiveTermination = !!p.terminatedAt && (!p.reOnboardedAt || new Date(p.terminatedAt) > new Date(p.reOnboardedAt));

                        const isExplicitlyInactive = 
                          ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || 
                          ['ex-employee', 'terminated'].includes(level) ||
                          hasActiveTermination;
                        
                        // 2. Hardcoded Blacklist for known terminated agents (Safety fallback for thinned data)
                        const isBlacklisted = ['aurna', 'riyan'].includes(username);

                        if (!isAgent || isExplicitlyInactive || isBlacklisted) return false;
                        
                        return p.id !== (selectedTicket?.assignedTo || '');
                      })
                      .map(p => {
                         // 📊 [LOAD TRACKING] Calculate active ticket count (v2.6.249)
                         const activeTickets = (tickets || []).filter(t => 
                           (t.assignedTo === p.id || t.assignedTo === p.username) && 
                           !['Resolved', 'Closed'].includes(t.status)
                         ).length;
                         return { ...p, activeTickets };
                      })
                      .filter(p => {
                        if (!reassignSearch) return true;
                        const q = reassignSearch.toLowerCase();
                        return p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
                      })
                      .map(agent => (
                        <TouchableOpacity 
                          key={agent.id}
                          style={styles.agentItem}
                          onPress={async () => {
                            const res = await onReassignTicket(selectedTicket.id, agent.id);
                             if (res.success) {
                               // 🛡️ [OPTIMISTIC UPDATE] (v2.6.248)
                               setSelectedTicket(prev => ({ ...prev, assignedTo: agent.id }));
                               setShowReassignModal(false);
                               Alert.alert("Success", `Ticket reassigned to ${agent.name}`);
                             } else {
                              Alert.alert("Error", res.error);
                            }
                          }}
                        >
                          <View style={styles.agentAvatar}>
                            <Text style={styles.agentInitials}>{agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</Text>
                          </View>
                          <View style={styles.agentInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                              <View style={[styles.loadBadge, { backgroundColor: agent.activeTickets > 5 ? '#FEF2F2' : '#F0FDF4' }]}>
                                <Text style={[styles.loadText, { color: agent.activeTickets > 5 ? '#EF4444' : '#22C55E' }]}>
                                  {agent.activeTickets} {agent.activeTickets === 1 ? 'ticket' : 'tickets'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.agentUser}>@{agent.username || agent.id}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                        </TouchableOpacity>
                      ))}
                    
                    {(players || []).filter(p => {
                      const role = (p.role || '').toLowerCase();
                      const status = (p.supportStatus || '').toLowerCase();
                      const level = (p.supportLevel || '').toLowerCase();
                      const isExplicitlyInactive = ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || ['ex-employee', 'terminated'].includes(level) || !!p.terminatedAt;
                      const isActiveSupport = role === 'support' && (status === 'active' || !status) && !isExplicitlyInactive;
                      const isActiveAdmin = role === 'admin' && !isExplicitlyInactive;
                      return (isActiveSupport || isActiveAdmin) && p.id !== (selectedTicket?.assignedTo || '');
                    }).length === 0 && (
                      <Text style={styles.noAgentsText}>No other active agents available.</Text>
                    )}
                  </ScrollView>
               </View>
            </View>
          )}

        </GestureHandlerRootView>
      </Modal>

      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: '#EFF6FF' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Open</Text>
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{(tickets || []).filter(t => t && (t.status === 'Open' || !t.status)).length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Active</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{(tickets || []).filter(t => t && t.status === 'In Progress').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FAF5FF' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Awaiting</Text>
          <Text style={[styles.statValue, { color: '#9333EA' }]}>{(tickets || []).filter(t => t && t.status === 'Awaiting Response').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Resolved</Text>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{(tickets || []).filter(t => t && t.status === 'Resolved').length}</Text>
        </View>
      </View>

      <View style={styles.managementBar}>
        <TouchableOpacity 
          onPress={() => setShowQueueDashboard(true)}
          style={styles.queueBtn}
        >
          <Ionicons name="apps-outline" size={16} color="#FFF" />
          <Text style={styles.queueBtnText}>Queue Management</Text>
        </TouchableOpacity>
      </View>


      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        {['All', 'Unassigned', ...statusOptions].map(s => {
          const count = (tickets || []).filter(t => {
            if (s === 'All') return true;
            if (s === 'Unassigned') return !t.assignedTo;
            return (t.status || 'Open') === s;
          }).length;
          const isActive = filterStatus === s;
          return (
            <TouchableOpacity 
              testID={`admin.support.filter.${s}`}
              key={s} 
              onPress={() => setFilterStatus(s)}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {s} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {(filteredTickets || []).map((ticket, idx) => {
          const status = ticket.status || 'Open';
          const st = statusColors[status] || statusColors['Open'];
          const date = ticket.createdAt ? new Date(ticket.createdAt) : null;
          const isUnread = isTicketUnread(ticket);
          return (
            <TouchableOpacity 
              testID={`admin.support.card.${ticket.id}`}
              key={ticket.id || `temp-${idx}`} 
              onPress={() => setSelectedTicket(ticket)}
              style={[styles.ticketCard, isUnread && styles.unreadCard]}
            >
              <View style={styles.ticketTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title || 'Untitled Ticket'}</Text>
                  <Text style={styles.ticketMeta}>{getUserName(ticket.userId)} • ID: {ticket.id || 'NO-ID'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Text style={[styles.statusBadgeText, { color: st.text }]}>{status}</Text>
                  </View>
                  <Text style={{ fontSize: 8, color: ticket.assignedTo ? '#64748B' : '#EF4444', fontWeight: 'bold', marginTop: 4 }}>
                    {ticket.assignedTo ? getUserName(ticket.assignedTo) : 'Unassigned'}
                  </Text>
                </View>
              </View>
              <View style={styles.ticketBottom}>
                <Text style={styles.ticketType}>{ticket.type || 'General'}</Text>
                <Text style={styles.ticketDate}>{formatTicketDateFull(ticket.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <QueueManagementDashboard 
        visible={showQueueDashboard}
        onClose={() => setShowQueueDashboard(false)}
        tickets={tickets}
        players={players}
        onSelectTicket={(ticket) => setSelectedTicket(ticket)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
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
    flex: 1,
    marginLeft: 12,
  },
  headerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerSearchInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 12,
    fontSize: 13,
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
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    minWidth: 30,
    textAlign: 'center',
  },
  navArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 2,
  },
  navArrowBtn: {
    padding: 4,
  },
  headerSearchBtn: {
    padding: 8,
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
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  statBox: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: -0.2,
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
  unreadCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
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
    overflow: 'hidden',
  },
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  detailHeaderScrollWrapper: {
    maxHeight: 180,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailHeaderList: {
    flexGrow: 0,
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
    fontWeight: '500',
    marginTop: 2,
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
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
  highlightedMessage: {
    backgroundColor: '#FEF9C3', // Amber highlight
    borderRadius: 12,
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
  managementBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
    ...shadows.sm,
  },
  queueBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reassignModalContainer: {
    backgroundColor: '#FFFFFF',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    ...shadows.lg,
  },
  reassignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  reassignTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  reassignSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  reassignSearchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  agentList: {
    flexGrow: 0,
  },
  agentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  agentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  agentInitials: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  agentUser: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  loadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  loadText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  noAgentsText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 13,
    marginVertical: 20,
    fontWeight: '600',
  },
});
