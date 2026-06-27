import React from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import styles from '../grievances/AdminGrievancesPanel.styles';
import { statusColors, statusOptions, formatTicketDateFull } from '../grievances/constants';

export const TicketDetailView = ({
  selectedTicket,
  setSelectedTicket,
  isSearchingChat,
  setIsSearchingChat,
  chatSearchText,
  setChatSearchText,
  searchMatchIndices,
  activeMatchIndex,
  handlePrevMatch,
  handleNextMatch,
  getUserName,
  formatTicketDateFull,
  statusColors,
  statusOptions,
  showStatusConfirm,
  setShowStatusConfirm,
  pendingStatus,
  setPendingStatus,
  handleStatusUpdate,
  onDetailToggle,
  currentUser,
  isUserTyping,
  replyText,
  setReplyText,
  onTypingStart,
  onTypingStop,
  showPlusMenu,
  setShowPlusMenu,
  selectedImage,
  setSelectedImage,
  isGeneratingSummary,
  generateSummary,
  sendMessage,
  reopenJustification,
  setReopenJustification,
  showReopenModal,
  setShowReopenModal,
  pendingReopenStatus,
  setPendingReopenStatus,
  swipeableRefs,
  messageYOffsets,
  scrollViewRef,
  textInputRef,
  formatMessageTime,
  handleDocumentPick,
  isSending,
  isTyping,
  handleCameraPick
}) => {
  const isTicketClosed = selectedTicket?.status === 'Closed' || selectedTicket?.status === 'Resolved';
  const ticketClosedDate = selectedTicket?.closedAt || selectedTicket?.resolvedAt || selectedTicket?.updatedAt;
  const daysSinceTicketClosed = isTicketClosed && ticketClosedDate ? Math.floor((Date.now() - new Date(ticketClosedDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isPermanentlyClosed = isTicketClosed && daysSinceTicketClosed >= 3;

  return (
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
                        {(() => {
                          if (isPermanentlyClosed) {
                            return (
                              <View style={{ marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                                  <Ionicons name="lock-closed" size={16} color="#DC2626" style={{ marginRight: 10 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '700' }}>Case cannot be reopened</Text>
                                    <Text style={{ color: '#991B1B', fontSize: 11, marginTop: 2 }}>Closed {daysSinceTicketClosed} days ago — the 3-day reopen window has expired.</Text>
                                  </View>
                                </View>
                                <View style={[styles.statusBtnRow, { opacity: 0.4, marginTop: 8 }]} pointerEvents="none">
                                  {statusOptions.map(s => (
                                    <View
                                      key={s}
                                      style={[
                                        styles.statusToggleBtn, 
                                        selectedTicket.status === s ? { backgroundColor: statusColors[s].bg, borderColor: statusColors[s].border } : styles.statusToggleBtnOff
                                      ]}
                                    >
                                      <Text style={[styles.statusToggleText, { color: selectedTicket.status === s ? statusColors[s].text : '#94A3B8' }]}>{s}</Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            );
                          }

                          return (
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
                          );
                        })()}
                      </View>

                      <View style={[styles.statusControl, { marginTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 }]}>
                         <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                           {((currentUser?.role === 'admin' || currentUser?.id === 'admin') && !isPermanentlyClosed) ? (
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
                               <Text 
                                 style={{ color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 8, flexShrink: 1 }}
                                 numberOfLines={1}
                                 ellipsizeMode="tail"
                               >
                                 {selectedTicket.assignedTo ? `Assigned: ${getUserName(selectedTicket.assignedTo)}` : 'Assign Agent'}
                               </Text>
                               <Ionicons name="chevron-down" size={14} color="#FFF" style={{ marginLeft: 8, opacity: 0.8 }} />
                             </TouchableOpacity>
                           ) : (
                             <>
                               {selectedTicket.assignedTo && selectedTicket.assignedTo !== 'Unassigned' && selectedTicket.assignedTo !== '' && (
                                 <View style={{ 
                                   flexDirection: 'row', 
                                   alignItems: 'center', 
                                   backgroundColor: '#F1F5F9', 
                                   paddingHorizontal: 16, 
                                   paddingVertical: 10, 
                                   borderRadius: 12,
                                   borderWidth: 1,
                                   borderColor: '#E2E8F0',
                                   marginRight: 8
                                 }}>
                                   <Ionicons name="person" size={16} color="#64748B" />
                                   <Text style={{ color: '#475569', fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
                                     {selectedTicket.assignedTo === currentUser?.id ? 'Assigned to You' : `Assigned: ${getUserName(selectedTicket.assignedTo)}`}
                                   </Text>
                                 </View>
                               )}
                               
                               {(currentUser?.role === 'support' && selectedTicket.assignedTo !== currentUser?.id && !isPermanentlyClosed) && (
                                 <TouchableOpacity 
                                   onPress={async () => {
                                     const res = await onReassignTicket(selectedTicket.id, currentUser.id);
                                     if (res.success) {
                                       setSelectedTicket(prev => prev ? { ...prev, assignedTo: currentUser.id } : null);
                                       Alert.alert("Success", "Ticket reassigned to you.");
                                     } else {
                                       Alert.alert("Error", res.error);
                                     }
                                   }}
                                   style={{ 
                                     flexDirection: 'row', 
                                     alignItems: 'center', 
                                     backgroundColor: '#10B981', 
                                     paddingHorizontal: 16, 
                                     paddingVertical: 10, 
                                     borderRadius: 12,
                                     shadowColor: '#10B981',
                                     shadowOffset: { width: 0, height: 4 },
                                     shadowOpacity: 0.2,
                                     shadowRadius: 8,
                                     elevation: 4
                                   }}
                                 >
                                   <Ionicons name="hand-right-outline" size={16} color="#FFF" />
                                   <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
                                     {(!selectedTicket.assignedTo || selectedTicket.assignedTo === 'Unassigned' || selectedTicket.assignedTo === '') ? 'Assign to Myself' : 'Reassign to Myself'}
                                   </Text>
                                 </TouchableOpacity>
                               )}
                             </>
                           )}
                         </View>
                      </View>
                    </View>


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
                  </ScrollView>
                </View>

                <KeyboardAvoidingView 
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                  style={styles.flex}
                >
                  <View style={styles.chatContainer}>
                    <FlatList
                      ref={scrollViewRef}
                      data={selectedTicket?.messages || []}
                      keyExtractor={(msg, idx) => `${msg.timestamp || 'no-ts'}-${idx}`}
                      renderItem={({ item: msg, index: idx }) => {
                        const currentMsgDate = new Date(msg.timestamp).toDateString();
                        const prevMsgDate = idx > 0 ? new Date(selectedTicket.messages[idx - 1].timestamp).toDateString() : null;
                        const showDateHeader = currentMsgDate !== prevMsgDate;
                        const isHighlighted = searchMatchIndices[activeMatchIndex] === idx;

                        return (
                          <View 
                            style={isHighlighted && styles.highlightedMessage}
                            onLayout={(e) => { messageYOffsets.current[msg.id || msg.timestamp] = e.nativeEvent.layout.y; }}
                          >
                            {showDateHeader && !chatSearchText && renderDateHeader(msg.timestamp)}
                            {renderMessage(msg, idx)}
                          </View>
                        );
                      }}
                      style={styles.chatScroll}
                      contentContainerStyle={styles.chatScrollContent}
                      onContentSizeChange={() => {
                        if (!isSearchingChat) scrollViewRef.current?.scrollToEnd({ animated: true });
                      }}
                      showsVerticalScrollIndicator={true}
                      initialNumToRender={20}
                      maxToRenderPerBatch={10}
                      windowSize={5}
                      ListFooterComponent={isUserTyping ? (
                        <View style={styles.typingIndicator}>
                          <Text style={styles.typingText}>User is typing...</Text>
                        </View>
                      ) : null}
                    />

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
                            onKeyPress={(e) => {
                              if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                                e.preventDefault();
                                handleSendReply();
                              }
                            }}
                            placeholder="Type a reply..."
                            multiline
                          />
                          <TouchableOpacity 
                            testID="admin.support.reply.submit"
                            style={[styles.sendBtn, (!replyText?.trim() && !selectedImage) && styles.sendDisabled]} 
                            disabled={!replyText?.trim() && !selectedImage}
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

          {interventionModalConfig && (
            <View style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1003 }]}>
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>
                  {interventionModalConfig.type === 'reassign' ? 'Reassign Ticket' : 'Warning'}
                </Text>
                <Text style={styles.confirmBody}>{interventionModalConfig.message}</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity 
                    onPress={() => setInterventionModalConfig(null)} 
                    style={styles.confirmNo}
                  >
                    <Text style={styles.confirmNoText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={async () => {
                      const configType = interventionModalConfig.type;
                      setInterventionModalConfig(null);
                      
                      if (configType === 'reassign') {
                        const reassignRes = await onReassignTicket(selectedTicket.id, currentUser?.id);
                        if (reassignRes?.success) {
                           // Force-update local selectedTicket to reflect new assignee immediately
                           setSelectedTicket(prev => prev ? { ...prev, assignedTo: currentUser?.id, assignedAgentName: currentUser?.name } : prev);
                           await executeSendReply();
                        } else {
                           Alert.alert("Error", reassignRes?.error || "Failed to reassign ticket.");
                        }
                      } else {
                        await executeSendReply();
                      }
                    }} 
                    style={styles.confirmYes}
                  >
                    <Text style={styles.confirmYesText}>
                      {interventionModalConfig.type === 'reassign' ? 'Assign Myself' : 'Yes'}
                    </Text>
                  </TouchableOpacity>
                </View>
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

                  <ScrollView style={styles.agentList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
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
                         const activeTickets = (tickets || []).filter(t => {
                           if (!t) return false;
                           const assigned = String(t.assignedTo || '');
                           return (assigned === String(p.id) || assigned === String(p.username)) && 
                           !['Resolved', 'Closed'].includes(t.status);
                         }).length;
                         return { ...p, activeTickets };
                      })
                      .filter(p => {
                        if (!reassignSearch) return true;
                        const q = reassignSearch.toLowerCase();
                        return p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
                      })
                      .map(agent => {
                        const att = liveAttendanceData?.find(a => String(a.id) === String(agent.id));
                        return (
                          <TouchableOpacity 
                            key={agent.id}
                            style={styles.agentItem}
                            onPress={async (e) => {
                              if (e && e.stopPropagation) e.stopPropagation();
                              console.log(`[Support] Attempting reassignment to ${agent.id} (${agent.name})`);
                              try {
                                const res = await onReassignTicket(selectedTicket.id, agent.id);
                                console.log(`[Support] Reassignment response:`, res);
                                if (res.success) {
                                  // 🛡️ [OPTIMISTIC UPDATE] (v2.6.248)
                                  setSelectedTicket(prev => ({ ...prev, assignedTo: agent.id }));
                                  setShowReassignModal(false);
                                  Alert.alert("Success", `Ticket reassigned to ${agent.name}`);
                                } else {
                                  Alert.alert("Error", res.error || "Failed to reassign ticket.");
                                }
                              } catch (e) {
                                console.error("[Support] Reassignment exception:", e);
                                Alert.alert("Error", "An unexpected error occurred.");
                              }
                            }}
                          >
                            <View style={styles.agentAvatar}>
                              <Text style={styles.agentInitials}>{agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</Text>
                            </View>
                            <View style={styles.agentInfo}>
                              <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                 <Text style={styles.agentUser}>@{agent.username || agent.id}</Text>
                                 <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 6 }} />
                                 <Text style={{ fontSize: 10, color: att?.isCurrentlyOnline ? '#10B981' : (agent.supportStatus === 'leave' || agent.supportStatus === 'on_leave' ? '#F59E0B' : '#64748B'), fontWeight: 'bold', textTransform: 'capitalize' }}>
                                   {att?.isCurrentlyOnline ? 'Online' : (agent.supportStatus === 'leave' || agent.supportStatus === 'on_leave' ? 'On Leave' : 'Offline')}
                                 </Text>
                                 {att?.lastSeen && !att?.isCurrentlyOnline && (
                                    <>
                                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 6 }} />
                                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>Last seen: {new Date(att.lastSeen).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                                    </>
                                 )}
                                 {att?.isCurrentlyOnline && att?.activeSessions?.length > 0 && (
                                    <>
                                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 6 }} />
                                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>Session: {new Date(att.activeSessions[0].startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    </>
                                 )}
                              </View>
                            </View>
                            
                            <View style={styles.premiumBadgeContainer}>
                              <View style={[styles.loadBadge, { backgroundColor: agent.activeTickets > 5 ? '#FEF2F2' : '#F0FDF4' }]}>
                                <Text style={[styles.loadText, { color: agent.activeTickets > 5 ? '#EF4444' : '#22C55E' }]}>
                                  {agent.activeTickets}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    
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
  );
};
