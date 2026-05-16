import React, { useState, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Image, TextInput, Platform, useWindowDimensions
} from 'react-native';
import { colors, shadows } from '../theme/designSystem';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AdminGrievancesPanel } from '../components/AdminGrievancesPanel';

import { usePlayers } from '../context/PlayerContext';
import { useSupport } from '../context/SupportContext';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import { useCommsStore } from '../stores/useCommsStore';

const SupportDashboardScreen = ({ navigation, route }) => {
  const { players } = usePlayers();
  const { supportTickets, onReplyTicket, onUpdateTicketStatus, onMarkSeen, onReassignTicket } = useSupport();
  const { isCloudOnline, isUsingCloud, lastSyncTime, onManualSync } = useSync();
  const { currentUser } = useAuth();
  
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMobileWeb = isWeb && windowWidth < 1024;
  const [isWebSidebarOpen, setIsWebSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [urlTicketId, setUrlTicketId] = useState(null);

  // 🛡️ [URL_PERSISTENCE] (v2.6.458): Detect ticketId from URL on mount
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const tid = params.get('ticketId');
      if (tid) {
        console.log(`[SupportDashboard] Detected ticketId in URL: ${tid}`);
        setUrlTicketId(tid);
      }
    }
  }, []);

  const handleTicketSelect = (id) => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      if (id) {
        currentUrl.searchParams.set('ticketId', id);
      } else {
        currentUrl.searchParams.delete('ticketId');
      }
      window.history.pushState({}, '', currentUrl.toString());
    }
  };

  const ticketStats = useMemo(() => {
    let tickets = supportTickets || [];
    
    // Apply strict scoping rules for support staff
    if (currentUser?.id !== 'admin') {
      tickets = tickets.filter(t => {
        const isMine = (t.assignedTo && t.assignedTo === currentUser?.id) || 
                       (currentUser?.username && t.assignedTo === currentUser?.username);
        const isUnassigned = (!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === '');
        const isOpen = (t.status === 'Open' || !t.status);
        return isMine || (isUnassigned && isOpen);
      });
    }

    return {
      open: tickets.filter(t => t.status === 'Open' || !t.status).length,
      inProgress: tickets.filter(t => t.status === 'In Progress').length,
      awaiting: tickets.filter(t => t.status === 'Awaiting Response').length,
      resolved: tickets.filter(t => t.status === 'Resolved').length
    };
  }, [supportTickets, currentUser]);

  const { messages } = useCommsStore();
  const totalUnreadChat = useMemo(() => {
    const unreadSenders = new Set(
      (messages || [])
        .filter(m => m.receiverId === currentUser?.id && m.status !== 'seen')
        .map(m => m.senderId)
    );
    return unreadSenders.size;
  }, [messages, currentUser]);

  const renderWebSidebar = () => (
    <>
      {(isMobileWeb && isWebSidebarOpen) && (
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setIsWebSidebarOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        />
      )}
      <View style={{ 
        width: 280, 
        backgroundColor: '#0F172A', 
        height: Platform.OS === 'web' ? '100dvh' : '100%', 
        paddingTop: 32, 
        justifyContent: 'space-between',
        position: isMobileWeb ? 'absolute' : 'relative',
        top: 0,
        bottom: 0,
        left: isMobileWeb ? (isWebSidebarOpen ? 0 : -280) : 0,
        zIndex: 101,
        transition: 'left 0.3s ease-in-out'
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 }}>
            {isMobileWeb ? (
              <TouchableOpacity onPress={() => setIsWebSidebarOpen(false)}>
                <Ionicons name="close" size={28} color="#FFF" style={{ marginRight: 16 }} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="menu" size={28} color="#FFF" style={{ marginRight: 16 }} />
            )}
            <Image source={require('../assets/icon.png')} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 12 }} />
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>ACETRACK</Text>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 12, paddingHorizontal: 12, letterSpacing: 1.5 }}>SUPPORT CENTER</Text>
              
              {/* Tickets - always active */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#6366F1', marginBottom: 4 }}
                onPress={() => { if (isMobileWeb) setIsWebSidebarOpen(false); }}
              >
                <Ionicons name="chatbubbles-outline" size={20} color="#FFF" />
                <Text style={{ marginLeft: 16, fontSize: 14, fontWeight: '700', color: '#FFF', flex: 1 }}>Support Tickets</Text>
                {(ticketStats.open + ticketStats.awaiting) > 0 && (
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{ticketStats.open + ticketStats.awaiting}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Quick stats in sidebar */}
              <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5 }}>QUICK STATS</Text>
                {[
                  { label: 'Open', value: ticketStats.open, color: '#3B82F6' },
                  { label: 'In Progress', value: ticketStats.inProgress, color: '#F59E0B' },
                  { label: 'Awaiting', value: ticketStats.awaiting, color: '#A855F7' },
                  { label: 'Resolved', value: ticketStats.resolved, color: '#10B981' },
                ].map(stat => (
                  <View key={stat.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stat.color, marginRight: 10 }} />
                      <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '500' }}>{stat.label}</Text>
                    </View>
                    <Text style={{ color: '#E2E8F0', fontSize: 16, fontWeight: '800' }}>{stat.value}</Text>
                  </View>
                ))}
              </View>

              {/* Reporting Hierarchy in sidebar */}
              <View style={{ marginTop: 24, paddingHorizontal: 12, paddingBottom: 20 }}>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5 }}>REPORTING HIERARCHY</Text>
                
                {currentUser?.managerId && (() => {
                   const mgr = players?.find(p => String(p.id) === String(currentUser.managerId));
                   return mgr ? (
                     <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                       <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', marginRight: 10, overflow: 'hidden' }}>
                         {mgr.avatar ? <Image source={{uri: mgr.avatar}} style={{width: 28, height: 28}} /> : <Ionicons name="person" size={16} color="#FFF" style={{margin: 6}} />}
                       </View>
                       <View>
                         <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>{mgr.name}</Text>
                         <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>MANAGER</Text>
                       </View>
                     </View>
                   ) : null;
                })()}

                {currentUser?.teamLeadId && (() => {
                   const tl = players?.find(p => String(p.id) === String(currentUser.teamLeadId));
                   return tl ? (
                     <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                       <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', marginRight: 10, overflow: 'hidden' }}>
                         {tl.avatar ? <Image source={{uri: tl.avatar}} style={{width: 28, height: 28}} /> : <Ionicons name="person" size={16} color="#FFF" style={{margin: 6}} />}
                       </View>
                       <View>
                         <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '700' }}>{tl.name}</Text>
                         <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600' }}>TEAM LEAD</Text>
                       </View>
                     </View>
                   ) : null;
                })()}

                {!currentUser?.managerId && !currentUser?.teamLeadId && (
                   <Text style={{ color: '#64748B', fontSize: 12, fontStyle: 'italic', marginBottom: 12 }}>No hierarchy assigned</Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Pinned Bottom Footer Section */}
        <View style={{ 
          paddingHorizontal: 16, 
          paddingTop: 8, 
          paddingBottom: 16, 
          borderTopWidth: 1, 
          borderTopColor: '#1E293B',
          backgroundColor: '#0F172A' 
        }}>
          {/* Chat/Collaborate link */}
          <TouchableOpacity 
            onPress={() => { navigation.navigate('OrgChat'); if (isMobileWeb) setIsWebSidebarOpen(false); }} 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingHorizontal: 12, 
              paddingVertical: 12, 
              borderRadius: 12, 
              backgroundColor: 'rgba(99, 102, 241, 0.15)', 
              borderWidth: 1, 
              borderColor: 'rgba(99, 102, 241, 0.3)',
              marginBottom: 8 
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
              {totalUnreadChat > 0 && (
                <View style={{ 
                  position: 'absolute', 
                  top: -5, 
                  right: -5, 
                  backgroundColor: '#EF4444', 
                  borderRadius: 10, 
                  minWidth: 18, 
                  height: 18, 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: '#0F172A'
                }}>
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>{totalUnreadChat}</Text>
                </View>
              )}
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700' }}>Chat/Collaborate</Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }}>Team Messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#475569" />
          </TouchableOpacity>

          {/* Profile link */}
          <TouchableOpacity 
            onPress={() => { navigation.navigate('Profile'); if (isMobileWeb) setIsWebSidebarOpen(false); }} 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingHorizontal: 12, 
              paddingVertical: 10, 
              borderRadius: 12, 
              backgroundColor: '#1E293B' 
            }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="person" size={16} color="#FFF" />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' }} numberOfLines={1}>{currentUser?.name || 'Support Agent'}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }} numberOfLines={1}>{currentUser?.email || 'Settings'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const content = (
    <View style={styles.container}>
      <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.premiumHeader}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isMobileWeb && (
                  <TouchableOpacity onPress={() => setIsWebSidebarOpen(true)} style={{ marginRight: 16 }}>
                    <Ionicons name="menu" size={28} color="#FFF" />
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={styles.premiumTitle}>Support Hub</Text>
                  <Text style={styles.premiumSubtitle}>Ticket Management & Resolution</Text>
                </View>
              </View>
              
              <View style={styles.badgeRow}>
                <TouchableOpacity 
                  onPress={() => onManualSync?.(true, true)}
                  style={[styles.syncBadge, isCloudOnline ? styles.syncOnline : (isUsingCloud ? styles.syncOffline : styles.syncLocal)]}
                >
                  <Ionicons 
                    name={isCloudOnline ? "cloud-done" : (isUsingCloud ? "cloud-offline" : "server")} 
                    size={10} 
                    color="#FFF" 
                  />
                  <Text style={styles.syncText}>
                    {isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
                  </Text>
                </TouchableOpacity>
                {lastSyncTime && <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>}
              </View>
            </View>
            <View style={styles.headerIcon}>
               <Ionicons name="headset" size={24} color="#FFF" />
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder="Search tickets..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {/* Ticket content */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AdminGrievancesPanel 
          tickets={supportTickets || []}
          players={players || []}
          onReply={onReplyTicket}
          onUpdateStatus={onUpdateTicketStatus}
          onMarkSeen={onMarkSeen}
          onReassignTicket={onReassignTicket}
          currentUser={currentUser}
          seenAdminActionIds={new Set()}
          search={search}
          autoSelectTicketId={urlTicketId}
          onSelect={handleTicketSelect}
          onConsumeTicketId={() => setUrlTicketId(null)}
        />
      </ScrollView>
    </View>
  );

  return isWeb ? (
    <View style={{ flex: 1, flexDirection: isMobileWeb ? 'column' : 'row', backgroundColor: '#F8FAFC', height: '100vh', width: '100vw' }}>
      {renderWebSidebar()}
      <View style={{ flex: 1, padding: isMobileWeb ? 16 : 32, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: isMobileWeb ? 16 : 24, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, overflow: 'hidden' }}>
          {content}
        </View>
      </View>
    </View>
  ) : content;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  premiumHeader: { paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  premiumTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  premiumSubtitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  syncOnline: { backgroundColor: '#10B981' },
  syncOffline: { backgroundColor: '#EF4444' },
  syncLocal: { backgroundColor: '#F59E0B' },
  syncText: { fontSize: 9, fontWeight: '900', color: '#FFF', marginLeft: 4, textTransform: 'uppercase' },
  lastSyncText: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    margin: 16, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 20, 
    ...shadows.sm,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: colors.navy[900], fontWeight: '600' },
  content: { flex: 1 },
});

export default SupportDashboardScreen;
