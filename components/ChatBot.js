import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, KeyboardAvoidingView, Platform, 
  SafeAreaView, ActivityIndicator, Dimensions,
  Animated, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { generateAIResponse } from '../services/aiService';
import config from '../config';
import { isTournamentPast, getVisibleTournaments, parseTournamentDate } from '../utils/tournamentUtils';
import { useTournaments } from '../context/TournamentContext';
import { usePlayers } from '../context/PlayerContext';
import { useEvaluations } from '../context/EvaluationContext';
import { useSupport } from '../context/SupportContext';

const { width } = Dimensions.get('window');

// Premium Markdown-lite Renderer
const MarkdownText = ({ text, isUser }) => {
  if (!text) return null;

  const lines = text.split('\n');
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, idx) => {
        const trimmedLine = line.trim();
        
        // Spacer for actual empty lines to improve readability (breathability)
        if (line === '') return <View key={idx} style={{ height: 10 }} />;
        if (!trimmedLine) return null;

        // Header handling (###)
        if (trimmedLine.startsWith('###')) {
          return (
            <Text key={idx} style={[styles.headerText, { fontWeight: '900', color: '#0F172A', marginTop: 12, marginBottom: 4 }]}>
              {trimmedLine.replace('###', '').trim().toUpperCase()}
            </Text>
          );
        }
        
        // Bullet handling (* or -)
        const isBullet = trimmedLine.startsWith('*') || trimmedLine.startsWith('-');
        let content = trimmedLine;
        if (isBullet) {
          content = '• ' + trimmedLine.substring(1).trim();
        }

        // Bold handling (**text**)
        const parts = content.split(/(\*\*.*?\*\*)/g);
        
        return (
          <Text key={idx} style={[
            styles.messageText, 
            isUser ? styles.userText : styles.modelText,
            { lineHeight: 22 }, // Increased breathability
            isBullet && { marginLeft: 16, color: '#334155' }
          ]}>
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <Text key={pIdx} style={{ fontWeight: '900', color: '#0F172A' }}>
                    {part.slice(2, -2)}
                  </Text>
                );
              }
              return part;
            })}
          </Text>
        );
      })}
    </View>
  );
};

