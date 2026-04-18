import React, { useMemo, useState, memo } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, 
  Alert, Linking, Modal, TextInput, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayers } from '../../context/PlayerContext';
import { useTournaments } from '../../context/TournamentContext';
import SafeAvatar from '../SafeAvatar';

const AdminCoachPanel = memo(({ search }) => {
  const { players } = usePlayers();
  const { onApproveCoach } = useTournaments();
  
  const [coachSubTab, setCoachSubTab] = useState('pending');
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  
  // Modal states
  const [rejectType, setRejectType] = useState(null); // 'rejected' | 'addendum'
  const [rejectingCoachId, setRejectingCoachId] = useState(null);
  const [rejectComment, setRejectComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCoaches = useMemo(() => {
    const list = (players || []).filter(p => p.role === 'coach');
    const s = search?.toLowerCase().trim();
    if (!s) return list;
    return list.filter(c => 
      (c.name || '').toLowerCase().includes(s) || 
      (c.id || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s)
    );
  }, [players, search]);

  const list = useMemo(() => {
    return filteredCoaches.filter(c => {
      const status = c.isApprovedCoach ? 'approved' : (c.coachStatus || 'pending');
      if (coachSubTab === 'rejected_addendum') return status === 'rejected' || status === 'addendum';
      return status === coachSubTab;
    });
  }, [filteredCoaches, coachSubTab]);

  const handleStatusUpdate = async (coachId, status, reason = '') => {
    setIsSubmitting(true);
    try {
      await onApproveCoach(coachId, status, reason);
      setRejectType(null);
      setRejectingCoachId(null);
      setRejectComment('');
    } catch (e) {
      Alert.alert("Error", "Failed to update coach status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCoachItem = (c) => {
    const isSelected = selectedCoachId === c.id;
    const status = c.isApprovedCoach ? 'approved' : (c.coachStatus || 'pending');
    
    return (
      <TouchableOpacity 
        key={c.id} 
        activeOpacity={0.9}
        onPress={() => setSelectedCoachId(isSelected ? null : c.id)}
        style={[styles.adminCard, isSelected && styles.cardActive]}
      >
        <View style={styles.cardHeader}>
          <SafeAvatar 
            uri={c.avatar} 
            name={c.name} 
            role={c.role} 
            size={48} 
            borderRadius={16} 
            style={styles.avatar} 
          />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{c.name}</Text>
            <View style={styles.row}>
              <Ionicons name="call-outline" size={10} color="#94A3B8" />
              <Text style={styles.cardSubtitle}>{c.phone || 'No Phone'}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { 
            backgroundColor: status === 'approved' ? '#DCFCE7' : 
                             status === 'revoked' || status === 'rejected' ? '#FEE2E2' : 
                             status === 'addendum' ? '#FEF9C3' : '#F1F5F9' 
          }]}>
            <Text style={[styles.statusText, { 
              color: status === 'approved' ? '#15803D' : 
                     status === 'revoked' || status === 'rejected' ? '#B91C1C' : 
                     status === 'addendum' ? '#A16207' : '#64748B' 
            }]}>
              {status.toUpperCase()}
            </Text>
          </View>
        </View>

        {isSelected && (
          <View style={styles.expandedContent}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Account Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>UID</Text>
                <Text style={styles.detailValue}>{c.id}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>Email</Text>
                <Text style={styles.detailValue}>{c.email}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="ribbon-outline" size={14} color="#6366F1" />
                <Text style={[styles.infoLabel, { marginLeft: 6, marginBottom: 0 }]}>
                    Certified Sports: <Text style={styles.infoValue}>{c.certifiedSports?.join(', ') || 'None'}</Text>
                </Text>
            </View>
            
            <View style={styles.documentGrid}>
              <TouchableOpacity 
                onPress={() => c.govIdUrl ? Linking.openURL(c.govIdUrl) : Alert.alert("Not Found", "No Gov ID uploaded.")} 
                style={[styles.docBtn, !c.govIdUrl && { opacity: 0.5 }]}
              >
                <Ionicons name="card-outline" size={16} color={c.govIdUrl ? "#6366F1" : "#94A3B8"} />
                <Text style={styles.docBtnText}>Gov ID</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => c.certificationUrl ? Linking.openURL(c.certificationUrl) : Alert.alert("Not Found", "No Cert uploaded.")} 
                style={[styles.docBtn, !c.certificationUrl && { opacity: 0.5 }]}
              >
                <Ionicons name="medal-outline" size={16} color={c.certificationUrl ? "#6366F1" : "#94A3B8"} />
                <Text style={styles.docBtnText}>Certificate</Text>
              </TouchableOpacity>
            </View>

            {(status === 'rejected' || status === 'addendum') && c.coachRejectReason && (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Decision Note:</Text>
                <Text style={styles.reasonText}>{c.coachRejectReason}</Text>
              </View>
            )}

            {coachSubTab === 'pending' && (
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => handleStatusUpdate(c.id, 'approved')} style={[styles.actionBtn, styles.approveBtn]}>
                  <Text style={styles.actionBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setRejectType('rejected'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.rejectBtn]}>
                  <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setRejectType('addendum'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.addendumBtn]}>
                  <Text style={[styles.actionBtnText, { color: '#CA8A04' }]}>Addendum</Text>
                </TouchableOpacity>
              </View>
            )}

            {coachSubTab === 'approved' && (
              <TouchableOpacity onPress={() => handleStatusUpdate(c.id, 'revoked')} style={styles.fullActionBtn}>
                <Ionicons name="close-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={[styles.fullActionBtnText, { color: '#EF4444' }]}>Revoke Access</Text>
              </TouchableOpacity>
            )}

            {coachSubTab === 'revoked' && (
              <TouchableOpacity onPress={() => handleStatusUpdate(c.id, 'approved')} style={[styles.fullActionBtn, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" style={{ marginRight: 6 }} />
                <Text style={[styles.fullActionBtnText, { color: '#16A34A' }]}>Restore Access</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coachSubTabsWrapper} contentContainerStyle={styles.coachSubTabs}>
        {['pending', 'approved', 'revoked', 'rejected_addendum'].map(t => (
          <TouchableOpacity 
            key={t} 
            onPress={() => setCoachSubTab(t)}
            style={[styles.coachSubTab, coachSubTab === t && styles.coachSubTabActive]}
          >
            <Text style={[styles.coachSubTabText, coachSubTab === t && styles.coachSubTabTextActive]}>
              {t === 'rejected_addendum' ? 'REJECTED/ADDENDUM' : t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {list.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No matching coaches found</Text>
        </View>
      ) : list.map(renderCoachItem)}

      {/* Rejection/Addendum Modal */}
      <Modal visible={!!rejectType} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {rejectType === 'rejected' ? 'Reject Coach Application' : 'Request Addendum'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Please provide a reason. This will be visible to the coach.
            </Text>
            <TextInput 
              style={styles.modalInput}
              placeholder="Enter reason here..."
              value={rejectComment}
              onChangeText={setRejectComment}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                onPress={() => setRejectType(null)} 
                style={styles.modalCancel}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => handleStatusUpdate(rejectingCoachId, rejectType, rejectComment)} 
                style={[styles.modalSubmit, { backgroundColor: rejectType === 'rejected' ? '#EF4444' : '#6366F1' }]}
                disabled={isSubmitting || !rejectComment.trim()}
              >
                {isSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalSubmitText}>Submit Decision</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16 },
  coachSubTabsWrapper: { marginBottom: 20 },
  coachSubTabs: { flexDirection: 'row', gap: 8 },
  coachSubTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', elevation: 1 },
  coachSubTabActive: { backgroundColor: '#6366F1' },
  coachSubTabText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  coachSubTabTextActive: { color: '#FFF' },
  adminCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#6366F1', elevation: 2 },
  cardActive: { borderLeftColor: '#10B981' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 16, marginRight: 14 },
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  cardSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800' },
  expandedContent: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  infoBlock: { marginBottom: 16, padding: 16, borderRadius: 16, backgroundColor: '#F8FAFC' },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  infoValue: { color: '#1E293B', textTransform: 'none' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailTitle: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  documentGrid: { flexDirection: 'row', gap: 12, marginTop: 8 },
  docBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 12, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  docBtnText: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  reasonBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#EF4444', marginTop: 12 },
  reasonLabel: { fontSize: 10, fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase', marginBottom: 4 },
  reasonText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  actionRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  actionBtn: { flex: 1, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  approveBtn: { backgroundColor: '#6366F1' },
  actionBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  rejectBtn: { backgroundColor: '#FEE2E2' },
  addendumBtn: { backgroundColor: '#FEF9C3' },
  fullActionBtn: { height: 48, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  fullActionBtnText: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  modalSubtitle: { fontSize: 12, color: '#64748B' },
  modalInput: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, height: 120, textAlignVertical: 'top', fontSize: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalCancel: { flex: 1, paddingVertical: 14, backgroundColor: '#F1F5F9', borderRadius: 12, alignItems: 'center' },
  modalCancelText: { fontWeight: '700', color: '#64748B' },
  modalSubmit: { flex: 1.5, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalSubmitText: { fontWeight: '900', color: '#FFFFFF' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center' }
});

export default AdminCoachPanel;
