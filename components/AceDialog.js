import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A highly reliable, cross-platform custom dialog component.
 * Replaces React Native's Alert.alert (which fails silently on Web) and
 * window.alert/window.confirm (which get blocked by Safari/Chrome popup blockers).
 */
const AceDialog = ({ visible, title, message, type = 'info', onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel' }) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          {/* Header Icon */}
          <View style={[styles.iconContainer, type === 'danger' ? styles.dangerIcon : type === 'warning' ? styles.warningIcon : styles.infoIcon]}>
            <Ionicons 
              name={type === 'danger' ? 'alert-circle' : type === 'warning' ? 'warning' : 'information-circle'} 
              size={28} 
              color={type === 'danger' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#3B82F6'} 
            />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actionContainer}>
            {type !== 'info' && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.confirmBtn, type === 'danger' && styles.dangerBtn]} 
              onPress={onConfirm}
            >
              <Text style={styles.confirmBtnText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(4px)' } : {}),
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoIcon: { backgroundColor: '#EFF6FF' },
  warningIcon: { backgroundColor: '#FFFBEB' },
  dangerIcon: { backgroundColor: '#FEF2F2' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
  },
  dangerBtn: {
    backgroundColor: '#EF4444',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default AceDialog;
