import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert,
  FlatList
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { generateAIResponse } from '../services/aiService';
import notify from '../utils/notify';
import logger from '../utils/logger';
import { colors, shadows } from '../theme/designSystem';
import config from '../config';
import storage from '../utils/storage';
import QueueManagementDashboard from './QueueManagementDashboard';
import { statusColors, statusOptions, formatTicketDateFull } from './grievances/constants';
import styles from './grievances/AdminGrievancesPanel.styles';
import { TicketDetailView } from './support/TicketDetailView';
import { TicketListItem } from './support/TicketListItem';

export const AdminGrievancesPanel = ({
  tickets, players, onReply, onUpdateStatus, onReassignTicket, onTypingStart, onTypingStop, search, onRetryMessage, onMarkSeen, onDetailToggle, autoSelectUser, autoSelectTicketId, onConsumeTicketId, onConsumeAutoSelect, currentUser, setSeenAdminActionIds, highlightActionTimestamp, onSelect, ...restProps
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
  const [pendingStatus, setPendingStatus] = useState(null);
  const [tempHighlightedId, setTempHighlightedId] = useState(null); // 🔦 Temporary highlight on jump
  const [blinkHighlightedId, setBlinkHighlightedId] = useState(null); // 🔦 Blinking highlight for Session Activities
  const [isBlinkVisible, setIsBlinkVisible] = useState(false);
  const [reopenJustification, setReopenJustification] = useState('');
  const [pendingReopenStatus, setPendingReopenStatus] = useState(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [chatSearchText, setChatSearchText] = useState('');
  const [searchMatchIndices, setSearchMatchIndices] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0); // 0-indexed internal, 1-indexed UI
  const [showQueueDashboard, setShowQueueDashboard] = useState(false);
  const scrollViewRef = useRef(null);
  const textInputRef = useRef(null);
  const messageYOffsets = useRef({}); // 📍 Track message coordinates (v2.6.27)
  const swipeableRefs = useRef({}); // 🛡️ Track swipeable instances for snap-back (v2.6.35)
  const [showReassignModal, setShowReassignModal] = useState(false); // 🛡️ Searchable Reassign (v2.6.242)
  const [reassignSearch, setReassignSearch] = useState('');
  const [liveAttendanceData, setLiveAttendanceData] = useState([]);

  // 🛡️ [AGENT_FILTER_STATE] (v2.6.452)
  const [assignmentScope, setAssignmentScope] = useState('all'); // 'me' | 'all'
  const [filterAgentId, setFilterAgentId] = useState(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [interventionModalConfig, setInterventionModalConfig] = useState(null); // ⚠️ [INTERVENTION_MODAL] (v2.6.649)

  useEffect(() => {
    if (showReassignModal) {
      const fetchLiveAttendance = async () => {
        try {
          const token = await storage.getItem('userToken');
          const headers = { 'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(`${config.API_BASE_URL}/api/v1/support/attendance`, { headers });
          if (res.ok) {
            const data = await res.json();
            setLiveAttendanceData(data.attendance || []);
          }
        } catch (e) {
          console.warn("[AdminGrievancesPanel] Failed to fetch live attendance", e);
        }
      };
      fetchLiveAttendance();
    }
  }, [showReassignModal]);


  // 🛡️ [STABILITY] Sync local selectedTicket with updated props (v2.6.228)
  useEffect(() => {
    if (selectedTicket && tickets) {
      const updated = (tickets || []).find(t => t.id === selectedTicket.id || t._id === selectedTicket.id);
      if (updated) {
        // 🛡️ [SYNC PROTECTION] (v2.6.650 hardened): Accept store assignedTo when it changes,
        // to prevent stale local state from blocking UI refresh after reassignment.
        const storeAssignedTo = updated.assignedTo;
        const localAssignedTo = selectedTicket.assignedTo;
        // If the store's assignedTo is different from local AND different from what it was,
        // the store has a real update (e.g. reassignment happened) — use it.
        const nextAssignedTo = (storeAssignedTo && storeAssignedTo !== localAssignedTo) 
          ? storeAssignedTo 
          : (localAssignedTo || storeAssignedTo);
        
        // Only update if something meaningful changed (e.g. status, messages, assignedTo)
        const hasChanged = updated.status !== selectedTicket.status || 
                           nextAssignedTo !== selectedTicket.assignedTo ||
                           updated.closureSummary !== selectedTicket.closureSummary ||
                           (updated.messages?.length !== selectedTicket.messages?.length);
        
        if (hasChanged) {
          console.log(`[AdminGrievancesPanel] [STABILITY] Syncing local selectedTicket: ${selectedTicket.id}`);
          setSelectedTicket({
            ...updated,
            assignedTo: nextAssignedTo
          });
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

  // 🛡️ [SYNC v2.6.458]: Notify parent of selection for URL persistence
  useEffect(() => {
    if (onSelect) {
      onSelect(selectedTicket?.id || null);
    }
  }, [selectedTicket?.id]);

  // Handle deep-linking auto-selection (v2.6.151 hardened)
  useEffect(() => {
    if (!autoSelectTicketId && !autoSelectUser) return;
    
    const trySelect = () => {
      if (autoSelectTicketId && tickets) {
        // 🛡️ [TYPE_AGNOSTIC_COMPARE] (v2.6.459): Stringify IDs to handle numeric vs string mismatch from URL
        const ticket = (tickets || []).find(t => String(t.id) === String(autoSelectTicketId) || String(t._id) === String(autoSelectTicketId));
        console.log(`[AdminGrievancesPanel] Auto-select attempt for ID: ${autoSelectTicketId}. Tickets available: ${tickets.length}. Found: ${!!ticket}`);
        
        if (ticket) { 
          setSelectedTicket(ticket); 
          onConsumeTicketId?.(); 
          return true; 
        }
      } else if (autoSelectUser && tickets) {
        const userTicket = (tickets || []).find(t => t.userId === autoSelectUser);
        console.log(`[AdminGrievancesPanel] Auto-select attempt for user: ${autoSelectUser}. Found: ${!!userTicket}`);
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
      const timer = setTimeout(() => {
        const success = trySelect();
        if (!success && autoSelectTicketId) {
          console.warn(`[AdminGrievancesPanel] Failed to auto-select ticket ${autoSelectTicketId} after 500ms.`);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoSelectUser, autoSelectTicketId, tickets]);

  // 📜 Auto-scroll on Open/Update (v2.6.26)
  useEffect(() => {
    if (selectedTicket && scrollViewRef.current && typeof scrollViewRef.current.scrollToEnd === 'function') {
      setTimeout(() => {
        if (!isSearchingChat && !highlightActionTimestamp) scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [selectedTicket?.messages?.length]);

  // 🔦 Handle Session Activity highlight
  useEffect(() => {
    if (selectedTicket && highlightActionTimestamp && messageYOffsets.current) {
      const actionTime = new Date(highlightActionTimestamp).getTime();
      let closestMsg = null;
      let minDiff = Infinity;
      
      selectedTicket.messages?.forEach(msg => {
        const msgTime = new Date(msg.timestamp).getTime();
        const diff = Math.abs(msgTime - actionTime);
        // Look within 10 seconds of the action timestamp
        if (diff < minDiff && diff < 10000) { 
          minDiff = diff;
          closestMsg = msg;
        }
      });

      if (closestMsg) {
        const msgId = closestMsg.id || closestMsg.timestamp;
        
        setTimeout(() => {
          const targetY = messageYOffsets.current[msgId];
          if (targetY !== undefined) {
            scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - 50), animated: true });
            
            setBlinkHighlightedId(msgId);
            setIsBlinkVisible(true);
            
            let blinkCount = 0;
            const interval = setInterval(() => {
              setIsBlinkVisible(prev => !prev);
              blinkCount++;
              if (blinkCount >= 5) { // 3 blinks (true->false->true->false->true->false)
                clearInterval(interval);
                setBlinkHighlightedId(null);
                setIsBlinkVisible(false);
              }
            }, 400);
          }
        }, 500); // Wait for rendering
      }
    }
  }, [selectedTicket?.id, highlightActionTimestamp]);

  // 🔍 Conversational Search Logic (v2.6.33)
  useEffect(() => {
    if (chatSearchText?.trim() && selectedTicket?.messages) {
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


  const handleStatusChangeRequest = (status) => {
    // 🛡️ Justification Prompt: Moving from Resolved/Closed back to Active status
    const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
    const isInactive = selectedTicket?.status === 'Resolved' || selectedTicket?.status === 'Closed';
    
    if (isInactive && activeStates.includes(status)) {
      if (selectedTicket?.updatedAt) {
        const updatedTime = new Date(selectedTicket.updatedAt).getTime();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        if (Date.now() - updatedTime > threeDaysMs) {
          Alert.alert("Reopening Denied", "Tickets cannot be reopened after 3 days of being closed or resolved. Please request the user to create a new ticket.");
          return;
        }
      }
      setPendingReopenStatus(status);
      setShowReopenModal(true);
      return;
    }

    // ⚡ Closed → Resolved shortcut: preserve existing summary, no re-generation needed
    if (selectedTicket?.status === 'Closed' && status === 'Resolved') {
      onUpdateStatus(selectedTicket.id, status, selectedTicket.closureSummary || null);
      return;
    }

    // 🛡️ For ANY transition to Resolved or Closed: trigger AI summary generation
    if (status === 'Resolved' || status === 'Closed') {
      setPendingStatus(status);
      setShowStatusConfirm(true);
    } else {
      onUpdateStatus(selectedTicket.id, status);
    }
  };

  const handleReopenSubmit = async () => {
    if (!reopenJustification?.trim()) {
      Alert.alert("Required", "Please provide a justification for reopening this ticket.");
      return;
    }
    // 🛡️ [FIX v2.6.290] Atomic Status + Justification Update
    const statusRes = await onUpdateStatus(selectedTicket.id, pendingReopenStatus, null, reopenJustification?.trim() || '');
    
    if (statusRes && statusRes.success) {
      setShowReopenModal(false);
      setReopenJustification('');
      setPendingReopenStatus(null);
    }
    if (statusRes) {
      notify(statusRes);
    }
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
      // 🛡️ [OPTIMIZATION] (v2.6.291): Limit history to last 20 messages to prevent token overflow
      const recentMessages = (selectedTicket.messages || []).slice(-20);
      let history = recentMessages.map(m => {
        const sender = m.senderId === 'admin' ? 'Admin' : (players.find(p => p.id === m.senderId)?.name || 'User');
        const text = (m.text || '').trim();
        return `${sender}: ${text}`;
      }).filter(line => line.split(': ')[1]).join('\n');
    
      if (!history?.trim()) {
         history = "No messages were exchanged in this ticket.";
      }

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it. Format your response EXACTLY as follows with these headings:\\n\\nProblem Description:\\n(Detail the full scope of issues identified through the conversation, not just the title)\\n\\nTechnical Details:\\n(Numbered bullet points of ACTUAL technical steps, troubleshooting, or fixes suggested/performed. STRICTLY IGNORE polite acknowledgments, 'we will investigate' messages, status changes like 'in progress' or 'closed', and reopening events. Only list concrete actions.)\\n\\nClosure Summary:\\n(Brief summary of only the final resolution details which fixed the issue)" },
        { role: 'user', text: `History:\n${history}` }
      ];
    
      const rawAiSummary = await generateAIResponse(prompt);
      const aiSummary = rawAiSummary ? rawAiSummary?.trim() : "Closure summary was successfully resolved, but AI was unable to generate a summary.";
      const res = await onUpdateStatus(selectedTicket.id, pendingStatus, aiSummary);
      notify(res);
    } catch (e) {
      console.error("AI Resolution Summary Failed:", e);
      const res = await onUpdateStatus(selectedTicket.id, pendingStatus, "Closure summary was successfully resolved, but AI was unable to generate a summary due to an error.");
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
    if (!userId) return 'Unassigned';
    if (String(userId).toLowerCase() === 'admin') return 'System Admin';
    const p = (players || []).find(pl => String(pl.id).toLowerCase() === String(userId).toLowerCase() || (pl.username && String(pl.username).toLowerCase() === String(userId).toLowerCase()));
    if (!p) return userId;
    return p.username ? `${p.name} (${p.username})` : p.name;
  };
  const getUserRole = (userId) => (players || []).find(pl => pl.id === userId || String(pl.id).toLowerCase() === String(userId).toLowerCase())?.role || 'user';

  const isTicketUnread = (ticket) => {
    if (!ticket) return false;
    
    // 🛡️ SYNC (v2.6.227): Dynamically detect admin identity
    const myId = currentUser?.id || 'admin';
    
    // 🛡️ [SESSION READ GATE] (v2.6.561): If the current user opened this ticket
    // in this session, immediately suppress the unread highlight. This is the
    // PRIMARY mechanism for clearing the blue box on the admin view.
    const seenSet = restProps.seenAdminActionIds;
    const wasOpenedThisSession = seenSet?.has ? seenSet.has(String(ticket.id)) : false;
    if (wasOpenedThisSession) return false;

    // 🛡️ [CLOSED STATE GUARD] (v2.6.571): Closed or Resolved tickets are never unread.
    const status = ticket.status || 'Open';
    if (status === 'Closed' || status === 'Resolved') return false;
    
    // 🛡️ [PER-AGENT READ STATE] (v2.6.558)
    const myLastRead = ticket.lastReadBy?.[myId] || (myId === 'admin' && ticket.lastReadBy?.['admin']);
    
    const hasUnreadMessages = (ticket.messages || []).some(m => {
      if (!m || m.senderId === myId || m.type === 'event' || m.senderId === 'system') return false;
      
      // If we have a per-agent read timestamp, check if the message is newer
      if (myLastRead) {
        const msgTime = new Date(m.timestamp || 0).getTime();
        const readTime = new Date(myLastRead).getTime();
        if (!isNaN(msgTime) && !isNaN(readTime)) {
           return msgTime > readTime;
        }
      }
      
      // Legacy fallback for old tickets before per-agent read tracking
      return m.status !== 'seen';
    });
    
    // 🛡️ [FIX v2.6.570] Only consider a ticket "new/unseen" if the agent has NEVER opened it.
    // Previously, ALL Open/Awaiting tickets were forced unread regardless of read state.
    const neverReadByMe = !myLastRead;
    const isNewTicket = neverReadByMe && (status === 'Open' || status === 'Awaiting Response');
    
    return hasUnreadMessages || isNewTicket;
  };

  const scopedTickets = useMemo(() => {
    const allTickets = tickets || [];
    
    // 🛡️ [STRICT SCOPING] (v2.6.452)
    // Non-admins can toggle between 'Me' and 'All' if they have support access
    if (currentUser?.id !== 'admin') {
      if (assignmentScope === 'me') {
        return allTickets.filter(t => {
          const isMine = (t.assignedTo && String(t.assignedTo) === String(currentUser?.id)) || 
                         (currentUser?.username && String(t.assignedTo) === String(currentUser?.username));
          const isUnassigned = (!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === '');
          const isOpen = (t.status === 'Open' || !t.status);
          return isMine || (isUnassigned && isOpen);
        });
      }
      
      // In 'All' scope, filter by specific agent if selected
      if (filterAgentId) {
        return allTickets.filter(t => String(t.assignedTo) === String(filterAgentId));
      }
      
      return allTickets;
    }

    // System Admin Scoping
    if (assignmentScope === 'all' && filterAgentId) {
        return allTickets.filter(t => String(t.assignedTo) === String(filterAgentId));
    }
    if (assignmentScope === 'me') {
        return allTickets.filter(t => t.assignedTo === 'admin' || t.assignedTo === currentUser?.id);
    }
    
    return allTickets;
  }, [tickets, currentUser, assignmentScope, filterAgentId]);

  // 👥 [AGENT_EXTRACTION] (v2.6.452)
  const availableAgents = useMemo(() => {
    const agentsMap = new Map();
    (tickets || []).forEach(t => {
      if (t.assignedTo && t.assignedTo !== 'Unassigned') {
        const name = (players || []).find(p => String(p.id) === String(t.assignedTo) || p.username === t.assignedTo)?.name || t.assignedTo;
        agentsMap.set(String(t.assignedTo), name);
      }
    });
    return Array.from(agentsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tickets, players]);

  const filteredTickets = scopedTickets
    .filter(t => {
      const status = t?.status || 'Open';
      if (filterStatus === 'Unassigned') {
        const isUnassigned = !t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === '';
        const isActive = status !== 'Resolved' && status !== 'Closed'; // 🛡️ [INTELLIGENT FILTER] (v2.6.254)
        return isUnassigned && isActive;
      }
      return filterStatus === 'All' || status === filterStatus;
    })
    .filter(t => {
      if (!search) return true;
      // 🛡️ [VISIBILITY GUARD]: Support-created tickets are invisible to non-admin users
      if (t.creatorRole === 'support' && currentUser?.role !== 'admin') return false;
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

  // 🔍 [GLOBAL_SEARCH_CHECK] (v2.6.454): Check if search term exists outside current caseload
  const globalMatchCount = useMemo(() => {
    if (!search || assignmentScope !== 'me') return 0;
    const q = search.toLowerCase();
    return (tickets || []).filter(t => {
      const title = (t.title || '').toLowerCase();
      const tid = (String(t.id || '')).toLowerCase();
      const conversation = (t.messages || []).some(m => (m.text || '').toLowerCase().includes(q));
      return title.includes(q) || tid.includes(q) || conversation;
    }).length;
  }, [tickets, search, assignmentScope]);

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
    if ((!replyText?.trim() && !selectedImage) || !selectedTicket) return;

    const myRole = currentUser?.role || 'user';
    const myLevel = currentUser?.supportLevel || '';
    
    let isException = ['admin'].includes(myRole.toLowerCase());
    if (!isException && ['manager', 'team lead', 'teamlead'].includes(myLevel.toLowerCase())) {
        if (selectedTicket.assignedTo && selectedTicket.assignedTo !== 'Unassigned') {
            const assignee = (players || []).find(p => String(p.id) === String(selectedTicket.assignedTo) || p.username === selectedTicket.assignedTo);
            if (assignee) {
                const isTheirManager = String(assignee.managerId) === String(currentUser?.id);
                const isTheirTeamLead = String(assignee.teamLeadId) === String(currentUser?.id);
                if (isTheirManager || isTheirTeamLead) {
                    isException = true;
                }
            }
        }
    }
    
    const isAssignedToMe = String(selectedTicket.assignedTo) === String(currentUser?.id) || String(selectedTicket.assignedTo) === String(currentUser?.username);
    const hasAssignee = selectedTicket.assignedTo && selectedTicket.assignedTo !== 'Unassigned' && selectedTicket.assignedTo !== '';

    if (!isException && hasAssignee && !isAssignedToMe) {
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      let consecutiveCount = 0;
      
      const messages = selectedTicket.messages || [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (String(msg.senderId) === String(currentUser?.id)) {
           if (new Date(msg.timestamp).getTime() > fiveMinsAgo) {
             consecutiveCount++;
           } else {
             break;
           }
        } else {
           break;
        }
      }

      if (consecutiveCount >= 2) { 
         setInterventionModalConfig({
           type: 'reassign',
           message: "You have sent 3 messages in a row within 5 mins on a ticket assigned to someone else. Do you want to assign it to yourself to continue?"
         });
         return;
      }
      
      setInterventionModalConfig({
        type: 'warning',
        message: `The ticket is assigned to support agent ${getUserName(selectedTicket.assignedTo)}, are you willing to send the message?`
      });
      return;
    }

    executeSendReply();
  };

  const executeSendReply = async () => {
    const res = await onReply(selectedTicket.id, replyText, selectedImage, replyToMsg);
    if (res.success) {
      setReplyText('');
      setSelectedImage(null);
      setReplyToMsg(null);
    }
  };

  const handleGenerateMissingSummary = async () => {
    if (!selectedTicket) return;
    setIsGeneratingSummary(true);
    
    try {
      let history = (selectedTicket.messages || []).map(m => 
        `${m.senderId === 'admin' ? 'Admin' : 'User'}: ${m.text || ''}`
      ).join('\n');

      if (!history?.trim()) {
         history = "No messages were exchanged in this ticket.";
      }

      const prompt = [
        { role: 'system', text: "You are a professional support analyst. Read the conversation history and summarize it. Format your response EXACTLY as follows with these headings:\\n\\nProblem Description:\\n(Detail the full scope of issues identified through the conversation, not just the title)\\n\\nTechnical Details:\\n(Numbered bullet points of ACTUAL technical steps, troubleshooting, or fixes suggested/performed. STRICTLY IGNORE polite acknowledgments, 'we will investigate' messages, status changes like 'in progress' or 'closed', and reopening events. Only list concrete actions.)\\n\\nClosure Summary:\\n(Brief summary of only the final resolution details which fixed the issue)" },
        { role: 'user', text: `History:\n${history}\n\nThe ticket was closed without a summary. Please generate one based on the history.` }
      ];

      const rawAiSummary = await generateAIResponse(prompt);
      const aiSummary = rawAiSummary ? rawAiSummary?.trim() : "Closure summary was successfully resolved, but AI was unable to generate a summary.";
      
      const res = await onUpdateStatus(selectedTicket.id, selectedTicket.status, aiSummary);
      if (res?.success) {
        Alert.alert("Success", "Closure summary generated successfully");
        setSelectedTicket(prev => ({ ...prev, closureSummary: aiSummary }));
      } else {
        Alert.alert("Error", "Failed to update ticket status with summary");
      }
    } catch (e) {
      console.error("Missing summary generation failed:", e);
      Alert.alert("Error", "Failed to generate summary");
    } finally {
      setIsGeneratingSummary(false);
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
    // 🚀 ACE TRACK STABILITY VERSION (v2.6.436)
    const APP_VERSION = "2.6.436"; 
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
    const myId = currentUser?.id || 'admin';
    const isMe = String(senderId) === String(myId) || (senderId === 'admin' && currentUser?.role === 'admin');
    const senderRole = (senderId === 'admin') ? 'admin' : getUserRole(senderId);
    const isSupport = senderRole === 'support' || senderRole === 'admin';
    const alignRight = isSupport; // All team messages go to the right
    const senderName = isMe ? (currentUser?.name || 'You') : getUserName(senderId);
    const showName = alignRight && !isMe; // Show name only if it's a colleague on the right side

    if (msg.type === 'event' || senderId === 'system' || msg.type === 'internal') {
      const isInternal = msg.type === 'internal';
      const isBlinking = blinkHighlightedId === (msg.id || msg.timestamp) && isBlinkVisible;
      return (
        <View 
          key={msg.id || msg.timestamp || index} 
          style={[
            styles.eventCard, 
            isInternal && styles.internalCard,
            (tempHighlightedId === (msg.id || msg.timestamp)) && styles.highlightedMessage,
            isBlinking && styles.blinkingHighlight
          ]}
          onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
        >
          {isInternal && (
            <View style={styles.internalHeader}>
              <Ionicons name="lock-closed" size={12} color="#475569" />
              <Text style={styles.internalBadge}>INTERNAL NOTE</Text>
            </View>
          )}
          <Text style={[styles.eventText, isInternal && styles.internalText]}>{text}</Text>
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
          renderRightActions={!isClosed && alignRight ? renderRightActions : undefined}
          renderLeftActions={!isClosed && !alignRight ? renderRightActions : undefined}
          onSwipeableOpen={() => {
            if (isClosed) return;
            setReplyToMsg(msg);
            swipeableRefs.current[msg.id || msg.timestamp]?.close();
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
              textInputRef.current?.focus();
            }, 100);
          }}
        >
          <View style={[styles.messageRow, alignRight ? styles.messageMe : styles.messageOther]}>
            <View style={[
              styles.bubble, 
              alignRight ? styles.bubbleMe : styles.bubbleOther,
              (tempHighlightedId === (msg.id || msg.timestamp)) && styles.highlightedMessage,
              (blinkHighlightedId === (msg.id || msg.timestamp) && isBlinkVisible) && styles.blinkingHighlight
            ]}>
              {renderMessageReply(msg.replyTo)}
              {showName && <Text style={[styles.msgSender, { color: 'rgba(255,255,255,0.8)', marginBottom: 2 }]}>{senderName}</Text>}
              {msg.image && (
                <Image source={{ uri: config.sanitizeUrl(msg.image) }} style={styles.msgImage} resizeMode="contain" />
              )}
              <Text style={[styles.msgText, { color: alignRight ? '#FFF' : '#334155' }]}>
                {text?.startsWith('CLOSURE_REQUEST_EVENT:') 
                  ? `User requested closure: ${text.replace('CLOSURE_REQUEST_EVENT:', '').trim()}` 
                  : text}
              </Text>
              <View style={styles.msgFooter}>
                <Text style={[styles.msgTime, { color: alignRight ? 'rgba(255,255,255,0.7)' : '#94A3B8' }]}>
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {isMe && (
                  <View style={styles.statusContainer}>
                    {msg.status === 'pending' ? (
                      <TouchableOpacity onPress={() => onRetryMessage?.(selectedTicket.id, msg.id)}>
                        <Ionicons name="alert-circle" size={14} color="#FFF" />
                      </TouchableOpacity>
                    ) : (
                    <Ionicons 
                      name={['delivered', 'seen'].includes(msg.status) ? "checkmark-done" : "checkmark"} 
                      size={15} 
                      color={msg.status === 'seen' ? "#A5B4FC" : "#FFF"} 
                      style={{ marginLeft: 4, opacity: 0.8 }} 
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

  const renderTicketItem = useCallback(({ item: ticket }) => {
    return (
      <TicketListItem
        ticket={ticket}
        isUnread={isTicketUnread(ticket)}
        getUserName={getUserName}
        onSelect={setSelectedTicket}
      />
    );
  }, [isTicketUnread, setSelectedTicket, getUserName]);


  const isTicketClosed = selectedTicket?.status === 'Closed' || selectedTicket?.status === 'Resolved';
  const ticketClosedDate = selectedTicket?.closedAt || selectedTicket?.resolvedAt || selectedTicket?.updatedAt;
  const daysSinceTicketClosed = isTicketClosed && ticketClosedDate ? Math.floor((Date.now() - new Date(ticketClosedDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isPermanentlyClosed = isTicketClosed && daysSinceTicketClosed >= 3;

  return (
    <View style={styles.container}>
      <TicketDetailView
        selectedTicket={selectedTicket}
        setSelectedTicket={setSelectedTicket}
        isSearchingChat={isSearchingChat}
        setIsSearchingChat={setIsSearchingChat}
        chatSearchText={chatSearchText}
        setChatSearchText={setChatSearchText}
        searchMatchIndices={searchMatchIndices}
        activeMatchIndex={activeMatchIndex}
        handlePrevMatch={handlePrevMatch}
        handleNextMatch={handleNextMatch}
        getUserName={getUserName}
        formatTicketDateFull={formatTicketDateFull}
        statusColors={statusColors}
        statusOptions={statusOptions}
        showStatusConfirm={showStatusConfirm}
        setShowStatusConfirm={setShowStatusConfirm}
        pendingStatus={pendingStatus}
        setPendingStatus={setPendingStatus}
        handleStatusChangeRequest={handleStatusChangeRequest}
        onDetailToggle={onDetailToggle}
        currentUser={currentUser}
        isUserTyping={isUserTyping}
        replyText={replyText}
        setReplyText={setReplyText}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
        showPlusMenu={showPlusMenu}
        setShowPlusMenu={setShowPlusMenu}
        selectedImage={selectedImage}
        setSelectedImage={setSelectedImage}
        isGeneratingSummary={isGeneratingSummary}
        handleGenerateMissingSummary={handleGenerateMissingSummary}
        handleSendReply={handleSendReply}
        reopenJustification={reopenJustification}
        setReopenJustification={setReopenJustification}
        showReopenModal={showReopenModal}
        setShowReopenModal={setShowReopenModal}
        pendingReopenStatus={pendingReopenStatus}
        setPendingReopenStatus={setPendingReopenStatus}
        swipeableRefs={swipeableRefs}
        messageYOffsets={messageYOffsets}
        scrollViewRef={scrollViewRef}
        textInputRef={textInputRef}
        pickImage={pickImage}
        processStatusConfirmation={processStatusConfirmation}
        handleReopenSubmit={handleReopenSubmit}
        handleReassign={handleReassign}
        onReassignTicket={onReassignTicket}
        executeSendReply={executeSendReply}
        setReplyToMsg={setReplyToMsg}
        replyToMsg={replyToMsg}
        getUserRole={getUserRole}
        renderDateHeader={renderDateHeader}
        renderMessage={renderMessage}
        interventionModalConfig={interventionModalConfig}
        setInterventionModalConfig={setInterventionModalConfig}
        tickets={tickets}
        players={players}
        liveAttendanceData={liveAttendanceData}
        reassignSearch={reassignSearch}
        setReassignSearch={setReassignSearch}
        showReassignModal={showReassignModal}
        setShowReassignModal={setShowReassignModal}
        tempHighlightedId={tempHighlightedId}
        setTempHighlightedId={setTempHighlightedId}
        blinkHighlightedId={blinkHighlightedId}
        isBlinkVisible={isBlinkVisible}
        chatSearchText={chatSearchText}
      />

      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: '#EFF6FF' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Open</Text>
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{scopedTickets.filter(t => t && (t.status === 'Open' || !t.status)).length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Active</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{scopedTickets.filter(t => t && t.status === 'In Progress').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#FAF5FF' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Awaiting</Text>
          <Text style={[styles.statValue, { color: '#9333EA' }]}>{scopedTickets.filter(t => t && t.status === 'Awaiting Response').length}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Resolved</Text>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{scopedTickets.filter(t => t && t.status === 'Resolved').length}</Text>
        </View>
      </View>

      {currentUser?.role === 'admin' && (
        <View style={styles.managementBar}>
          <TouchableOpacity 
            onPress={() => setShowQueueDashboard(true)}
            style={styles.queueBtn}
          >
            <Ionicons name="apps-outline" size={16} color="#FFF" />
            <Text style={styles.queueBtnText}>Queue Management</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 🛡️ [SCOPE_TOGGLE] (v2.6.452) */}
      <View style={styles.scopeToggleRow}>
        <View style={styles.scopeButtonGroup}>
          <TouchableOpacity 
            onPress={() => { setAssignmentScope('me'); setFilterAgentId(null); }}
            style={[styles.scopeToggleBtn, assignmentScope === 'me' && styles.scopeToggleBtnActive]}
          >
            <Ionicons name="person" size={14} color={assignmentScope === 'me' ? '#FFF' : '#64748B'} />
            <Text style={[styles.scopeToggleText, assignmentScope === 'me' && styles.scopeToggleTextActive]}>My Caseload</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setAssignmentScope('all')}
            style={[styles.scopeToggleBtn, assignmentScope === 'all' && styles.scopeToggleBtnActive]}
          >
            <Ionicons name="people" size={14} color={assignmentScope === 'all' ? '#FFF' : '#64748B'} />
            <Text style={[styles.scopeToggleText, assignmentScope === 'all' && styles.scopeToggleTextActive]}>Full Team</Text>
          </TouchableOpacity>
        </View>

        {assignmentScope === 'all' && availableAgents.length > 0 && (
          <TouchableOpacity 
            style={styles.agentSelectDropdown}
            onPress={() => setShowAgentPicker(true)}
          >
            <Text style={styles.agentSelectText}>
              {filterAgentId 
                ? `Agent: ${availableAgents.find(a => String(a.id) === String(filterAgentId))?.name?.split(' ')[0]}` 
                : 'All Agents'}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>


      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        {['All', 'Unassigned', ...statusOptions].map(s => {
          const count = scopedTickets.filter(t => {
            if (s === 'All') return true;
            if (s === 'Unassigned') {
              const isUnassigned = !t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === '';
              const isActive = t.status !== 'Resolved' && t.status !== 'Closed'; // 🛡️ [INTELLIGENT FILTER] (v2.6.254)
              return isUnassigned && isActive;
            }
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

      <FlatList
        data={filteredTickets || []}
        extraData={restProps.seenAdminActionIds}
        keyExtractor={(item, idx) => item.id || `temp-${idx}`}
        renderItem={renderTicketItem}
        getItemLayout={(data, index) => ({ length: 90, offset: 90 * index, index })}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#E2E8F0" />
            <Text style={styles.emptyTitle}>
              {search ? 'No matches found' : `No ${filterStatus === 'All' ? 'tickets' : filterStatus.toLowerCase() + ' tickets'}`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search 
                ? `We couldn't find any tickets matching "${search}" in your selected filters.`
                : 'Try adjusting your filters or search query.'}
            </Text>
            
            {globalMatchCount > 0 && assignmentScope === 'me' && (
              <TouchableOpacity 
                style={styles.searchAllFallback}
                onPress={() => {
                  setAssignmentScope('all');
                  setFilterStatus('All');
                }}
              >
                <Text style={styles.searchAllFallbackText}>
                  Found {globalMatchCount} matches in Full Team View. ➔
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <QueueManagementDashboard 
        visible={showQueueDashboard}
        onClose={() => setShowQueueDashboard(false)}
        tickets={tickets}
        players={players}
        onSelectTicket={(ticket) => setSelectedTicket(ticket)}
      />

      {/* 👤 [AGENT_PICKER_MODAL] (v2.6.452) */}
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
                  <Text style={[styles.pickerItemText, String(filterAgentId) === String(agent.id) && styles.pickerItemTextActive]}>{agent.name}</Text>
                  {String(filterAgentId) === String(agent.id) && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// Styles extracted to ./grievances/AdminGrievancesPanel.styles.js
