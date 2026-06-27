import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ActionsModal = (props) => {
  const {
    showActionsModal, setShowActionsModal, selectedAgent, isisSelectedTerminated, SUPPORT_HIERARCHY,
    pendingRoleChange, setPendingRoleChange, showRoleConfirmModal, setShowRoleConfirmModal,
    roleChangeComment, setRoleChangeComment, updateUserStatus, isManaging,
    handleForceReset, setShowManagerSelect, showDialog, reportCounts, handleTransferTickets,
    availableTeamLeads, activeAgents
  } = props;
  
  return (
      <Modal
        visible={showActionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowActionsModal(false)}
        onShow={() => {
          if (selectedAgent) {
            setEditShiftStart(selectedAgent.scheduledShiftStart || '09:00');
            setEditShiftEnd(selectedAgent.scheduledShiftEnd || '18:00');
          }
        }}
      >
        <View style={styles.actionsModalOverlay}>
          <View style={styles.actionsModalContent}>
            <View style={styles.actionsHeader}>
              <Text style={styles.actionsTitle}>Manage Employee</Text>
              <TouchableOpacity onPress={() => setShowActionsModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedAgent && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.actionUserCard}>
                  <SafeAvatar uri={selectedAgent.avatar} name={selectedAgent.name} role="support" size={50} borderRadius={16} />
                  <View style={{ marginLeft: 16 }}>
                    <Text style={styles.actionUserName}>{selectedAgent.name}</Text>
                    <Text style={styles.actionUserMeta}>{selectedAgent.supportLevel || 'Intern'} • {selectedAgent.supportStatus || selectedAgent.status || 'Active'}</Text>
                    
                    {/* 🗺️ [HIERARCHY_PATH] (v2.6.449) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                       <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: 'bold' }}>PATH: </Text>
                       {(() => {
                          const mgr = allSupportAgents.find(a => String(a.id) === String(selectedAgent.managerId));
                          const lead = allSupportAgents.find(a => String(a.id) === String(selectedAgent.teamLeadId));
                          return (
                            <Text style={{ fontSize: 9, color: '#64748B' }}>
                              {mgr ? mgr.name : 'None'} ➔ {lead ? lead.name : 'None'} ➔ YOU
                            </Text>
                          );
                       })()}
                    </View>
                  </View>
                </View>

                <Text style={styles.actionSectionTitle}>ORGANIZATION ROLE</Text>
                <View style={styles.hierarchyGrid}>
                  {SUPPORT_HIERARCHY.map((level) => {
                    const isCurrent = (selectedAgent.supportLevel || 'Intern') === level;
                    return (
                      <TouchableOpacity 
                        key={level}
                        onPress={() => {
                          if (isCurrent) return;
                          const currentLevel = selectedAgent.supportLevel || 'Intern';
                          const currentIdx = SUPPORT_HIERARCHY.indexOf(currentLevel);
                          const newIdx = SUPPORT_HIERARCHY.indexOf(level);
                          
                          // 🛡️ [LOGIC FIX] (v2.6.419): In our hierarchy array, Manager is at 0 (highest).
                          // So if newIdx < currentIdx, it's a Promotion.
                          // If currentIdx is -1 (unknown), we assume Promotion for any recognized level.
                          const changeType = (currentIdx === -1 || newIdx < currentIdx) ? 'Promotion' : 'Demotion';
                          setPendingRoleChange({ agentId: selectedAgent.id, agentName: selectedAgent.name, currentLevel, newLevel: level, changeType });
                          setRoleChangeComment('');
                          setShowActionsModal(false);
                          setShowRoleConfirmModal(true);
                        }}
                        style={[styles.hierarchyBtn, isCurrent && styles.hierarchyBtnActive]}
                      >
                        <Text style={[styles.hierarchyBtnText, isCurrent && styles.hierarchyBtnTextActive]}>{level}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.actionSectionTitle}>REPORTING MANAGER</Text>
                
                {/* Current Manager Display */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' }}>
                   {(() => {
                      const curr = availableManagers.find(m => String(m.id) === String(selectedAgent.managerId));
                      if (curr) {
                        return (
                           <>
                             <SafeAvatar uri={curr.avatar} name={curr.name} role={curr.role} size={36} borderRadius={18} />
                             <View style={{ marginLeft: 12, flex: 1 }}>
                               <Text style={{ color: '#F8FAFC', fontWeight: '700', fontSize: 15 }}>{curr.name}</Text>
                               <Text style={{ color: '#94A3B8', fontSize: 12 }}>Current Manager</Text>
                             </View>
                           </>
                        )
                      }
                      return <Text style={{ color: '#94A3B8', fontSize: 13, flex: 1, textAlign: 'center', paddingVertical: 8 }}>No Manager Assigned</Text>;
                   })()}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 8 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 'bold' }}>Assign New Manager</Text>
                  <TextInput 
                    placeholder="Search..." 
                    placeholderTextColor="#94A3B8"
                    style={{ fontSize: 11, color: '#F8FAFC', padding: 0, width: 80, textAlign: 'right' }} 
                    value={managerSearch}
                    onChangeText={setManagerSearch}
                  />
                </View>
                <View style={styles.managerListContainer}>
                  {(() => {
                    const otherManagers = availableManagers.filter(mgr => 
                      String(selectedAgent.managerId) !== String(mgr.id) && 
                      String(mgr.id) !== String(selectedAgent.id) &&
                      (mgr.name || '').toLowerCase().includes(managerSearch.toLowerCase())
                    );
                    if (otherManagers.length === 0) {
                      return <Text style={{ fontSize: 12, color: '#94A3B8', padding: 8, paddingHorizontal: 16 }}>{managerSearch ? 'No matches found' : 'No other managers available.'}</Text>;
                    }
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8, paddingHorizontal: 16 }}>
                        {otherManagers.map(mgr => (
                          <TouchableOpacity 
                            key={mgr.id} 
                            style={styles.managerBtn}
                            onPress={() => handleAssignHierarchy(selectedAgent.id, 'manager', mgr.id)}
                            disabled={isAssigningManager}
                          >
                            <View style={{ position: 'relative' }}>
                              <SafeAvatar uri={mgr.avatar} name={mgr.name} role={mgr.role} size={28} borderRadius={14} />
                              {reportCounts[mgr.id] > 0 && (
                                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 4, height: 14, justifyContent: 'center' }}>
                                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: 'bold' }}>{reportCounts[mgr.id]}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.managerBtnText}>
                              {mgr.name.split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    );
                  })()}
                </View>

                <Text style={styles.actionSectionTitle}>TEAM LEAD</Text>
                
                {/* Current Team Lead Display */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' }}>
                   {(() => {
                      const curr = availableTeamLeads.find(m => String(m.id) === String(selectedAgent.teamLeadId));
                      if (curr) {
                        return (
                           <>
                             <SafeAvatar uri={curr.avatar} name={curr.name} role={curr.role} size={36} borderRadius={18} />
                             <View style={{ marginLeft: 12, flex: 1 }}>
                               <Text style={{ color: '#F8FAFC', fontWeight: '700', fontSize: 15 }}>{curr.name}</Text>
                               <Text style={{ color: '#94A3B8', fontSize: 12 }}>Current Team Lead ({reportCounts[curr.id] || 0} reports)</Text>
                             </View>
                           </>
                        )
                      }
                      return <Text style={{ color: '#94A3B8', fontSize: 13, flex: 1, textAlign: 'center', paddingVertical: 8 }}>No Team Lead Assigned</Text>;
                   })()}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 8 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 'bold' }}>Assign New Team Lead</Text>
                  <TextInput 
                    placeholder="Search..." 
                    placeholderTextColor="#94A3B8"
                    style={{ fontSize: 11, color: '#F8FAFC', padding: 0, width: 80, textAlign: 'right' }} 
                    value={leadSearch}
                    onChangeText={setLeadSearch}
                  />
                </View>
                <View style={styles.managerListContainer}>
                  {(() => {
                    const otherLeads = availableTeamLeads.filter(mgr => 
                      String(selectedAgent.teamLeadId) !== String(mgr.id) && 
                      String(mgr.id) !== String(selectedAgent.id) &&
                      (mgr.name || '').toLowerCase().includes(leadSearch.toLowerCase())
                    );
                    if (otherLeads.length === 0) {
                      return <Text style={{ fontSize: 12, color: '#94A3B8', padding: 8, paddingHorizontal: 16 }}>{leadSearch ? 'No matches found' : 'No team leads available.'}</Text>;
                    }
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8, paddingHorizontal: 16 }}>
                        {otherLeads.map(mgr => (
                          <TouchableOpacity 
                            key={mgr.id} 
                            style={styles.managerBtn}
                            onPress={() => handleAssignHierarchy(selectedAgent.id, 'teamLead', mgr.id)}
                            disabled={isAssigningManager}
                          >
                            <View style={{ position: 'relative' }}>
                              <SafeAvatar uri={mgr.avatar} name={mgr.name} role={mgr.role} size={28} borderRadius={14} />
                              {reportCounts[mgr.id] > 0 && (
                                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 4, height: 14, justifyContent: 'center' }}>
                                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: 'bold' }}>{reportCounts[mgr.id]}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.managerBtnText}>
                              {mgr.name.split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    );
                  })()}
                </View>

                <Text style={styles.actionSectionTitle}>SHIFT TIMINGS</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748B', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>Expected Check-in (HH:MM)</Text>
                    <TextInput
                      style={{ backgroundColor: '#0F172A', color: '#F8FAFC', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#334155' }}
                      value={editShiftStart}
                      onChangeText={setEditShiftStart}
                      placeholder="e.g. 09:00"
                      placeholderTextColor="#475569"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748B', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>Expected Checkout (HH:MM)</Text>
                    <TextInput
                      style={{ backgroundColor: '#0F172A', color: '#F8FAFC', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#334155' }}
                      value={editShiftEnd}
                      onChangeText={setEditShiftEnd}
                      placeholder="e.g. 18:00"
                      placeholderTextColor="#475569"
                    />
                  </View>
                </View>
                <View style={{ marginHorizontal: 16, marginBottom: 24 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#6366F1', borderRadius: 8, padding: 12, alignItems: 'center' }}
                    disabled={isUpdatingShift}
                    onPress={async () => {
                       setIsUpdatingShift(true);
                       try {
                          const token = await storage.getItem('userToken');
                          const headers = { 
                            'x-user-id': currentUser?.id || 'admin',
                            'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID,
                            'Content-Type': 'application/json'
                          };
                          if (token) headers['Authorization'] = `Bearer ${token}`;

                          const res = await apiFetch(`${config.API_BASE_URL}/api/v1/admin-core/update-shift-schedule`, {
                            method: 'POST',
                            headers,
                            credentials: 'include',
                            body: JSON.stringify({
                              agentId: selectedAgent.id,
                              scheduledShiftStart: editShiftStart,
                              scheduledShiftEnd: editShiftEnd
                            })
                          });

                          if (res.ok) {
                            Alert.alert('Success', 'Shift timings updated successfully. It may take a moment to reflect.');
                            setShowActionsModal(false);
                          } else {
                            const err = await res.json();
                            Alert.alert('Error', err.message || 'Failed to update shift timings.');
                          }
                       } catch (e) {
                          Alert.alert('Error', 'Network error. Could not update shift timings.');
                       } finally {
                          setIsUpdatingShift(false);
                       }
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>
                      {isUpdatingShift ? 'Updating...' : 'Save Shift Timings'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.actionSectionTitle}>ACCOUNT CONTROLS</Text>
                <View style={styles.actionRow}>
                  {/* 🛡️ [DYNAMIC ACCOUNT ACTIONS] (v2.6.424) */}
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={async () => {
                      const status = (selectedAgent.supportStatus || selectedAgent.status || '').toLowerCase();
                      const isTerminated = status === 'terminated' || status === 'inactive' || selectedAgent.supportLevel === 'EX-EMPLOYEE';
                      const isSuspended = status === 'suspended';
                      
                      const actionLabel = isTerminated ? "Re-onboard" : (isSuspended ? "Unsuspend" : "Suspend");
                      const nextStatus = (isTerminated || isSuspended) ? 'active' : 'suspended';
                      const confirmMsg = isTerminated 
                        ? "This will restore the employee's access and generate a fresh onboarding password. Proceed?"
                        : (isSuspended ? "Allow this employee to log in and receive tickets again?" : "This will immediately block dashboard access and unassign all open tickets. Proceed?");

                      // 🎨 [ACE_DIALOG] (v2.6.431): Premium confirmation
                      const dialogType = (isSuspended || isTerminated) ? 'warning' : 'danger';
                      const confirmed = await showDialog({ title: `${actionLabel} Employee`, message: confirmMsg, type: dialogType, confirmText: actionLabel, cancelText: 'Cancel' });

                      if (confirmed) {
                        await updateUserStatus(selectedAgent.id, nextStatus);
                      }
                    }}
                  >
                    <Ionicons 
                      name={
                        (selectedAgent.supportStatus === 'terminated' || selectedAgent.status === 'terminated' || selectedAgent.supportStatus === 'inactive' || selectedAgent.status === 'inactive') ? "person-add-outline" : 
                        (selectedAgent.supportStatus === 'suspended' || selectedAgent.status === 'suspended' ? "play-circle" : "pause-circle")
                      } 
                      size={20} 
                      color="#6366F1" 
                    />
                    <Text style={styles.actionBtnText}>
                      {(selectedAgent.supportStatus === 'terminated' || selectedAgent.status === 'terminated' || selectedAgent.supportStatus === 'inactive' || selectedAgent.status === 'inactive') ? "Re-onboard" : 
                       (selectedAgent.supportStatus === 'suspended' || selectedAgent.status === 'suspended' ? "Unsuspend" : "Suspend")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => handleForceReset(selectedAgent.id)}
                  >
                    <Ionicons name="key-outline" size={20} color="#F59E0B" />
                    <Text style={styles.actionBtnText}>Reset Password</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => handleTransferTickets(selectedAgent.id)}
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#10B981" />
                    <Text style={styles.actionBtnText}>Transfer Tickets</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionBtn, { borderColor: '#FEE2E2' }]}
                    onPress={async () => {
                      const confirmMsg = "This will unassign all tickets instantly and revoke dashboard access. Proceed?";
                      const confirmed = await showDialog({ title: 'Confirm Termination', message: confirmMsg, type: 'danger', confirmText: 'Terminate', cancelText: 'Cancel' });
                      if (confirmed) {
                        await updateUserStatus(selectedAgent.id, 'terminated');
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Terminate</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

  );
};
