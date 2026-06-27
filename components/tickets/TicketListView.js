import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../tickets/SupportTicketSystem.styles";

export const TicketListView = (props) => {
  const {
    filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,
    assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,
    listTab, setListTab, availableAgents, isAgent, userId,
    showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,
    handleClaim, statusColors, tickets
  } = props;
  

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
          
          {isAgent && (
            <TouchableOpacity 
              onPress={() => setListTab('Pool')}
              style={[styles.tabBtn, listTab === 'Pool' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, listTab === 'Pool' && styles.tabBtnTextActive]}>Pool</Text>
            </TouchableOpacity>
          )}

          {isAgent && (
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
};
