import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, shadows } from '../../theme/designSystem';
import { usePlayers } from '../../context/PlayerContext';
import { useTournaments } from '../../context/TournamentContext';
import { useAdmin } from '../../context/AdminContext';

const AdminAssignmentPanel = ({ search = '' }) => {
  const { players } = usePlayers();
  const { tournaments, onAssignCoach, onRemoveCoach } = useTournaments();
  const { seenAdminActionIds } = useAdmin();
  const [viewingAssignmentFor, setViewingAssignmentFor] = useState(null);

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
                  backgroundColor: t.coachStatus?.includes('Assigned') ? colors.success + '20' : 
                                 t.coachStatus?.includes('Awaiting') ? colors.warning + '20' : 
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
            </View>
          );
        })
      )}
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
    backgroundColor: colors.success + '10',
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
  emptyText: { ...typography.body1, color: colors.navy[400], marginTop: 12 }
});

export default AdminAssignmentPanel;
