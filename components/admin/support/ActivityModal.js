import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ActivityModal = ({ showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration, selectedAgentStats }) => {
  
  return (
      <Modal visible={showActivityModal} transparent animationType="fade" onRequestClose={() => setShowActivityModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A' }}>Recent Activity</Text>
              <TouchableOpacity onPress={() => setShowActivityModal(false)} style={{ padding: 8, backgroundColor: '#F1F5F9', borderRadius: 12 }}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedAgentStats?.activityTimeline?.map((act, idx) => {
                let icon, color, text;
                if (act.type === 'assignment') { icon = 'person-add'; color = '#3B82F6'; text = `Assigned ticket #${act.ticketId.slice(-4)}`; }
                else if (act.type === 'reply') { icon = 'chatbubble-ellipses'; color = '#8B5CF6'; text = `Replied to #${act.ticketId.slice(-4)}`; }
                else if (act.type === 'closure') { icon = 'checkmark-circle'; color = '#10B981'; text = `Closed #${act.ticketId.slice(-4)}`; }
                else if (act.type === 'resolved') { icon = 'shield-checkmark'; color = '#10B981'; text = `Resolved #${act.ticketId.slice(-4)}`; }
                else if (act.type === 'csat_received') { icon = 'star'; color = '#F59E0B'; text = `Rated ${act.rating}★ on #${act.ticketId.slice(-4)}`; }
                
                return (
                  <View key={idx} style={[styles.timelineRow, { marginBottom: 16 }]}>
                    {idx < selectedAgentStats.activityTimeline.length - 1 && <View style={styles.timelineLine} />}
                    <View style={[styles.timelineIconNode, { backgroundColor: color + '1A', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name={icon} size={16} color={color} />
                    </View>
                    <View style={[styles.timelineContent, { marginLeft: 16 }]}>
                      <Text style={[styles.timelineText, { fontSize: 15, fontWeight: '700', color: '#1E293B' }]}>{text}</Text>
                      <Text style={[styles.timelineTime, { fontSize: 13, color: '#64748B', marginTop: 4 }]}>
                         {new Date(act.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(act.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

  );
};
