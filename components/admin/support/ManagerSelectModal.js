import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ManagerSelectModal = (props) => {
  const { showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads, handleAssignHierarchy, isAssigningManager, reportCounts, showRoleConfirmModal, setShowRoleConfirmModal, setPendingRoleChange, pendingRoleChange, roleChangeComment, setRoleChangeComment, updateUserStatus } = props;
  
  return (
      <Modal
        visible={showRoleConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { setShowRoleConfirmModal(false); setPendingRoleChange(null); }}
      >
        <View style={styles.actionsModalOverlay}>
          <View style={[styles.actionsModalContent, { maxWidth: 420 }]}>
            <View style={styles.actionsHeader}>
              <Text style={styles.actionsTitle}>Confirm Role Change</Text>
              <TouchableOpacity onPress={() => { setShowRoleConfirmModal(false); setPendingRoleChange(null); }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {pendingRoleChange && (
              <View>
                {/* Agent Info */}
                <View style={{ backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>{pendingRoleChange.agentName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>{pendingRoleChange.currentLevel}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color="#94A3B8" />
                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#16A34A' }}>{pendingRoleChange.newLevel}</Text>
                    </View>
                  </View>
                </View>

                {/* Change Type Badge */}
                <View style={{ 
                  flexDirection: 'row', alignItems: 'center', gap: 8, 
                  backgroundColor: pendingRoleChange.changeType === 'Promotion' ? '#F0FDF4' : '#FEF2F2', 
                  padding: 12, borderRadius: 12, marginBottom: 20,
                  borderWidth: 1, borderColor: pendingRoleChange.changeType === 'Promotion' ? '#BBF7D0' : '#FECACA'
                }}>
                  <Ionicons 
                    name={pendingRoleChange.changeType === 'Promotion' ? 'trending-up' : 'trending-down'} 
                    size={20} 
                    color={pendingRoleChange.changeType === 'Promotion' ? '#16A34A' : '#DC2626'} 
                  />
                  <Text style={{ 
                    fontSize: 14, fontWeight: '800', 
                    color: pendingRoleChange.changeType === 'Promotion' ? '#16A34A' : '#DC2626' 
                  }}>
                    {pendingRoleChange.changeType}
                  </Text>
                </View>

                {/* Mandatory Comment */}
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 }}>REASON / JUSTIFICATION *</Text>
                <TextInput
                  value={roleChangeComment}
                  onChangeText={setRoleChangeComment}
                  placeholder="e.g., Excellent Q1 performance review, Restructuring..."
                  placeholderTextColor="#CBD5E1"
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: roleChangeComment?.trim() ? '#6366F1' : '#E2E8F0',
                    borderRadius: 14, padding: 14, fontSize: 14, color: '#1E293B', fontWeight: '600',
                    minHeight: 80, textAlignVertical: 'top'
                  }}
                />
                {!roleChangeComment?.trim() && (
                  <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700', marginTop: 6 }}>A reason is required to proceed.</Text>
                )}

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                  <TouchableOpacity 
                    onPress={() => { setShowRoleConfirmModal(false); setPendingRoleChange(null); }}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#64748B' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    disabled={!roleChangeComment?.trim()}
                    onPress={() => {
                      updateUserStatus(pendingRoleChange.agentId, null, pendingRoleChange.newLevel, roleChangeComment?.trim() || '');
                      setShowRoleConfirmModal(false);
                      setPendingRoleChange(null);
                      setRoleChangeComment('');
                    }}
                    style={{ 
                      flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                      backgroundColor: roleChangeComment?.trim() ? '#6366F1' : '#CBD5E1'
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>Confirm {pendingRoleChange.changeType}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

  );
};
