import React, { useState, useRef, useEffect, useMemo } from 'react';
import {  
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert
 } from 'react-native';
import { apiFetch } from '../utils/apiFetch';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { generateAIResponse } from '../services/aiService';
import notify from '../utils/notify';
import config from '../config';
import { shadows } from '../theme/designSystem';
import styles from "./tickets/SupportTicketSystem.styles";

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
  onUpdateStatus, onReply, onRetryMessage, onMarkSeen, onClaimTicket, userRole,
  onEscalateTicket, autoSelectTicketId, onConsumeTicketId
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
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [assignmentScope, setAssignmentScope] = useState(userRole === 'support' || userRole === 'admin' ? 'me' : 'all');
  const [filterAgentId, setFilterAgentId] = useState(null); // null = All Agents in scope
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // CSAT Rating State
  const [csatRating, setCsatRating] = useState(0);
  const [csatFeedback, setCsatFeedback] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // 🛡️ [ESCALATION STATE] (v2.6.345)
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [escalationTarget, setEscalationTarget] = useState('admin'); // Default to escalating to System Admin

  const scrollViewRef = useRef(null);
  const textInputRef = useRef(null);
  const messageYOffsets = useRef({}); // 📍 Track message coordinates (v2.6.27)
  const swipeableRefs = useRef({});   // 🛡️ [SYNC v2.6.293] Fix ReferenceError on mobile chat
  const isAtBottom = useRef(true); // 🛡️ [SCROLL_FIX] Track if user is at bottom
  const prevContentHeight = useRef(0); // 🛡️ Track content height to prevent spurious scrolls


  // 🛡️ [Tick System] Mark as 'Seen' when ticket is opened (v2.6.28)
  useEffect(() => {
    if (selectedTicket && selectedTicket.id) {
      onMarkSeen?.(selectedTicket.id);
    }
  }, [selectedTicket?.id]);

  const isAgent = userRole === 'support' || userRole === 'admin';
  
  // 👥 [AGENT_EXTRACTION] (v2.6.451): Get unique agents for the filter dropdown
  const availableAgents = useMemo(() => {
    const agentsMap = new Map();
    (tickets || []).forEach(t => {
      if (t.assignedTo && t.assignedAgentName) {
        agentsMap.set(t.assignedTo, t.assignedAgentName);
      }
    });
    return Array.from(agentsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tickets]);

  // 🛡️ DYNAMIC SCOPING (v2.6.451):
  // Updated to handle specific agent filtering
  const scopedTickets = useMemo(() => {
    if (!isAgent) return (tickets || []).filter(t => t.userId === userId);
    
    // Scope 1: Only My Tickets
    if (assignmentScope === 'me') return (tickets || []).filter(t => t.assignedTo === userId);
    
    // Scope 2: Specific Agent in Full View
    if (filterAgentId) return (tickets || []).filter(t => t.assignedTo === filterAgentId);
    
    // Scope 3: Full Team View (All)
    return tickets || [];
  }, [tickets, assignmentScope, filterAgentId, isAgent, userId]);

  // 🔍 UNIFIED FILTER ENGINE (v2.6.450):
  // Syncs Status Tab + Search Query + Assignment Scope
  const filteredTickets = useMemo(() => {
    const q = listSearchQuery.toLowerCase().trim();
    const openStatuses = ['Open', 'In Progress', 'Awaiting Response'];
    
    return scopedTickets.filter(t => {
      // 1. Status Filter
      const status = t.status || 'Open';
      let statusMatch = true;
      if (listTab === 'Open') statusMatch = openStatuses.includes(status);
      else if (listTab === 'Closed') statusMatch = status === 'Resolved' || status === 'Closed';
      else if (listTab === 'Pool') statusMatch = !t.assignedTo && status === 'Open';
      else if (listTab === 'Escalations') statusMatch = String(t.escalatedTo || '').toLowerCase() === String(userId || '').toLowerCase();

      if (!statusMatch) return false;

      // 2. Search Filter (ID, Title, Description)
      if (q) {
        const idMatch = String(t.id).includes(q);
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const descMatch = (t.description || '').toLowerCase().includes(q);
        return idMatch || titleMatch || descMatch;
      }

      return true;
    });
  }, [scopedTickets, listTab, listSearchQuery]);

  // 🌍 GLOBAL SEARCH FALLBACK (v2.6.450):
  // Checks if results exist outside current scope
  const globalMatchCount = useMemo(() => {
    if (!listSearchQuery || !isAgent) return 0;
    const q = listSearchQuery.toLowerCase().trim();
    return (tickets || []).filter(t => {
      const idMatch = String(t.id).includes(q);
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const descMatch = (t.description || '').toLowerCase().includes(q);
      return idMatch || titleMatch || descMatch;
    }).length;
  }, [tickets, listSearchQuery, isAgent]);

  useEffect(() => {
    if (onToggleSupport) onToggleSupport(true);
    return () => { if (onToggleSupport) onToggleSupport(false); };
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      // 🛡️ [SCROLL_FIX] (v2.6.569): Only update if data actually changed to prevent
      // unnecessary re-renders that hijack scroll position while user is reading history.
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTicket)) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets]);

  // 🔗 [DEEP LINKING] Auto-select ticket from ChatBot / Profile (v2.6.500)
  useEffect(() => {
    if (autoSelectTicketId && tickets && tickets.length > 0) {
      const ticketToOpen = tickets.find(t => String(t.id) === String(autoSelectTicketId));
      if (ticketToOpen) {
        setSelectedTicket(ticketToOpen);
        setView('detail');
        if (onConsumeTicketId) onConsumeTicketId();
      }
    }
  }, [autoSelectTicketId, tickets]);

  // 📜 Auto-scroll on Open/Update (v2.6.25)
  useEffect(() => {
    if (view === 'detail' && selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
      setTimeout(() => {
        if (!isSearchingChat) scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [view]); 

  // 📜 Auto-scroll on New Message (v2.6.75)
  const prevMessageCount = useRef(0);
  useEffect(() => {
    if (view === 'detail' && selectedTicket?.messages) {
      const currentCount = selectedTicket.messages.length;
      if (currentCount > prevMessageCount.current && isAtBottom.current && !isSearchingChat && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
      prevMessageCount.current = currentCount;
    }
  }, [selectedTicket?.messages?.length, view, isSearchingChat]);


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

  const handleRateTicket = async (rating) => {
    if (!rating) return;
    setIsSubmittingRating(true);
    setCsatRating(rating);
    try {
      const res = await apiFetch(`${config.API_BASE_URL}/api/v1/support/rate-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID, 'x-user-id': userId },
        credentials: 'include',
        body: JSON.stringify({ ticketId: selectedTicket.id, rating, feedback: csatFeedback })
      });
      if (res.ok) {
        const data = await res.json();
        notify("Thank you for your feedback!");
        
        // 🛡️ [SYNC_FIX]: Update both local state AND global store to survive re-renders and delta syncs
        if (data.ticket) {
          const { useSupportStore } = require('../stores/useSupportStore');
          const tickets = useSupportStore.getState().supportTickets;
          useSupportStore.getState().setSupportTickets(
            tickets.map(t => t.id === selectedTicket.id ? data.ticket : t)
          );
          setSelectedTicket(data.ticket);
        } else {
          setSelectedTicket(prev => ({ ...prev, rating }));
        }
      } else {
        const data = await res.json();
        notify("Error", data.error || "Failed to submit rating");
        setCsatRating(0);
      }
    } catch (e) {
      notify("Network Error", e.message);
      setCsatRating(0);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      Alert.alert('Missing Fields', 'Please fill in both title and description.');
      return;
    }
    const res = await onCreateTicket({ 
      ...formData, 
      userId, 
      userName,
      messages: [{ 
        senderId: userId, 
        text: `ISSUE_DESCRIPTION: ${formData.description}`, 
        timestamp: new Date().toISOString() 
      }] 
    });
    if (res.success) {
      setFormData({ type: 'Other', title: '', description: '' });
      setView('list');
    }
    notify(res);
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !selectedImage) || !selectedTicket) return;
    const res = await onReply(selectedTicket.id, newMessage, selectedImage, replyToMsg);
    if (res.success) {
      setNewMessage('');
      setSelectedImage(null);
      setReplyToMsg(null);
    }
  };

  const handleClaim = async (ticketId) => {
    if (!onClaimTicket) return;
    const res = await onClaimTicket(ticketId);
    if (res.success) {
        notify({ success: true, message: "Ticket claimed! Check your 'Open' list." });
    } else {
        notify({ success: false, message: res.error || "Failed to claim ticket" });
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
            scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.msgReplyUser}>{reply.senderId === userId ? 'You' : 'Support Agent'}</Text>
        <Text style={styles.msgReplyText} numberOfLines={1}>{reply.text}</Text>
      </TouchableOpacity>
    );
  };

  const renderMessage = (msg, index, isHighlighted) => {
    // Resilient data extraction
    let text = msg?.text ?? msg?.message ?? (typeof msg === 'string' ? msg : null);
    if (text === null || text === '') {
      text = msg?.image ? '' : 'Empty message';
    }
    const timestamp = msg?.timestamp || new Date().toISOString();
    const senderId = msg?.senderId || (text?.startsWith('ISSUE_DESCRIPTION:') ? (selectedTicket?.userId || 'user') : userId);
    // 🛡️ [IDENTITY_FIX] (v2.6.569): Compare against both the logged-in user AND the ticket owner.
    // For agents viewing tickets they created, senderId === userId is sufficient.
    // For agents viewing OTHER users' tickets, the ticket owner's messages should show on the left.
    const isMe = String(senderId) === String(userId);

    // 🛡️ [INTERNAL FILTER] (v2.6.290): Skip rendering private admin notes
    if (msg.type === 'internal') return null;
    
    // 🛡️ Format internal system/event messages for the user
    if (msg.type === 'event' || senderId === 'system') {
      const cleanText = text ? text.replace(/\n?\(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\)\s*$/i, '') : '';
      const eventTime = new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      return (
        <View 
          key={msg.id || msg.timestamp || index} 
          style={styles.eventCard}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.eventText}>{cleanText}</Text>
          <Text style={[styles.eventText, { fontSize: 9, marginTop: 2, color: '#94A3B8', textTransform: 'none' }]}>
            {eventTime}
          </Text>
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
          ref={ref => { swipeableRefs.current[msg.id || msg.timestamp] = ref; }}
          renderRightActions={isMe ? renderRightActions : undefined}
          renderLeftActions={!isMe ? renderRightActions : undefined}
          onSwipeableOpen={() => {
            setReplyToMsg(msg);
            swipeableRefs.current[msg.id || msg.timestamp]?.close();
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
              textInputRef.current?.focus();
            }, 100);
          }}
        >
          <View style={[styles.messageContainer, isMe ? styles.myContainer : styles.otherContainer]}>
            <View style={[
              styles.messageBubble, 
              isMe ? styles.myBubble : styles.otherBubble,
              isHighlighted && styles.highlightedBubble
            ]}>
              {!isMe && <Text style={styles.adminLabel}>{String(senderId) === String(selectedTicket?.userId) ? 'User' : 'Support Agent'}</Text>}
              {renderMessageReply(msg.replyTo)}
              {msg.image && (
                <Image source={{ uri: config.sanitizeUrl(msg.image) }} style={styles.msgImage} resizeMode="contain" />
              )}
              <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
                {text?.startsWith('CLOSURE_REQUEST_EVENT:') 
                  ? `Requested Closure: ${text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
                  : text}
              </Text>
              <View style={styles.msgFooter}>
                <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
                  {new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
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
                        color={msg.status === 'seen' ? "#A5B4FC" : (msg.status === 'delivered' ? "#10B981" : "#94A3B8")} 
                        style={{ marginLeft: 4, opacity: msg.status === 'pending' ? 0.3 : 1 }} 
                      />
                    )}
                  </View>
                )}
              </View>
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
      if (closureReason.trim()) {
        await SupportService.replyToTicket(selectedTicket.id, userId, `CLOSURE_REQUEST_EVENT: ${closureReason.trim()}`);
      }

      let history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : (m.senderId === userId ? 'User' : 'Other')}: ${m.text || ''}`
      ).join('\n');

      if (!history.trim()) {
         history = "No messages were exchanged in this ticket.";
      }

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it. Format your response EXACTLY as follows with these headings:\\n\\nProblem Description:\\n(Detail the full scope of issues identified through the conversation, not just the title)\\n\\nTechnical Details:\\n(Numbered bullet points of ACTUAL technical steps, troubleshooting, or fixes suggested/performed. STRICTLY IGNORE polite acknowledgments, 'we will investigate' messages, status changes like 'in progress' or 'closed', and reopening events. Only list concrete actions.)\\n\\nClosure Summary:\\n(Brief summary of only the final resolution details which fixed the issue)" },
        { role: 'user', text: `History:\n${history}\n\nClient Resolution Message: ${closureReason.trim() || 'No additional details'}` }
      ];

      const aiSummary = await generateAIResponse(prompt);
      
      const res = await onUpdateStatus(selectedTicket.id, 'Closed', aiSummary || "Closure summary was successfully resolved, but AI was unable to generate a summary.");
      if (res?.success) notify(res);
    } catch (e) {
      console.error("User-initiated closure failed:", e);
      await onUpdateStatus(selectedTicket.id, 'Closed', "Closure summary was successfully resolved, but AI was unable to generate a summary due to an error.");
    } finally {
      setShowClosureModal(false);
      setClosureReason('');
      setIsClosing(false);
    }
  };

  const handleReopen = () => {
    if (!selectedTicket) return;
    onUpdateStatus(selectedTicket.id, 'In Progress');
  };

  const handleGenerateMissingSummary = async () => {
    if (!selectedTicket) return;
    setIsGeneratingSummary(true);
    
    try {
      let history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : (m.senderId === userId ? 'User' : 'Other')}: ${m.text || ''}`
      ).join('\n');

      if (!history.trim()) {
         history = "No messages were exchanged in this ticket.";
      }

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it. Format your response EXACTLY as follows with these headings:\\n\\nProblem Description:\\n(Detail the full scope of issues identified through the conversation, not just the title)\\n\\nTechnical Details:\\n(Numbered bullet points of ACTUAL technical steps, troubleshooting, or fixes suggested/performed. STRICTLY IGNORE polite acknowledgments, 'we will investigate' messages, status changes like 'in progress' or 'closed', and reopening events. Only list concrete actions.)\\n\\nClosure Summary:\\n(Brief summary of only the final resolution details which fixed the issue)" },
        { role: 'user', text: `History:\n${history}\n\nThe ticket was closed without a summary. Please generate one based on the history.` }
      ];

      const aiSummary = await generateAIResponse(prompt);
      const finalSummary = aiSummary || "Closure summary was successfully resolved, but AI was unable to generate a summary.";
      
      const res = await onUpdateStatus(selectedTicket.id, selectedTicket.status, finalSummary);
      if (res?.success) {
        notify({ success: true, message: "Closure summary generated successfully" });
        setSelectedTicket(prev => ({ ...prev, closureSummary: finalSummary }));
      } else {
        notify({ success: false, message: "Failed to update ticket status with summary" });
      }
    } catch (e) {
      console.error("Missing summary generation failed:", e);
      notify({ success: false, message: "Failed to generate summary" });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedTicket || !onEscalateTicket) return;
    if (!escalationReason.trim()) {
        notify({ success: false, message: "Please provide a reason for escalation." });
        return;
    }
    
    setIsEscalating(true);
    try {
        const res = await onEscalateTicket(selectedTicket.id, escalationTarget, escalationReason.trim());
        if (res?.success) {
            notify({ success: true, message: "Ticket escalated successfully." });
            setShowEscalateModal(false);
            setEscalationReason('');
            setEscalationTarget('admin');
        } else {
            notify({ success: false, message: res?.message || "Failed to escalate ticket." });
        }
    } catch (e) {
        console.error("Ticket escalation failed:", e);
        notify({ success: false, message: "An error occurred during escalation." });
    } finally {
        setIsEscalating(false);
    }
  };

  if (view === 'list') {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={styles.title}>Support Hub</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
            <View style={[styles.searchBarWrapper, { flex: 1, marginTop: 0 }]}>
              <Ionicons name="search" size={16} color="#94A3B8" style={{ marginLeft: 12 }} />
              <TextInput 
                style={styles.listSearchInput}
                placeholder="Search ID or description..."
                placeholderTextColor="#94A3B8"
                value={listSearchQuery}
                onChangeText={setListSearchQuery}
              />
              {listSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setListSearchQuery('')} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => setView('create')} style={styles.newTicketBtn}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.btnText}>New Ticket</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isAgent && (
          <View style={styles.scopeToggleContainer}>
            <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
              <TouchableOpacity 
                onPress={() => { setAssignmentScope('me'); setFilterAgentId(null); }}
                style={[styles.scopeBtn, assignmentScope === 'me' && styles.scopeBtnActive]}
              >
                <Ionicons name="person" size={14} color={assignmentScope === 'me' ? '#FFF' : '#64748B'} />
                <Text style={[styles.scopeBtnText, assignmentScope === 'me' && styles.scopeBtnTextActive]}>My Tickets</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setAssignmentScope('all')}
                style={[styles.scopeBtn, assignmentScope === 'all' && styles.scopeBtnActive]}
              >
                <Ionicons name="people" size={14} color={assignmentScope === 'all' ? '#FFF' : '#64748B'} />
                <Text style={[styles.scopeBtnText, assignmentScope === 'all' && styles.scopeBtnTextActive]}>Full Team</Text>
              </TouchableOpacity>
            </View>

            {assignmentScope === 'all' && availableAgents.length > 0 && (
              <TouchableOpacity 
                style={styles.agentFilterDropdown}
                onPress={() => setShowAgentPicker(true)}
              >
                <Text style={styles.agentFilterText}>
                  {filterAgentId 
                    ? `Agent: ${availableAgents.find(a => a.id === filterAgentId)?.name?.split(' ')[0]}` 
                    : 'All Agents'}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>
        )}

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
          
          {(userRole === 'admin' || userRole === 'support') && (
            <TouchableOpacity 
              onPress={() => setListTab('Pool')}
              style={[styles.tabBtn, listTab === 'Pool' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, listTab === 'Pool' && styles.tabBtnTextActive]}>Pool</Text>
            </TouchableOpacity>
          )}

          {(userRole === 'admin' || userRole === 'support') && (
            <TouchableOpacity 
              onPress={() => setListTab('Escalations')}
              style={[styles.tabBtn, listTab === 'Escalations' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, listTab === 'Escalations' && styles.tabBtnTextActive]}>Escalations</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {(() => {
            if (filteredTickets.length === 0) {
              const hasGlobalResults = globalMatchCount > filteredTickets.length;
              return (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={48} color="#E2E8F0" />
                  <Text style={styles.emptyTitle}>
                    {listSearchQuery ? 'No matching tickets found' : `No ${listTab === 'Open' ? 'open' : 'resolved'} tickets`}
                  </Text>
                  
                  {hasGlobalResults && assignmentScope === 'me' ? (
                    <TouchableOpacity 
                      style={styles.searchAllFallback}
                      onPress={() => { setAssignmentScope('all'); setListTab('Open'); }}
                    >
                      <Text style={styles.searchAllFallbackText}>
                        Found {globalMatchCount} matches in Full Team View. ➔
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.emptySubtitle}>
                      {listSearchQuery 
                        ? 'Try adjusting your search or filters.' 
                        : (listTab === 'Open' ? 'When you need help, your active tickets will appear here.' : 'Your resolved or history tickets will appear here.')}
                    </Text>
                  )}
                </View>
              );
            }

            return filteredTickets
              .sort((a, b) => {
                const aMsgs = (a.messages || []);
                const bMsgs = (b.messages || []);
                const aLast = aMsgs[aMsgs.length - 1];
                const bLast = bMsgs[bMsgs.length - 1];
                
                // 🛡️ [v2.6.558] UNREAD LOGIC: Dynamic per-agent or global user check
                const checkUnread = (t) => {
                  const msgs = t.messages || [];
                  const last = msgs[msgs.length - 1];
                  if (!last || last.type === 'event' || last.senderId === 'system' || last.senderId === userId) return false;
                  
                  if (isAgent) {
                    const myLastRead = t.lastReadBy?.[userId];
                    if (myLastRead) {
                       return new Date(last.timestamp) > new Date(myLastRead);
                    }
                  }
                  
                  // End-User view (or legacy fallback): Only care if it's unread globally
                  return last.status !== 'seen';
                };
                
                const aUnread = checkUnread(a);
                const bUnread = checkUnread(b);
                
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
                
                // 🛡️ [v2.6.558] PER-AGENT UNREAD INDICATOR
                const hasUnread = (() => {
                  if (!lastMessage || lastMessage.type === 'event' || lastMessage.senderId === 'system' || lastMessage.senderId === userId) return false;
                  if (isAgent) {
                    const myLastRead = ticket.lastReadBy?.[userId];
                    if (myLastRead) return new Date(lastMessage.timestamp) > new Date(myLastRead);
                  }
                  return lastMessage.status !== 'seen';
                })();
                const st = statusColors[ticket.status || 'Open'] || statusColors['Open'];

                return (
                  <TouchableOpacity
                    key={ticket.id}
                    onPress={() => { setSelectedTicket(ticket); setView('detail'); }}
                    style={[styles.ticketCard, hasUnread && styles.ticketCardUnread]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={styles.ticketDatePrefix}>
                        Date:- {new Date(ticket.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
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

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.ticketTypeParens}>({ticket.type})</Text>
                      {ticket.source === 'AI' && isAgent && (
                        <View style={{ backgroundColor: '#E0E7FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#4338CA' }}>AI GENERATED</Text>
                        </View>
                      )}
                    </View>

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

                    {listTab === 'Pool' && (
                      <TouchableOpacity 
                        style={styles.claimBtn} 
                        onPress={() => handleClaim(ticket.id)}
                      >
                        <Ionicons name="hand-right-outline" size={14} color="#FFF" />
                        <Text style={styles.claimBtnText}>Claim Case</Text>
                      </TouchableOpacity>
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

        {/* 👤 [AGENT_PICKER_MODAL] (v2.6.451) */}
        <Modal transparent visible={showAgentPicker} animationType="fade">
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowAgentPicker(false)}
            >
                <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Filter by Agent</Text>
                        <TouchableOpacity onPress={() => setShowAgentPicker(false)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        <TouchableOpacity 
                            onPress={() => {
                                setFilterAgentId(null);
                                setShowAgentPicker(false);
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[styles.pickerItemText, !filterAgentId && styles.pickerItemTextActive]}>All Team Members</Text>
                            {!filterAgentId && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                        </TouchableOpacity>
                        {availableAgents.map((agent) => (
                            <TouchableOpacity 
                                key={agent.id} 
                                onPress={() => {
                                    setFilterAgentId(agent.id);
                                    setShowAgentPicker(false);
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, filterAgentId === agent.id && styles.pickerItemTextActive]}>{agent.name}</Text>
                                {filterAgentId === agent.id && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  if (view === 'detail' && selectedTicket) {
    const isClosed = selectedTicket.status === 'Closed' || selectedTicket.status === 'Resolved';
    const st = statusColors[selectedTicket.status] || statusColors['Open'];

    const canReopen = (() => {
        // 🛡️ [REOPEN_FIX] (v2.6.569): If closedAt is missing (e.g. 'Resolved' tickets or legacy closed tickets),
        // fallback to resolvedAt or updatedAt. Previously this was returning false immediately.
        const closedDate = selectedTicket.closedAt || selectedTicket.resolvedAt || selectedTicket.updatedAt;
        if (!closedDate) return false;
        const diff = Date.now() - new Date(closedDate).getTime();
        return diff < (3 * 24 * 60 * 60 * 1000); // 3 days
    })();

    const renderDateHeader = (dateStr) => {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let label = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', flexShrink: 1 }}>
                            <Text style={styles.typeTag} numberOfLines={1}>{selectedTicket.type}</Text>
                            <Text style={[styles.typeTag, { backgroundColor: '#F1F5F9', color: '#64748B', flexShrink: 1 }]} numberOfLines={1}>
                                {selectedTicket.assignedTo ? `Assigned to ${selectedTicket.assignedTo === userId ? 'You' : (selectedTicket.assignedAgentName || 'Agent')}` : 'Unassigned'}
                            </Text>
                            {selectedTicket.source === 'AI' && isAgent && (
                                <Text style={[styles.typeTag, { backgroundColor: '#E0E7FF', color: '#4338CA' }]}>AI GENERATED</Text>
                            )}
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
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                          {isAgent && !isClosed && (
                              <TouchableOpacity onPress={() => setShowEscalateModal(true)} style={styles.escalateBtnUnified}>
                                  <Text style={styles.escalateBtnText}>Escalate</Text>
                              </TouchableOpacity>
                          )}
                          {!isClosed && (
                              <TouchableOpacity onPress={() => setShowClosureModal(true)} style={styles.reqCloseBtnUnified}>
                                  <Text style={styles.reqCloseBtnText}>Request Closure</Text>
                              </TouchableOpacity>
                          )}
                      </View>
                  </View>
                )}
            </View>
        </View>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          style={styles.flex}
        >
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatArea} 
            contentContainerStyle={styles.chatContent}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              if (!contentSize || contentSize.height === 0) return;
              const paddingToBottom = 50;
              // Only consider 'at bottom' if we can actually scroll down (contentSize > layoutMeasurement)
              // AND we are near the bottom.
              const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);
              isAtBottom.current = contentOffset.y >= maxScroll - paddingToBottom;
            }}
            scrollEventThrottle={16}
            onContentSizeChange={(w, h) => {
              prevContentHeight.current = h;
            }}
          >
            {(selectedTicket.status === 'Resolved' || selectedTicket.status === 'Closed') && selectedTicket.closureSummary && (
              <View style={styles.resolutionCard}>
                <View style={styles.resHeader}>
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
                  <Text style={styles.resTitle}>Closure Summary</Text>
                </View>
                <Text style={styles.resText}>{selectedTicket.closureSummary}</Text>
              </View>
            )}

            {(selectedTicket.status === 'Resolved' || selectedTicket.status === 'Closed') && !selectedTicket.closureSummary && (
              <TouchableOpacity 
                style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#16A34A', borderStyle: 'dashed', marginBottom: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                onPress={handleGenerateMissingSummary}
                disabled={isGeneratingSummary}
              >
                {isGeneratingSummary ? (
                  <ActivityIndicator color="#16A34A" size="small" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="sparkles" size={16} color="#16A34A" style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: '#16A34A', fontWeight: '600', fontSize: 13 }}>
                  {isGeneratingSummary ? 'Generating Summary...' : 'Generate Missing Closure Summary'}
                </Text>
              </TouchableOpacity>
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
                  {renderMessage(msg, idx, isHighlighted)}
                </View>
              );
            })}
            
            {isAdminTyping && (
              <View style={styles.typingIndicator}>
                <Text style={styles.typingText}>Admin is typing...</Text>
              </View>
            )}

            {/* ⭐ CSAT Rating (Only for closed tickets & actual users) */}
            {isClosed && !isAgent && !selectedTicket.rating && (
              <View style={styles.csatCard}>
                <Text style={styles.csatTitle}>How was our support?</Text>
                <View style={styles.csatStarsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setCsatRating(star)}>
                      <Ionicons 
                        name={star <= csatRating ? "star" : "star-outline"} 
                        size={32} 
                        color={star <= csatRating ? "#F59E0B" : "#D1D5DB"} 
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                {csatRating > 0 && (
                  <>
                    <TextInput
                      value={csatFeedback}
                      onChangeText={setCsatFeedback}
                      placeholder="Any additional feedback? (optional)"
                      style={styles.csatFeedbackInput}
                      multiline
                      numberOfLines={2}
                    />
                    <TouchableOpacity 
                      style={[styles.csatSubmitBtn, isSubmittingRating && styles.csatSubmitBtnDisabled]} 
                      onPress={() => handleRateTicket(csatRating)}
                      disabled={isSubmittingRating}
                      testID="support.ticket.submit"
                    >
                      {isSubmittingRating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.csatSubmitBtnText}>Submit Feedback</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Completed Rating Display */}
            {(selectedTicket.rating > 0) && (
              <View style={styles.csatRatedCard}>
                <Text style={styles.csatRatedText}>
                  You rated this {selectedTicket.rating} {selectedTicket.rating === 1 ? 'star' : 'stars'}
                </Text>
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
                  onKeyPress={(e) => {
                    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
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

        <Modal transparent visible={showEscalateModal} animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.closureBox}>
                    <View style={[styles.confirmIcon, { backgroundColor: '#FEE2E2' }]}>
                        <Ionicons name="alert-circle" size={32} color="#EF4444" />
                    </View>
                    <Text style={styles.confirmTitle}>Escalate Ticket</Text>
                    <Text style={styles.confirmSub}>Provide a reason for escalation to prioritize this issue.</Text>
                    
                    <View style={{ width: '100%', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                        <TouchableOpacity 
                            style={[styles.filterBtn, escalationTarget === 'admin' && styles.filterBtnActive]}
                            onPress={() => setEscalationTarget('admin')}
                        >
                            <Text style={[styles.filterBtnText, escalationTarget === 'admin' && styles.filterBtnTextActive]}>System Admin</Text>
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        value={escalationReason}
                        onChangeText={setEscalationReason}
                        placeholder="Reason for escalation..."
                        style={styles.closureInput}
                        multiline
                        numberOfLines={3}
                    />

                    <View style={styles.confirmActions}>
                        <TouchableOpacity 
                           onPress={() => {
                             setShowEscalateModal(false);
                             setEscalationReason('');
                           }} 
                           style={styles.confirmNo}
                        >
                            <Text style={styles.confirmNoText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                           onPress={handleEscalate} 
                           disabled={isEscalating}
                           style={[styles.confirmYes, { backgroundColor: '#EF4444' }]}
                        >
                            {isEscalating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.confirmYesText}>Escalate</Text>}
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

// Styles extracted to ./tickets/SupportTicketSystem.styles.js
