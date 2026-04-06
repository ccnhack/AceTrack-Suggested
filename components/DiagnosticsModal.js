import React from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Modal, 
  StyleSheet, Platform, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import logger from '../utils/logger';

const DiagnosticsModal = ({ visible, onClose, onUpload, isUploading }) => {
    const logs = logger.getLogs();
    
    const logStr = (logs || []).map(l => JSON.stringify(l)).join('\n');
    const totalLines = (logs || []).length;
    let fileSizeKB = '0.00';
    try {
        fileSizeKB = (logStr.length / 1024).toFixed(2);
    } catch (e) {
        // Handle serialization errors gracefully
    }
    
    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>System Diagnostics</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.diagNotice}>
                        <Ionicons name="information-circle" size={18} color="#2563EB" />
                        <Text style={styles.diagNoticeText}>
                            Persisted telemetry. Logs cycle at a maximum threshold to prevent memory overflow.
                        </Text>
                    </View>

                    <View style={styles.metaContainer}>
                        <View style={styles.metaBox}>
                            <Ionicons name="list" size={16} color="#475569" />
                            <Text style={styles.metaLabel}>Total Lines:</Text>
                            <Text style={styles.metaValue}>{totalLines.toLocaleString()}</Text>
                        </View>
                        <View style={styles.metaBox}>
                            <Ionicons name="document-text" size={16} color="#475569" />
                            <Text style={styles.metaLabel}>Est. Size:</Text>
                            <Text style={styles.metaValue}>{fileSizeKB} KB</Text>
                        </View>
                    </View>

                    <ScrollView 
                        style={styles.logContainer} 
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={styles.logContent}
                    >
                        {(logs || []).length > 0 ? (
                            (logs || []).map((log, i) => (
                                <View key={i} style={styles.logEntry}>
                                    <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                                    <View style={styles.logRow}>
                                        <Text style={[styles.logLevel, styles[log.level]]}>[{log.level.toUpperCase()}]</Text>
                                        <Text style={styles.logType}>[{log.type}]</Text>
                                        <Text style={styles.logMessage}>{log.message}</Text>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.emptyText}>No logs recorded in the last 5 minutes.</Text>
                        )}
                    </ScrollView>

                    <TouchableOpacity 
                        disabled={isUploading || (logs || []).length === 0}
                        onPress={onUpload} 
                        style={[styles.uploadBtn, (isUploading || (logs || []).length === 0) && styles.uploadBtnDisabled]}
                    >
                        {isUploading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <>
                                <Ionicons name="cloud-upload" size={20} color="#FFFFFF" />
                                <Text style={styles.uploadBtnText}>Send Diagnostics to Cloud</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    gap: 12,
  },
  diagNoticeText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 18,
    fontWeight: '600',
  },
  logContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  logContent: {
    paddingBottom: 8,
  },
  logEntry: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 8,
  },
  logTimestamp: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#64748B',
    marginBottom: 2,
  },
  logRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  logLevel: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: 'bold',
  },
  logType: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#94A3B8',
  },
  logMessage: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#F8FAFC',
    flex: 1,
  },
  info: { color: '#10B981' },
  warn: { color: '#F59E0B' },
  error: { color: '#EF4444' },
  network: { color: '#3B82F6' },
  system: { color: '#A855F7' },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 12,
    marginTop: 40,
    marginBottom: 40,
    fontStyle: 'italic',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 18,
    borderRadius: 20,
    gap: 12,
    elevation: 4,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  uploadBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  metaBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '900',
    flex: 1,
    textAlign: 'right',
  },
});

export default DiagnosticsModal;
