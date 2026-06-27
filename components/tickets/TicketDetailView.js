import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import config from '../../config';
import { generateAIResponse } from '../../services/aiService';
import styles from "../tickets/SupportTicketSystem.styles";

export const TicketDetailView = (props) => {
  const {
    selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,
    chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,
    handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,
    showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,
    isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,
    csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,
    selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,
    onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,
    escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,
    renderDateHeader, renderMessage, scrollViewRef, isAtBottom, textInputRef
  } = props;
  

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
};
