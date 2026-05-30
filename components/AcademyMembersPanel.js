import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MembershipService } from '../services/MembershipService';
import { usePlayersStore } from '../stores';

export const AcademyMembersPanel = ({ academyId }) => {
  const { players } = usePlayersStore();

  const members = players.filter(p => 
    p.memberships && p.memberships.some(m => m.academyId === academyId)
  );

  const activeMembers = members.filter(p => 
    p.memberships.find(m => m.academyId === academyId)?.status === 'active'
  );
  
  const pendingMembers = members.filter(p => 
    p.memberships.find(m => m.academyId === academyId)?.status === 'pending'
  );

  const handleApprove = (playerId, playerName) => {
    MembershipService.approveMember(playerId, academyId);
    Alert.alert("Member Approved", `${playerName} is now an active member.`);
  };

  const handleReject = (playerId, playerName) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${playerName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => {
            MembershipService.removeMember(playerId, academyId);
        }}
      ]
    );
  };

  const renderMember = (player, isPending) => (
    <View key={player.id} style={styles.memberCard}>
      <Image source={{ uri: player.avatar }} style={styles.avatar} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{player.name}</Text>
        <Text style={styles.memberSkill}>Skill Rating: {player.trueSkillRating || player.rating}</Text>
      </View>
      <View style={styles.actions}>
        {isPending ? (
          <>
            <TouchableOpacity onPress={() => handleApprove(player.id, player.name)} style={styles.approveBtn}>
              <Ionicons name="checkmark" size={16} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleReject(player.id, player.name)} style={styles.rejectBtn}>
              <Ionicons name="close" size={16} color="#FFF" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={() => handleReject(player.id, player.name)} style={styles.removeBtn}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {pendingMembers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Approvals ({pendingMembers.length})</Text>
          {pendingMembers.map(p => renderMember(p, true))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Members ({activeMembers.length})</Text>
        {activeMembers.length === 0 ? (
          <Text style={styles.emptyText}>No active members found.</Text>
        ) : (
          activeMembers.map(p => renderMember(p, false))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  section: {
    padding: 24,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  memberSkill: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    backgroundColor: '#10B981',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  removeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 24,
  }
});

export default AcademyMembersPanel;
