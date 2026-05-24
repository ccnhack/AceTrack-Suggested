import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, shadows } from '../../theme/designSystem';
import { usePlayersStore } from '../../stores';
import { useTournamentsStore } from '../../stores';
import { useAdmin } from '../../context/AdminContext';

const AdminAssignmentPanel = ({ search = '' }) => {
  const { players } = usePlayersStore();
  const { tournaments, onAssignCoach, onRemoveCoach, onUpdateTournament, onPingCoach } = useTournamentsStore();
  const { seenAdminActionIds } = useAdmin();
  const [viewingAssignmentFor, setViewingAssignmentFor] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, tournament: null, coaches: [] });

  const today = new Date().toISOString().split('T')[0];

  const assignmentTournaments = (tournaments || []).filter(t => 
    (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment' || (t.coachStatus === 'Coach Assigned' && t.coachAssignmentType === 'platform')) && 
    t.status !== 'completed' && 
    !t.tournamentConcluded &&
    (t.date >= today)
  ).filter(t => 
    search === '' || 
    t.title.toLowerCase().includes(search.toLowerCase()) || 
    t.sport.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Coach Assignments Required</Text>
      {assignmentTournaments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="clipboard-outline" size={48} color={colors.navy[200]} />
          <Text style={styles.emptyText}>No pending assignments found</Text>
        </View>
      ) : (
        assignmentTournaments.map(t => {
          const academy = (players || []).find(p => p.id === t.creatorId);
          const isAssigned = !!t.assignedCoachId;

          const platformCoaches = (players || []).filter(p => p.role === 'coach' && p.isApprovedCoach);
          const occupiedCoaches = platformCoaches.filter(c => (tournaments || []).some(other => other.id !== t.id && other.date === t.date && other.assignedCoachId === c.id));
          const declinedCoaches = platformCoaches.filter(c => t.declinedCoachIds?.includes(c.id));
          const pendingCoaches = platformCoaches.filter(c => !t.declinedCoachIds?.includes(c.id) && !t.interestedCoachIds?.includes(c.id) && c.id !== t.assignedCoachId && !occupiedCoaches.some(oc => oc.id === c.id));
          
          const declinedCount = declinedCoaches.length;
          const interestedCount = t.interestedCoachIds?.length || 0;
          const pendingCount = pendingCoaches.length;
          
          const autoPingOptions = [
            { label: 'Off', value: null },
            { label: 'Every 2 Hrs', value: 2 * 60 * 60 * 1000 },
            { label: 'Every 6 Hrs', value: 6 * 60 * 60 * 1000 },
            { label: 'Every 24 Hrs', value: 24 * 60 * 60 * 1000 }
          ];

          return (
            <View key={t.id} style={[styles.adminCard, isAssigned && styles.assignedCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  <Text style={styles.cardSubtitle}>{t.sport} • {t.date}</Text>
                  {academy && (
                    <View style={styles.academyRow}>
                      <Ionicons name="business-outline" size={10} color={colors.primary.base} />
                      <Text style={styles.academyName}>{academy.name}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.statusBadge, { 
                  backgroundColor: t.coachStatus?.includes('Assigned') ? colors.success.replace('hsl', 'hsla').replace(')', ', 0.2)') : 
                                 t.coachStatus?.includes('Awaiting') ? colors.warning.replace('hsl', 'hsla').replace(')', ', 0.2)') : 
                                 colors.navy[100] 
                }]}>
                  <Text style={[styles.statusText, { 
                    color: t.coachStatus?.includes('Assigned') ? colors.success : 
                           t.coachStatus?.includes('Awaiting') ? colors.warning : 
                           colors.navy[500] 
                  }]}>{t.coachStatus || 'Awaiting Action'}</Text>
                </View>
              </View>

              {/* Invited Coach View */}
              {t.coachStatus === 'Pending Coach Registration' && t.invitedCoachDetails && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Invited Coach Details</Text>
                  <Text style={styles.coachDetailName}>{t.invitedCoachDetails.name}</Text>
                  <Text style={styles.coachDetailText}>{t.invitedCoachDetails.email}</Text>
                </View>
              )}

              {/* Opted-in Coaches View */}
              {t.coachAssignmentType === 'platform' && !t.assignedCoachId && t.interestedCoachIds?.length > 0 && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Interested Coaches ({t.interestedCoachIds.length})</Text>
                  {t.interestedCoachIds.map(cid => {
                    const coach = players.find(p => p.id === cid);
                    return (
                      <View key={cid} style={styles.assignRow}>
                        <Text style={styles.coachDetailName}>{coach?.name || 'Unknown Coach'}</Text>
                        <TouchableOpacity 
                          onPress={() => onAssignCoach(t.id, cid)} 
                          style={styles.assignBtn}
                        >
                          <Text style={styles.assignBtnText}>Assign</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Already Assigned View */}
              {isAssigned && (
                <View style={[styles.infoBlock, styles.successBlock]}>
                  <Text style={styles.infoLabel}>Assigned Coach</Text>
                  <View style={styles.assignRow}>
                    <Text style={styles.coachDetailName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                    <TouchableOpacity 
                      onPress={() => onRemoveCoach(t.id)} 
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!isAssigned && (!t.interestedCoachIds || t.interestedCoachIds.length === 0) && t.coachStatus !== 'Pending Coach Registration' && (
                <View style={styles.infoBlock}>
                  <Text style={styles.noInterestedText}>No platform coaches have opted in yet.</Text>
                </View>
              )}

              {t.coachAssignmentType === 'platform' && !isAssigned && t.coachStatus !== 'Pending Coach Registration' && (
                <>
                  <View style={styles.metricsContainer}>
                     <TouchableOpacity style={styles.metricBox} onPress={() => setModalState({ isOpen: true, type: 'Pending RSVP', tournament: t, coaches: pendingCoaches })}>
                        <Text style={styles.metricVal}>{pendingCount}</Text>
                        <Text style={styles.metricLabel}>Pending RSVP</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.metricBox} onPress={() => setModalState({ isOpen: true, type: 'Declined', tournament: t, coaches: declinedCoaches })}>
                        <Text style={styles.metricVal}>{declinedCount}</Text>
                        <Text style={styles.metricLabel}>Declined</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.metricBox} onPress={() => setModalState({ isOpen: true, type: 'Occupied', tournament: t, coaches: occupiedCoaches })}>
                        <Text style={styles.metricVal}>{occupiedCoaches.length}</Text>
                        <Text style={styles.metricLabel}>Occupied</Text>
                     </TouchableOpacity>
                  </View>

                  <View style={styles.pingConfigContainer}>
                    <Text style={styles.infoLabel}>Auto-Ping Interval (Background Pings)</Text>
                    <View style={styles.pingRow}>
                       {autoPingOptions.map(opt => (
                          <TouchableOpacity
                             key={opt.label}
                             style={[styles.pingBtn, t.autoPingInterval === opt.value && styles.pingBtnActive]}
                             onPress={() => onUpdateTournament({ ...t, autoPingInterval: opt.value })}
                          >
                             <Text style={[styles.pingBtnText, t.autoPingInterval === opt.value && styles.pingBtnTextActive]}>{opt.label}</Text>
                          </TouchableOpacity>
                       ))}
                    </View>
                    {t.autoPingInterval ? (
                      <View>
                        <Text style={styles.pingStatusText}>
                           {t.lastCoachPingTimestamp ? `Last pinged ${new Date(t.lastCoachPingTimestamp).toLocaleTimeString()}. Ping #${t.lastCoachPingCount || 1}` : 'Waiting for next background sweep...'}
                        </Text>
                        {t.pingDeliveryTracking && t.pingDeliveryTracking.length > 0 && (() => {
                           const latestTracking = t.pingDeliveryTracking[t.pingDeliveryTracking.length - 1];
                           return (
                             <View style={styles.deliveryStatusRow}>
                               <Ionicons name={latestTracking.undeliveredCount === 0 ? "checkmark-done-circle" : "time-outline"} size={14} color={latestTracking.undeliveredCount === 0 ? colors.success : colors.warning} />
                               <Text style={styles.deliveryStatusText}>
                                 Delivery (Ping #{latestTracking.pingCount}): 
                               </Text>
                               <TouchableOpacity style={{ marginLeft: 4 }} onPress={() => {
                                  const deliveredCoaches = players.filter(c => latestTracking.deliveredCoachIds?.includes(c.id));
                                  setModalState({ isOpen: true, type: `Ping #${latestTracking.pingCount} Delivered`, tournament: t, coaches: deliveredCoaches });
                               }}>
                                 <Text style={[styles.deliveryStatusText, { textDecorationLine: 'underline', color: colors.primary.base }]}>
                                   {latestTracking.deliveredCount} Delivered
                                 </Text>
                               </TouchableOpacity>
                               <Text style={styles.deliveryStatusText}>, </Text>
                               <TouchableOpacity onPress={() => {
                                  const pendingCoaches = players.filter(c => latestTracking.pendingCoachIds?.includes(c.id));
                                  setModalState({ isOpen: true, type: `Ping #${latestTracking.pingCount} Pending/Offline`, tournament: t, coaches: pendingCoaches });
                               }}>
                                 <Text style={[styles.deliveryStatusText, { textDecorationLine: 'underline', color: colors.warning }]}>
                                   {latestTracking.undeliveredCount} Pending/Offline
                                 </Text>
                               </TouchableOpacity>
                             </View>
                           );
                        })()}
                      </View>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          );
        })
      )}

      {/* Coach List Modal */}
      <Modal visible={modalState.isOpen} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalState.type} Coaches</Text>
              <TouchableOpacity onPress={() => setModalState({ isOpen: false, type: null, tournament: null, coaches: [] })}>
                <Ionicons name="close" size={24} color={colors.navy[800]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Tournament: {modalState.tournament?.title}</Text>
            
            <ScrollView style={{ marginTop: 16 }}>
              {modalState.coaches.length === 0 ? (
                <Text style={styles.emptyText}>No coaches in this category.</Text>
              ) : (
                modalState.coaches.map(c => {
                  const pingsSent = modalState.tournament?.individualPings?.[c.id] || 0;
                  const acceptedCount = c.coachMetrics?.tournamentsAccepted || 0;
                  const occupiedIn = modalState.type === 'Occupied' 
                    ? tournaments.find(other => other.id !== modalState.tournament?.id && other.date === modalState.tournament?.date && other.assignedCoachId === c.id)
                    : null;

                  return (
                    <View key={c.id} style={styles.coachListCard}>
                      <View style={styles.flex}>
                        <Text style={styles.coachName}>{c.name}</Text>
                        <Text style={styles.coachContact}>{c.phone || c.email}</Text>
                        <View style={styles.coachStatsRow}>
                           <Ionicons name="trophy-outline" size={12} color={colors.navy[500]} />
                           <Text style={styles.coachStatsText}>{acceptedCount} Assignments Accepted</Text>
                        </View>
                        {occupiedIn && (
                          <Text style={styles.occupiedWarning}>⚠️ Busy: {occupiedIn.title}</Text>
                        )}
                      </View>
                      
                      <View style={{ alignItems: 'flex-end' }}>
                        <TouchableOpacity 
                          style={styles.pingActionButton}
                          onPress={() => onPingCoach(modalState.tournament.id, c.id)}
                        >
                          <Ionicons name="paper-plane-outline" size={14} color="#FFF" />
                          <Text style={styles.pingActionText}>Send Ping</Text>
                        </TouchableOpacity>
                        <Text style={styles.pingCountText}>
                          {pingsSent > 0 ? `${pingsSent} Pings Sent` : 'No manual pings'}
                        </Text>
                        {modalState.tournament?.individualPingTracking?.[c.id] && (
                          <View style={[styles.deliveryStatusRow, { marginTop: 4, justifyContent: 'flex-end' }]}>
                            <Ionicons name={modalState.tournament.individualPingTracking[c.id].undeliveredCount === 0 ? "checkmark-done-circle" : "time-outline"} size={12} color={modalState.tournament.individualPingTracking[c.id].undeliveredCount === 0 ? colors.success : colors.warning} />
                            <Text style={[styles.deliveryStatusText, { fontSize: 9 }]}>
                              {modalState.tournament.individualPingTracking[c.id].deliveredCount} Delivered, {modalState.tournament.individualPingTracking[c.id].undeliveredCount} Pending
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { ...typography.h2, color: colors.navy[800], marginBottom: 16 },
  adminCard: { 
    backgroundColor: '#FFF', 
    borderRadius: borderRadius.lg, 
    padding: 16, 
    marginBottom: 16,
    ...shadows.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary.base
  },
  assignedCard: {
    borderLeftColor: colors.success
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  flex: { flex: 1 },
  cardTitle: { ...typography.subtitle1, color: colors.navy[900] },
  cardSubtitle: { ...typography.body2, color: colors.navy[500], marginTop: 2 },
  academyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  academyName: { fontSize: 10, fontWeight: '700', color: colors.primary.base, marginLeft: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '700' },
  infoBlock: { 
    backgroundColor: colors.navy[50], 
    padding: 12, 
    borderRadius: borderRadius.md, 
    marginTop: 12 
  },
  successBlock: {
    backgroundColor: colors.success.replace('hsl', 'hsla').replace(')', ', 0.1)'),
  },
  infoLabel: { fontSize: 10, fontWeight: '800', color: colors.navy[400], textTransform: 'uppercase', marginBottom: 8 },
  coachDetailName: { ...typography.subtitle2, color: colors.navy[800] },
  coachDetailText: { ...typography.body2, color: colors.navy[600] },
  assignRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  assignBtn: { backgroundColor: colors.primary.base, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  assignBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  removeBtn: { backgroundColor: colors.error, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  removeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  noInterestedText: { fontSize: 12, color: colors.navy[400], fontStyle: 'italic' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { ...typography.body1, color: colors.navy[400], marginTop: 12 },
  metricsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  metricBox: { flex: 1, backgroundColor: colors.navy[50], padding: 12, borderRadius: borderRadius.md, alignItems: 'center' },
  metricVal: { ...typography.h2, color: colors.navy[900] },
  metricLabel: { fontSize: 10, fontWeight: '700', color: colors.navy[500], textTransform: 'uppercase', marginTop: 4 },
  pingConfigContainer: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.navy[100], paddingTop: 16 },
  pingRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pingBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.sm, backgroundColor: colors.navy[50], borderWidth: 1, borderColor: colors.navy[100] },
  pingBtnActive: { backgroundColor: '#EFF6FF', borderColor: colors.primary.base },
  pingBtnText: { fontSize: 12, fontWeight: '600', color: colors.navy[600] },
  pingBtnTextActive: { color: colors.primary.dark, fontWeight: '800' },
  pingStatusText: { fontSize: 10, color: colors.navy[500], marginTop: 8, fontStyle: 'italic' },
  deliveryStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  deliveryStatusText: { fontSize: 10, color: colors.navy[600], fontWeight: '500' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFF', borderRadius: borderRadius.lg, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { ...typography.h3, color: colors.navy[900] },
  modalSubtitle: { ...typography.body2, color: colors.navy[500], marginTop: 4 },
  coachListCard: { backgroundColor: colors.navy[50], padding: 12, borderRadius: borderRadius.md, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachName: { ...typography.subtitle2, color: colors.navy[900] },
  coachContact: { fontSize: 12, color: colors.navy[500], marginTop: 2 },
  coachStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  coachStatsText: { fontSize: 11, color: colors.navy[600], fontWeight: '600' },
  occupiedWarning: { fontSize: 11, color: colors.warning, fontWeight: '700', marginTop: 4 },
  pingActionButton: { backgroundColor: colors.primary.base, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pingActionText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  pingCountText: { fontSize: 10, color: colors.navy[400], marginTop: 6, fontWeight: '600' }
});

export default AdminAssignmentPanel;
