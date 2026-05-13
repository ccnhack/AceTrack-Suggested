import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * AceDialog v2 — Premium cross-platform dialog system (v2.6.431)
 * 
 * Replaces React Native's Alert.alert (fails silently on Web) and
 * window.alert/window.confirm/window.prompt (blocked by popup blockers).
 * 
 * Supports 4 modes:
 *  - 'info'    → Simple OK notification  
 *  - 'warning' → Confirm/Cancel with amber styling
 *  - 'danger'  → Confirm/Cancel with red destructive styling
 *  - 'picker'  → Selection list with numbered choices
 */
const AceDialog = ({ 
  visible, 
  title, 
  message, 
  type = 'info', 
  onConfirm, 
  onCancel, 
  confirmText = 'OK', 
  cancelText = 'Cancel',
  // Picker mode props
  pickerOptions = [],     // Array of { label, value }
  onPickerSelect,         // (selectedValue) => void
}) => {
  const [selectedIdx, setSelectedIdx] = useState(null);
  
  if (!visible) return null;

  const isPicker = type === 'picker' && pickerOptions.length > 0;
  const showCancel = type !== 'info';

  const iconName = type === 'danger' ? 'alert-circle' 
    : type === 'warning' ? 'warning' 
    : type === 'picker' ? 'swap-horizontal'
    : 'checkmark-circle';
  
  const iconColor = type === 'danger' ? '#EF4444' 
    : type === 'warning' ? '#F59E0B' 
    : type === 'picker' ? '#10B981'
    : '#3B82F6';

  const iconBg = type === 'danger' ? styles.dangerIcon 
    : type === 'warning' ? styles.warningIcon 
    : type === 'picker' ? styles.successIcon
    : styles.infoIcon;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          {/* Header Icon */}
          <View style={[styles.iconContainer, iconBg]}>
            <Ionicons name={iconName} size={28} color={iconColor} />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Picker List */}
          {isPicker && (
            <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
              {pickerOptions.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.pickerItem, selectedIdx === idx && styles.pickerItemSelected]}
                  onPress={() => setSelectedIdx(idx)}
                >
                  <View style={[styles.pickerRadio, selectedIdx === idx && styles.pickerRadioSelected]}>
                    {selectedIdx === idx && <View style={styles.pickerRadioDot} />}
                  </View>
                  <Text style={[styles.pickerItemText, selectedIdx === idx && styles.pickerItemTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.actionContainer}>
            {showCancel && (
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => { setSelectedIdx(null); onCancel?.(); }}
              >
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[
                styles.confirmBtn, 
                type === 'danger' && styles.dangerBtn,
                type === 'picker' && styles.successBtn,
                isPicker && selectedIdx === null && styles.disabledBtn,
              ]} 
              disabled={isPicker && selectedIdx === null}
              onPress={() => {
                if (isPicker && selectedIdx !== null) {
                  const selected = pickerOptions[selectedIdx];
                  setSelectedIdx(null);
                  onPickerSelect?.(selected.value);
                } else if (!isPicker) {
                  onConfirm?.();
                }
              }}
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
    maxWidth: 420,
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
  successIcon: { backgroundColor: '#ECFDF5' },
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
    marginBottom: 20,
    lineHeight: 20,
  },
  // Picker styles
  pickerList: {
    maxHeight: 200,
    width: '100%',
    marginBottom: 16,
  },
  pickerListContent: {
    gap: 6,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    gap: 12,
  },
  pickerItemSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  pickerRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRadioSelected: {
    borderColor: '#10B981',
  },
  pickerRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  pickerItemTextSelected: {
    color: '#065F46',
    fontWeight: '800',
  },
  // Action buttons
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
  successBtn: {
    backgroundColor: '#10B981',
  },
  disabledBtn: {
    backgroundColor: '#CBD5E1',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default AceDialog;
