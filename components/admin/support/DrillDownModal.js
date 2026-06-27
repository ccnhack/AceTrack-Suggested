import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const DrillDownModal = (props) => {
  const { drillDownConfig, setDrillDownConfig, analytics, fetchTeamAnalytics, onOpenTicket, players } = props;
  
  if (!drillDownConfig) return null;
  return (
    <>
      {drillDownConfig && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDrillDownConfig(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{drillDownConfig.title}</Text>
                <TouchableOpacity onPress={() => setDrillDownConfig(null)}>
                  <Ionicons name="close-circle" size={28} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                {(() => {
                  if (!analytics?.tickets) {
                    return (
                      <View style={{ alignItems: 'center', padding: 40 }}>
                        <ActivityIndicator size="large" color="#6366F1" style={{ marginBottom: 16 }} />
                        <Text style={{ color: '#64748B', fontWeight: '600', marginBottom: 20 }}>Synchronizing drill-down data...</Text>
                        <TouchableOpacity 
                          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#EFF6FF', borderRadius: 8 }}
                          onPress={() => fetchTeamAnalytics()}
                        >
                          <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Force Resync</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  let list = analytics.tickets;
                  if (drillDownConfig.category === 'open') list = list.filter(t => ['Open', 'In Progress', 'Awaiting Response'].includes(t.status));
                  else if (drillDownConfig.category === 'resolved') list = list.filter(t => t.status === 'Closed' || t.status === 'Resolved');
                  else if (drillDownConfig.category === 'queue') list = list.filter(t => !t.assignedTo && t.status === 'Open');
                  else if (drillDownConfig.category === 'overdue') {
                    list = list.filter(t => {
                      if (t.status === 'Closed' || t.status === 'Resolved') return false;
                      const created = new Date(t.createdAt);
                      return (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
                    });
                  } else if (drillDownConfig.category === 'type') {
                    list = list.filter(t => (t.type || 'Other') === drillDownConfig.typeStr);
                  } else if (drillDownConfig.category === 'agent-active') {
                    list = list.filter(t => t.assignedTo === drillDownConfig.agentId && ['Open', 'In Progress', 'Awaiting Response'].includes(t.status));
                  } else if (drillDownConfig.category === 'agent-resolved') {
                    list = list.filter(t => t.assignedTo === drillDownConfig.agentId && (t.status === 'Closed' || t.status === 'Resolved'));
                  } else if (drillDownConfig.category === 'agent-rated') {
                    list = list.filter(t => t.assignedTo === drillDownConfig.agentId && t.rating > 0);
                  }
                  
                  if (list.length === 0) return <Text style={styles.emptyAgents}>No tickets match this filter.</Text>;

                  return list.map(t => (
                    <TouchableOpacity 
                      key={t.id} 
                      style={styles.drillTicketCard}
                      onPress={() => {
                        setDrillDownConfig(null);
                        onOpenTicket && onOpenTicket(t.id);
                      }}
                    >
                       <View style={styles.drillTicketHeader}>
                         <Text style={styles.drillTicketId}>#{t.id.slice(-5)}</Text>
                         <Text style={[styles.drillTicketStatus, t.status === 'Open' ? { color: '#3B82F6'} : t.status === 'Closed' || t.status === 'Resolved' ? { color: '#10B981' } : { color: '#F59E0B' }]}>{t.status}</Text>
                       </View>
                       <Text style={styles.drillTicketTitle} numberOfLines={1}>{t.title || 'Untitled Ticket'}</Text>
                        <View style={styles.drillTicketMeta}>
                          <Text style={styles.drillTicketAgent}>Agent: {t.assignedTo ? (players?.find(p => p.id === t.assignedTo)?.name || 'Unknown') : 'Unassigned'}</Text>
                          {t.rating > 0 && <Text style={styles.drillTicketRating}>★ {t.rating}/5</Text>}
                       </View>
                       {t.rating > 0 && (
                          <Text style={{ marginTop: 6, fontStyle: 'italic', color: t.ratingFeedback ? '#64748B' : '#94A3B8', fontSize: t.ratingFeedback ? 13 : 12, lineHeight: 18 }}>
                            {t.ratingFeedback ? `"${t.ratingFeedback}"` : "No feedbacks received."}
                          </Text>
                       )}
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};
