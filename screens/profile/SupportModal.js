import React from 'react';
import { View, Text, TouchableOpacity, Modal, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SupportTicketSystem } from '../../components/SupportTicketSystem';
import styles from "./ProfileScreen.styles";

export const SupportModal = (props) => {
  const { showSupport, setShowSupport, user, supportTickets, onSaveTicket, onReplyTicket, onUpdateTicketStatus, onRetryMessage, onMarkSeen, urlTicketId, setUrlTicketId } = props;
  
  return (
        <Modal visible={showSupport} animationType="slide" onRequestClose={() => setShowSupport(false)}>
          <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={styles.supportContainer}>
              <View style={styles.supportHeader}>
                  <Text style={styles.supportTitle}>Support Center</Text>
                  <TouchableOpacity onPress={() => setShowSupport(false)} style={styles.supportClose}>
                      <Ionicons name="close" size={24} color="#0F172A" />
                  </TouchableOpacity>
              </View>
              {SupportTicketSystem ? (
                <SupportTicketSystem 
                  userId={user.id}
                  userName={user.name}
                  tickets={supportTickets || []}
                  onCreateTicket={onSaveTicket}
                  onSendMessage={(tid, m) => onReplyTicket(tid, user.id, m)}
                  onReply={onReplyTicket}
                  onUpdateStatus={onUpdateTicketStatus}
                  onRetryMessage={onRetryMessage}
                  onMarkSeen={onMarkSeen}
                  autoSelectTicketId={urlTicketId}
                  onConsumeTicketId={() => setUrlTicketId(null)}
                />
              ) : <Text>Support System Unavailable</Text>}
          </SafeAreaView>
          </GestureHandlerRootView>
        </Modal>
  );
};
