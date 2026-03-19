import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, KeyboardAvoidingView, Platform, 
  SafeAreaView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { generateAIResponse } from '../services/aiService';
import config from '../config';

const ChatBot = ({ user, evaluations, chatbotMessages, onSendChatMessage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const initialMessage = { role: 'model', text: 'Hi! I am your AceTrack assistant. Ask me anything about tournaments, rules, or training tips!' };
  const messages = (chatbotMessages && user && chatbotMessages[user.id]) || [initialMessage];
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef(null);
  const prevMessagesCountRef = useRef(messages.length);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

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
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', text: userMsg }];
    onSendChatMessage(newMessages); // Pushes to cloud global state
    setIsLoading(true);

    try {
      const systemInstruction = `You are the Ace Assistant, a highly intelligent and helpful chatbot integrated directly into the AceTrack mobile app. 
AceTrack is a premier Badminton Academy Management, Tournament Tracking, and Player Analytics platform.
Key App Features & Highlights you must know about:
1. Tournaments: Automated scheduling, Group/Knockout stages, interactive draws, and live digital scoring/umpiring.
2. Analytics: Players get detailed Match Videos with AI-generated Highlights (smashes, drop shots, rallies) and technical skills evaluation dashboards.
3. Coach Ecosystem: Admins assign coaches to tournaments ("platform" vs "academy" coaches). Coaches submit player evaluations securely.
4. Player Wallet: Users can top-up digital credits to purchase/unlock premium match videos and AI highlights.
5. Roles: Admins (full dashboard access, grievance resolution), Coaches (assignment tracking, evaluations), and Players.
6. Real-time: The app features robust WebSocket syncing, so matches and scores update instantly across all devices.

Your goal is to be incredibly helpful, concise, friendly, and knowledgeable about these features. When a user asks what the app can do, answer dynamically based on this feature list. Keep answers relatively short formatting with markdown.`; 

      const messagesWithContext = [
        { role: 'system', text: systemInstruction },
        ...newMessages.map(m => ({ role: m.role, text: m.text }))
      ];

      const aiText = await generateAIResponse(messagesWithContext);
      const finalMessages = [...newMessages, { role: 'model', text: aiText }];
      onSendChatMessage(finalMessages); // Sync AI response to cloud
    } catch (e) {
      console.error("AI Assistant Error:", e);
      let errorMsg = `AI Service Error: ${e.message || "Unknown error"}`;
      // ... error handling ...
      const errorMessages = [...newMessages, { role: 'model', text: errorMsg, isError: true }];
      onSendChatMessage(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <TouchableOpacity 
          onPress={() => setIsOpen(true)}
          style={styles.fab}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
        </TouchableOpacity>
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
                    <Text style={styles.statusText}>Groq AI • Online (v1.1-GROQ)</Text>
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
              {messages.map((m, i) => (
                <View key={i} style={[styles.messageRow, m.role === 'user' ? styles.userRow : styles.modelRow]}>
                  <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.modelBubble]}>
                    <Text style={[styles.messageText, m.role === 'user' ? styles.userText : styles.modelText]}>
                      {m.text}
                    </Text>
                  </View>
                </View>
              ))}
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
                  placeholder="Ask about rules, strategies..."
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
    padding: 16,
    borderRadius: 20,
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
    borderColor: '#F1F5F9',
  },
  loadingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
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
    borderRadius: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
});

export default ChatBot;
