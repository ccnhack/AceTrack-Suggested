/**
 * 💬 PartnerChatModal (v2.6.615)
 * 
 * A full-screen modal chat window for doubles partners to communicate
 * within a tournament context. Chat persists until the tournament date elapses.
 * 
 * Props:
 *   visible       - Modal visibility
 *   onClose       - Close handler
 *   user          - Current user object
 *   partnerId     - Partner's player ID
 *   partnerName   - Partner's display name
 *   tournamentId  - Tournament ID for scoping chat
 *   tournamentTitle - Tournament title for display
 *   tournamentDate  - Tournament date (for expiry check)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import config from '../config';
import storage from '../utils/storage';

const PartnerChatModal = ({
  visible,
  onClose,
  user,
  partnerId,
  partnerName,
  tournamentId,
  tournamentTitle,
  tournamentDate
}) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatExpired, setChatExpired] = useState(false);
  const flatListRef = useRef(null);

  const userLower = user?.id ? String(user.id).toLowerCase() : '';

  // Check if chat has expired
  useEffect(() => {
    if (tournamentDate) {
      const tDate = new Date(tournamentDate);
      const buffer = new Date(tDate);
      buffer.setDate(buffer.getDate() + 1);
      if (new Date() > buffer) {
        setChatExpired(true);
      }
    }
  }, [tournamentDate]);

  // Load messages on mount
  const fetchMessages = useCallback(async () => {
    if (!tournamentId || !user?.id) return;

    try {
      setLoading(true);
      const token = await storage.getItem('userToken');
      const res = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tournamentId}/partner-chat`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-User-Id': user.id
        },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('[PartnerChat] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, user?.id]);

  useEffect(() => {
    if (visible) {
      fetchMessages();
    }
  }, [visible, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Listen for real-time messages
  useEffect(() => {
    const handleNewMessage = (data) => {
      if (data && data.tournamentId === tournamentId && data.message) {
        setMessages(prev => {
          // Avoid duplicates just in case
          const exists = prev.some(m => m._id === data.message._id);
          if (exists) return prev;
          return [...prev, data.message];
        });
      }
    };

    // Need to import socketService at the top
    const { socketService } = require('../services/sync/SocketService');
    socketService.on('partner_chat_message', handleNewMessage);
    return () => {
      socketService.off('partner_chat_message', handleNewMessage);
    };
  }, [tournamentId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || chatExpired) return;

    // Optimistic update
    const optimisticMsg = {
      _id: `temp_${Date.now()}`,
      senderId: userLower,
      senderName: user.name || 'You',
      receiverId: partnerId,
      content: text,
      timestamp: new Date().toISOString(),
      _pending: true
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setInputText('');
    Keyboard.dismiss();

    try {
      setSending(true);
      const token = await storage.getItem('userToken');
      const res = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tournamentId}/partner-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Id': user.id
        },
        credentials: 'include',
        body: JSON.stringify({ content: text })
      });
      const data = await res.json();

      if (data.success) {
        // Replace optimistic message with server response
        setMessages(prev =>
          prev.map(m => m._id === optimisticMsg._id ? { ...data.message, _pending: false } : m)
        );
      } else {
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m._id !== optimisticMsg._id));
      }
    } catch (err) {
      console.error('[PartnerChat] Send error:', err);
      setMessages(prev => prev.filter(m => m._id !== optimisticMsg._id));
    } finally {
      setSending(false);
    }
  };

  const renderMessage = useCallback(({ item }) => {
    const isMine = String(item.senderId).toLowerCase() === userLower;
    return (
      <View style={[styles.messageBubbleRow, isMine ? styles.myRow : styles.theirRow]}>
        <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
          {!isMine && (
            <Text style={styles.senderName}>{item.senderName || partnerName}</Text>
          )}
          <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
            {item.content}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.timeText, isMine ? styles.myTimeText : styles.theirTimeText]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item._pending && (
              <Ionicons name="time-outline" size={10} color="#A5B4FC" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  }, [userLower, partnerName]);

  const keyExtractor = useCallback((item) => item._id || item.id || `${item.timestamp}_${item.senderId}`, []);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.headerName} numberOfLines={1}>{partnerName || 'Partner'}</Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {tournamentTitle}
              </Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              styles.messagesList,
              messages.length === 0 && styles.emptyList
            ]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="chatbubbles-outline" size={36} color="#A5B4FC" />
                </View>
                <Text style={styles.emptyTitle}>Start a conversation</Text>
                <Text style={styles.emptySubtitle}>
                  Coordinate with {partnerName || 'your partner'} about the upcoming tournament
                </Text>
              </View>
            }
          />
        )}

        {/* Input Bar */}
        {chatExpired ? (
          <View style={styles.expiredBar}>
            <Ionicons name="lock-closed" size={14} color="#94A3B8" />
            <Text style={styles.expiredText}>Chat expired — tournament has concluded</Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={true}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  messageBubbleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  theirRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  senderName: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366F1',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  myText: {
    color: '#FFFFFF',
  },
  theirText: {
    color: '#1E293B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  myTimeText: {
    color: '#C7D2FE',
  },
  theirTimeText: {
    color: '#94A3B8',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  expiredBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  expiredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default React.memo(PartnerChatModal);
