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
import { TicketListView } from './tickets/TicketListView';
import { TicketCreateView } from './tickets/TicketCreateView';
import { TicketDetailView } from './tickets/TicketDetailView';

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
    return <TicketListView {...{
      filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,
      assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,
      listTab, setListTab, availableAgents, isAgent, userId,
      showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,
      handleClaim, statusColors, tickets
    }} />;
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
    return <TicketDetailView {...{
      selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,
      chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,
      handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,
      showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,
      isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,
      csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,
      selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,
      onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,
      escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,
      renderDateHeader: (dateStr) => {
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
      },
      renderMessage, scrollViewRef, isAtBottom, textInputRef
    }} />;
  }
  return null;
}

// Styles extracted to ./tickets/SupportTicketSystem.styles.js
