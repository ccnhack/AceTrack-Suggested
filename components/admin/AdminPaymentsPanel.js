import React, { useMemo, useState, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTournaments } from '../../context/TournamentContext';
import { usePlayers } from '../../context/PlayerContext';
import { useSync } from '../../context/SyncContext';
import { getSafeAvatar } from '../../utils/imageUtils';

const PaymentTimer = ({ playerId, timestamps }) => {
  const [display, setDisplay] = useState('--:--');

  useEffect(() => {
    const promoTimeStr = timestamps?.[playerId];
    if (!promoTimeStr) return;

    const expiry = new Date(promoTimeStr).getTime() + (30 * 60 * 1000);
    
    const update = () => {
      const now = Date.now();
      const diff = expiry - now;
      if (diff <= 0) {
        setDisplay('EXPIRED');
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [playerId, timestamps]);

  return (
    <View style={[styles.timerBadge, display === 'EXPIRED' && styles.timerExpired]}>
      <Ionicons name="time-outline" size={10} color={display === 'EXPIRED' ? '#EF4444' : '#F59E0B'} />
      <Text style={[styles.timerText, display === 'EXPIRED' && styles.timerTextExpired]}>{display}</Text>
    </View>
  );
};

const AdminPaymentsPanel = memo(({ search }) => {
  const { tournaments, onRemovePendingPlayer, onUpdateTournament } = useTournaments();
  const { players } = usePlayers();
  const { syncAndSaveData } = useSync();

  const pendingPayments = useMemo(() => {
    const data = [];
    (tournaments || []).forEach(t => {
      if (t.pendingPaymentPlayerIds && t.pendingPaymentPlayerIds.length > 0) {
        t.pendingPaymentPlayerIds.forEach(pid => {
          data.push({
            playerId: pid,
            tournamentId: t.id,
            tournamentTitle: t.title,
            timestamps: t.pendingPaymentTimestamps || {},
            fee: t.entryFee || 0
          });
        });
      }
    });

    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(item => {
      const p = (players || []).find(player => player.id === item.playerId);
      return (p?.name || '').toLowerCase().includes(s) ||
             (item.tournamentTitle || '').toLowerCase().includes(s) ||
             (item.playerId || '').toLowerCase().includes(s);
    });
  }, [tournaments, players, search]);

  const handleConfirmPayment = (item) => {
    Alert.alert(
      "Confirm Payment",
      "Manual override: Mark this player as fully registered?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          onPress: () => {
            const tournament = tournaments.find(t => t.id === item.tournamentId);
            if (!tournament) return;

            const updatedT = {
              ...tournament,
              pendingPaymentPlayerIds: (tournament.pendingPaymentPlayerIds || []).filter(id => id !== item.playerId),
              registeredPlayerIds: [...(tournament.registeredPlayerIds || []), item.playerId]
            };
            
            onUpdateTournament(updatedT);
            Alert.alert("Success", "Player moved to registered list.");
          }
        }
      ]
    );
  };

  const handleCancelRegistration = (item) => {
    Alert.alert(
      "Remove Pending",
      "Are you sure you want to remove this pending registration?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: () => onRemovePendingPlayer(item.tournamentId, item.playerId)
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Awaiting Payment</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{pendingPayments.length}</Text>
        </View>
      </View>

      {pendingPayments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="card-outline" size={48} color="#E2E8F0" />
          <Text style={styles.emptyText}>No pending payments found</Text>
        </View>
      ) : (
        pendingPayments.map((item, idx) => {
          const player = (players || []).find(p => p.id === item.playerId);
          return (
            <View key={`${item.tournamentId}-${item.playerId}`} style={styles.adminCard}>
              <View style={styles.playerInfo}>
                <Image source={getSafeAvatar(player?.avatar, player?.name)} style={styles.playerAvatar} />
                <View style={styles.flex}>
                  <Text style={styles.playerName}>{player?.name || 'Unknown'}</Text>
                  <Text style={styles.tournamentRef} numberOfLines={1}>{item.tournamentTitle}</Text>
                </View>
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Fee</Text>
                  <Text style={styles.amountValue}>₹{item.fee}</Text>
                </View>
              </View>

              <View style={styles.statusRow}>
                 <PaymentTimer playerId={item.playerId} timestamps={item.timestamps} />
                 <View style={styles.actionGroup}>
                    <TouchableOpacity 
                      onPress={() => handleCancelRegistration(item)}
                      style={[styles.actionBtn, styles.btnOutline]}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleConfirmPayment(item)}
                      style={[styles.actionBtn, styles.btnPrimary]}
                    >
                      <Text style={styles.btnText}>CONFIRM</Text>
                    </TouchableOpacity>
                 </View>
              </View>

              <View style={styles.footer}>
                 <Text style={styles.metaText}>Player ID: {item.playerId}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  countBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  adminCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', elevation: 2 },
  playerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  playerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9' },
  flex: { flex: 1 },
  playerName: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  tournamentRef: { fontSize: 12, color: '#64748B', marginTop: 1 },
  amountBox: { alignItems: 'flex-end', backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  amountLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' },
  amountValue: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 16 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#FED7AA' },
  timerExpired: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  timerText: { fontSize: 13, fontWeight: '900', color: '#B45309' },
  timerTextExpired: { color: '#DC2626' },
  actionGroup: { flexDirection: 'row', gap: 8 },
  actionBtn: { height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { width: 36, borderWidth: 1, borderColor: '#FEE2E2' },
  btnPrimary: { backgroundColor: '#10B981', paddingHorizontal: 16 },
  btnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  footer: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 10 },
  metaText: { fontSize: 10, color: '#CBD5E1', fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#94A3B8', fontWeight: 'bold' }
});

export default AdminPaymentsPanel;
