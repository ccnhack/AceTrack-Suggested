import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import SafeAvatar from './SafeAvatar';

export const RosterRow = memo(({ 
  team, 
  teamEvaluated, 
  decision, 
  activeTournament, 
  currentRound, 
  players, 
  evaluations, 
  user, 
  onUpdateTournament, 
  setViewingHistoryForPlayer, 
  handleOpenEvaluation,
  styles 
}) => {
  const playerStatuses = activeTournament?.playerStatuses || {};
  return (
    <View style={styles.teamContainer}>
      <View style={styles.teamHeader}>
        <Text style={styles.teamName}>{team.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {teamEvaluated && (
            <Text style={styles.submittedBadge}>submitted</Text>
          )}
          {decision && (
            <Text style={[styles.decisionText, decision === 'Qualified' ? styles.textSuccess : styles.textDanger]}>
              {decision}
            </Text>
          )}
        </View>
      </View>

      {team.playerIds.map(pid => {
        const p = players.find(player => String(player.id).toLowerCase() === String(pid).toLowerCase());
        const playerObj = p || (String(pid).toLowerCase() === String(user?.id).toLowerCase() ? user : { 
          id: pid, 
          name: players.find(x => x.id === pid)?.name || `Player ${pid}`,
          skillLevel: 'N/A',
          rating: 1000
        });

        const playerEvaluations = evaluations.filter(e => String(e.playerId).toLowerCase() === String(playerObj.id).toLowerCase() && String(e.tournamentId).toLowerCase() === String(activeTournament?.id).toLowerCase());
        const cumulativeAvg = playerEvaluations.length > 0 
          ? (playerEvaluations.reduce((sum, e) => sum + e.averageScore, 0) / playerEvaluations.length).toFixed(1)
          : (playerObj.rating || 0);

        const isEliminated = playerStatuses[pid] === 'Eliminated';
        const isQualified = playerStatuses[pid] === 'Qualified';
        const isOptedOut = playerStatuses[pid] === 'Opted-Out';
        const isPendingPayment = activeTournament?.pendingPaymentPlayerIds?.some(id => String(id).toLowerCase() === String(pid).toLowerCase());

        return (
          <View key={pid} style={[
            styles.rosterItem, 
            isPendingPayment && { opacity: 0.7, backgroundColor: '#FFF7ED' },
            isEliminated && { opacity: 0.6, backgroundColor: '#F1F5F9' },
            isOptedOut && { opacity: 0.5, backgroundColor: '#F8FAFC' }
          ]}>
            <SafeAvatar 
              uri={playerObj.avatar} 
              name={playerObj.name} 
              role={playerObj.role} 
              size={40} 
              borderRadius={20} 
              style={[styles.rosterAvatar, (isEliminated || isOptedOut) && { grayscale: 1 }]} 
            />
            <View style={styles.rosterInfo}>
              <View style={styles.nameRow}>
                  <Text style={[styles.rosterName, (isEliminated || isOptedOut) && { color: '#64748B', textDecorationLine: 'line-through' }]} numberOfLines={1}>
                    {playerObj.name || `Player ${pid}`}
                  </Text>
                {isPendingPayment && (
                  <View style={[styles.miniBadge, { backgroundColor: '#FFEDD5', marginLeft: 8 }]}>
                    <Text style={[styles.miniBadgeText, { color: '#C2410C' }]}>Awaiting Pay</Text>
                  </View>
                )}
                {isEliminated && (
                  <View style={[styles.miniBadge, { backgroundColor: '#FEE2E2', marginLeft: 8 }]}>
                    <Text style={[styles.miniBadgeText, { color: '#DC2626' }]}>Eliminated</Text>
                  </View>
                )}
                {isOptedOut && (
                  <View style={[styles.miniBadge, { backgroundColor: '#F1F5F9', marginLeft: 8, borderWidth: 1, borderColor: '#E2E8F0' }]}>
                    <Text style={[styles.miniBadgeText, { color: '#64748B' }]}>Opted Out</Text>
                  </View>
                )}
                {isQualified && !decision && (
                  <View style={[styles.miniBadge, { backgroundColor: '#DCFCE7', marginLeft: 8 }]}>
                    <Text style={[styles.miniBadgeText, { color: '#16A34A' }]}>Qualified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.rosterRating}>Avg: {cumulativeAvg} | {playerObj.skillLevel || 'N/A'}</Text>
            </View>
            <View style={styles.rosterActions}>
              {(activeTournament?.status !== 'completed' && !activeTournament?.tournamentConcluded) ? (
                <>
                  <TouchableOpacity 
                    onPress={() => handleOpenEvaluation(playerObj, activeTournament)}
                    style={[styles.evalButton, (isEliminated || isOptedOut) && { backgroundColor: '#64748B' }]}
                  >
                    <Text style={styles.evalButtonText}>Eval</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setViewingHistoryForPlayer(playerObj)}
                    style={styles.histButton}
                  >
                    <Text style={styles.histButtonText}>Hist</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={[styles.miniBadge, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={[styles.miniBadgeText, { color: '#64748B' }]}>Locked</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {teamEvaluated && !decision && (
        <View style={styles.decisionRow}>
          <TouchableOpacity
            onPress={() => {
              const newStatuses = { ...(activeTournament?.playerStatuses || {}) };
              team.playerIds.forEach(id => newStatuses[id] = 'Qualified');
              const newRoundDecisions = { ...(activeTournament?.roundDecisions || {}) };
              if (!newRoundDecisions[currentRound]) newRoundDecisions[currentRound] = {};
              newRoundDecisions[currentRound][team.id] = 'Qualified';
              onUpdateTournament({ ...activeTournament, playerStatuses: newStatuses, roundDecisions: newRoundDecisions, ratingsModified: true });
            }}
            style={styles.decisionButtonSuccess}
          >
            <Text style={styles.decisionTextSuccess}>Qualify</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const newStatuses = { ...(activeTournament?.playerStatuses || {}) };
              team.playerIds.forEach(id => newStatuses[id] = 'Eliminated');
              const newRoundDecisions = { ...(activeTournament?.roundDecisions || {}) };
              if (!newRoundDecisions[currentRound]) newRoundDecisions[currentRound] = {};
              newRoundDecisions[currentRound][team.id] = 'Eliminated';
              onUpdateTournament({ ...activeTournament, playerStatuses: newStatuses, roundDecisions: newRoundDecisions, ratingsModified: true });
            }}
            style={styles.decisionButtonDanger}
          >
            <Text style={styles.decisionTextDanger}>Eliminate</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