const TournamentCard = ({ tournament, onNavigate, userRole, userId }) => {
  if (!tournament) return null;

  let btnLabel = "View & Register";
  if (userRole === 'academy') {
    btnLabel = "View Details";
  } else if (userRole === 'coach') {
    const isAssigned = tournament.assignedCoachId || (tournament.assignedCoachIds && tournament.assignedCoachIds.length > 0);
    btnLabel = isAssigned ? "View Details" : "View and Accept";
  }

  return (
    <View style={styles.actionCard}>
      <View style={styles.actionCardHeader}>
        <Ionicons name="trophy" size={20} color="#F59E0B" />
        <Text style={styles.actionCardTitle}>{tournament.title}</Text>
      </View>
      <View style={styles.actionCardBody}>
        <Text style={styles.actionCardText}><Ionicons name="calendar-outline" size={12} /> {tournament.date}</Text>
        <Text style={styles.actionCardText}><Ionicons name="location-outline" size={12} /> {tournament.location}</Text>
        <Text style={styles.actionCardText}><Ionicons name="cash-outline" size={12} /> ₹{tournament.entryFee}</Text>
      </View>
      <TouchableOpacity 
        style={styles.actionCardButton} 
        onPress={() => onNavigate(tournament)}
      >
        <Text style={styles.actionCardButtonText}>{btnLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const TicketPromptCard = ({ type, description, onConfirm, onCancel }) => {
  return (
    <View style={styles.promptCard}>
      <Text style={styles.promptText}>
        Would you like me to raise a {type} ticket for you?
      </Text>
      <View style={styles.promptActions}>
        <TouchableOpacity style={styles.promptBtnYes} onPress={onConfirm}>
          <Text style={styles.promptBtnText}>YES, RAISE IT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.promptBtnNo} onPress={onCancel}>
          <Text style={styles.promptBtnText}>NO, THANKS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ChatBot = ({ 
  user, userRole, userId, userSports
}) => {
  const { tournaments } = useTournaments();
  const { players } = usePlayers();
  const { evaluations } = useEvaluations();
  const { chatbotMessages, onSendChatMessage, onSaveTicket } = useSupport();

  const [isOpen, setIsOpen] = useState(false);
  const navigation = useNavigation();
  const initialMessage = { role: 'model', text: 'Hi! I am your AceTrack assistant. Ask me anything about tournaments, rules, or training tips!' };
  const messages = (chatbotMessages && user && chatbotMessages[user.id]) || [initialMessage];
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [handledActions, setHandledActions] = useState(new Set()); // Track message timestamps that were acted upon
  const scrollViewRef = useRef(null);
  const prevMessagesCountRef = useRef(messages.length);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  
  // 🖐️ DRAGGABLE LOGIC (v2.6.25)
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only take control if there's actual movement (avoids stealing taps)
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      }
    })
  ).current;

  useEffect(() => {
    const opened = isOpen && !prevIsOpen;
    const newMsg = messages.length > prevMessagesCountRef.current;
    
    if (scrollViewRef.current && (opened || newMsg)) {
       setTimeout(() => {
         scrollViewRef.current?.scrollToEnd({ animated: true });
       }, 100);
    }
    setPrevIsOpen(isOpen);
    prevMessagesCountRef.current = messages.length;

    // Check for actions in the latest message
    if (newMsg && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'model' && lastMsg.text.includes('ACTION:')) {
        handleActionTriggers(lastMsg.text);
      }
    }
  }, [messages, isOpen]);

  const handleActionTriggers = (text) => {
    // 1. Navigation Action: ACTION:NAV_TO_TOURNAMENT (REMOVED: Automatic navigation is disabled for a smoother UX)
    // 2. Ticket Action: ACTION:RAISE_TICKET TYPE:DESCRIPTION
    // Logic moved to render layer for user confirmation
    console.log("🤖 [ChatBot] Detected AI Action Trigger:", text.match(/ACTION:[A-Z_]+/)?.[0]);
  };

  const handleConfirmTicket = (type, description, msgTimestamp) => {
    if (!onSaveTicket) return;
    
    onSaveTicket({
      id: `ticket_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      type: type,
      title: description.length > 50 ? description.substring(0, 47) + '...' : description,
      description: description,
      status: 'Open',
      date: new Date().toISOString(),
      messages: [{
        senderId: user.id,
        text: `(Raised via AI Chat) ${description}`,
        timestamp: new Date().toISOString()
      }]
    });
    
    setHandledActions(prev => new Set(prev).add(msgTimestamp));
    // Provide immediate feedback in chat
    const feedbackMsg = `I've raised a ${type} ticket for you. Our team will look into it shortly.`;
    const newMessages = [...messages, { role: 'model', text: feedbackMsg }];
    onSendChatMessage(newMessages);
  };

  const cleanMessage = (text) => {
    if (!text) return '';
    // Hide all ACTION: triggers (including ID: and TYPE: suffixes) and technical ID mentions
    return text
      .replace(/ACTION:[A-Z_]+\s+ID:[a-zA-Z0-9_-]+/g, '')
      .replace(/ACTION:[A-Z_]+\s+[^:]+:.+/g, '')
      .replace(/(?:Tournament\s+)?ID:\s*[a-zA-Z0-9_-]+/gi, '')
      .trim();
  };

  const getTournamentsFromAction = (text) => {
    // Collect all unique tournament IDs from the message (avoiding trailing punctuation)
    const matches = text.match(/ACTION:NAV_TO_TOURNAMENT\s+ID:([a-zA-Z0-9_-]+)/g);
    if (!matches || !tournaments) return [];

    const ids = matches.map(m => m.split('ID:').pop());
    const selected = tournaments.filter(t => ids.includes(String(t.id)));
    
    // Consistency check: only show cards for tournaments that would be visible in Explore
    const currentUser = userId ? players.find(p => p.id === userId) : null;
    return getVisibleTournaments({
      tournaments: selected,
      userRole,
      userGender: user?.gender,
      userSports,
      now: new Date()
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', text: userMsg }];
    onSendChatMessage(newMessages); // Pushes to cloud global state
    setIsLoading(true);

      try {
        const openTournaments = getVisibleTournaments({
          userRole,
          userGender: user?.gender,
          userSports,
          now: new Date()
        });

        console.log(`🤖 [ChatBot] Context: ${openTournaments.length} open/relevant tournaments found out of ${tournaments?.length || 0} total.`);
        if (__DEV__ && userRole?.toLowerCase() === 'admin') {
           console.log(`🤖 [ChatBot] Admin Mode Context: ${openTournaments.length} matches.`);
        }

      const tournamentContext = openTournaments.slice(0, 10).map(t =>
        `- ID: ${t.id}, Title: ${t.title}, Sport: ${t.sport}, Date: ${t.date}, Location: ${t.location}, Entry Fee: ₹${t.entryFee}`
      ).join('\n');

      const systemInstruction = `You are the Ace Assistant, a highly intelligent and helpful chatbot integrated directly into the AceTrack mobile app.
AceTrack is a premier Badminton Academy Management, Tournament Tracking, and Player Analytics platform.

Current Active Tournaments:
${tournamentContext}

Special Protocol Instructions:
1. Tournament Recommendation: You MUST ONLY recommend tournaments listed in the 'Current Active Tournaments' section above. If the list is empty or doesn't match the user's specific request, inform them that no matching local tournaments are currently available. 
   - NEVER invent fake tournaments, IDs, or details.
   - For EACH recommended tournament, you MUST add "ACTION:NAV_TO_TOURNAMENT ID:ID" at the end of your message (where ID is the ID from the list). 
2. IMPORTANT: DO NOT include the technical 'ID' (e.g., t1, t_123) in your visible verbal response. Use it ONLY in the ACTION:NAV_TO_TOURNAMENT code.
3. Support Tickets: If a user has a technical issue, bug, or payment problem, confirm you'll help and add "ACTION:RAISE_TICKET TYPE:DESCRIPTION" at the end.
   - TYPE must be one of: [Technical Issue, Bug, Refund, Payment Issue, Other].
   - DESCRIPTION must be a one-sentence summary of their problem.

General App Knowledge:
1. Tournaments: Automated scheduling, draws, and live digital scoring.
2. Analytics: Match Videos with AI-generated Highlights (smashes, drop shots, rallies).
3. Wallet: Users top-up credits to unlock premium match videos/AI highlights.
4. User Context: The user is ${user.name} (${user.role}). Preferred Sports: ${user.certifiedSports?.join(', ') || user.managedSports?.join(', ') || 'All Sports'}.

Keep answers concise, premium, and friendly. Use ### for headers and **bold** for emphasis. NEVER show technical tournament IDs in the text bubble. If you cannot find a tournament in the context, do not make one up.`;

      const messagesWithContext = [
        { role: 'system', text: systemInstruction },
        ...newMessages.slice(-5).map(m => ({ role: m.role, text: m.text })) // Last 5 for context window efficiency
      ];

      const aiText = await generateAIResponse(messagesWithContext);
      const finalMessages = [...newMessages, { role: 'model', text: aiText }];
      onSendChatMessage(finalMessages); // Sync AI response to cloud
    } catch (e) {
      console.error("AI Assistant Error:", e);
      let errorMsg = `AI Service Error: ${e.message || "Unknown error"}`;
      const errorMessages = [...newMessages, { role: 'model', text: errorMsg, isError: true }];
      onSendChatMessage(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigateToTournament = (t) => {
    setIsOpen(false);
    // Deep linking to Explore tab with the tournament ID
    navigation.navigate('Explore', { selectedTournamentId: t.id });
  };

  return (
    <>
      {/* 🚀 Draggable FAB (v2.6.25) */}
      {!isOpen && (
        <Animated.View 
          style={[styles.fab, { transform: pan.getTranslateTransform() }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => setIsOpen(true)}
            style={styles.fabInner}
          >
            <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Chat Modal */}
      <Modal visible={isOpen} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleContainer}>
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Ace Assistant</Text>
                  <View style={styles.statusContainer}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.statusText}>AceTrack Engine • Online</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.messageArea}
              contentContainerStyle={styles.messageContent}
            >
              {messages.map((m, i) => {
                const recommendedTournaments = m.role === 'model' ? getTournamentsFromAction(m.text) : [];
                const ticketMatch = m.role === 'model' ? m.text.match(/ACTION:RAISE_TICKET\s+([^:]+):(.+)/) : null;
                const cleanedText = cleanMessage(m.text);
                const msgKey = m.timestamp || `msg-${i}`;

                return (
                  <View key={msgKey} style={[styles.messageRow, m.role === 'user' ? styles.userRow : styles.modelRow]}>
                    <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.modelBubble]}>
                      <MarkdownText
                        text={cleanedText}
                        isUser={m.role === 'user'}
                      />
                      
                      {/* Interactive Tournament Recommendations */}
                      {recommendedTournaments.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.carouselContainer}
                          contentContainerStyle={styles.carouselContent}
                        >
                          {recommendedTournaments.map(t => (
                            <TournamentCard
                              key={t.id}
                              tournament={t}
                              onNavigate={handleNavigateToTournament}
                              userRole={userRole}
                              userId={userId}
                            />
                          ))}
                        </ScrollView>
                      )}

                      {/* Interactive Ticket Confirmation Prompt */}
                      {ticketMatch && !handledActions.has(msgKey) && (
                        <TicketPromptCard 
                          type={ticketMatch[1].trim()}
                          description={ticketMatch[2].trim()}
                          onConfirm={() => handleConfirmTicket(ticketMatch[1].trim(), ticketMatch[2].trim(), msgKey)}
                          onCancel={() => setHandledActions(prev => new Set(prev).add(msgKey))}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
              {isLoading && (
                <View style={styles.modelRow}>
                  <View style={[styles.bubble, styles.modelBubble, styles.loadingBubble]}>
                    <ActivityIndicator size="small" color="#64748B" />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputArea}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask about tournaments, report issues..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                <TouchableOpacity 
                  onPress={handleSend}
                  disabled={!input.trim() || isLoading}
                  style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 60,
    height: 60,
    backgroundColor: '#0F172A',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fabInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
  },
  messageArea: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8FAFC',
  },
  messageContent: {
    gap: 16,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  modelRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 20, // Slightly less round for a more structured premium look
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  userBubble: {
    backgroundColor: '#0F172A',
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9', // Subtle border for definition
  },
  loadingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  userText: {
    color: '#FFFFFF',
  },
  modelText: {
    color: '#334155',
  },
  inputArea: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#EF4444',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  // Ticket Prompt Styles
  promptCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  promptText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9A3412',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  promptActions: {
    flexDirection: 'row',
    gap: 12,
  },
  promptBtnYes: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 2,
  },
  promptBtnNo: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 2,
  },
  promptBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 11,
  },
  // Action Card Styles
  carouselContainer: {
    marginTop: 12,
    marginBottom: 4,
  },
  carouselContent: {
    paddingRight: 16,
    gap: 12,
  },
  actionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: width * 0.65,
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  actionCardBody: {
    gap: 4,
    marginBottom: 12,
  },
  actionCardText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  actionCardButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionCardButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});

export default ChatBot;
