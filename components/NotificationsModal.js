import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Global Notifications Modal (v2.6.84)
 * Move to root to ensure accessibility from any screen.
 */
const NotificationsModal = ({ visible, onClose, notifications, onClear, onNotificationClick }) => {
  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.notificationsModalContent}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Notifications</Text>
              {notifications && notifications.length > 0 && (
                <TouchableOpacity onPress={onClear} style={styles.headerClearBtn}>
                  <Text style={styles.headerClearBtnText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id || Math.random().toString()}
            renderItem={({ item: notif }) => (
              <TouchableOpacity 
                style={[styles.notificationItem, !notif.read && styles.unreadNotification]}
                onPress={() => onNotificationClick(notif)}
              >
                <View style={styles.notificationIcon}>
                  <Ionicons 
                    name={notif.type === 'video' ? 'play-circle' : notif.type === 'support' ? 'help-buoy' : 'notifications'} 
                    size={24} 
                    color={notif.read ? '#94A3B8' : '#3B82F6'} 
                  />
                </View>
                <View style={styles.notificationText}>
                  <Text style={[styles.notificationTitle, !notif.read && styles.boldText]}>{notif.title}</Text>
                  <Text style={styles.notificationMessage}>{notif.message}</Text>
                  <Text style={styles.notificationDate}>
                    {notif.date ? new Date(notif.date).toLocaleDateString() : ''}
                  </Text>
                </View>
                {!notif.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyText}>No notifications yet</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={notifications?.length === 0 ? { flex: 1, justifyContent: 'center' } : { paddingBottom: 20 }}
          />
          
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notificationsModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    width: '100%',
    maxHeight: '80%',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 4,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  unreadNotification: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  notificationDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  boldText: {
    fontWeight: '900',
    color: '#0F172A',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  clearBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
  },
  clearBtnText: {
    color: '#3B82F6',
    fontWeight: '900',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  headerClearBtn: {
    marginTop: 4,
  },
  headerClearBtnText: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default NotificationsModal;
