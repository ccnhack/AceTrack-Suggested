import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

const TournamentBracket = ({ tournament, players, onTeamClick }) => {
  const isDoubles = tournament.format.includes('Doubles');
  const activePlayerIds = tournament.registeredPlayerIds;
  
  if (activePlayerIds.length === 0) {
    return (
        <View style={styles.empty}>
            <Text style={styles.emptyText}>No players registered yet</Text>
        </View>
    );
  }

  const teams = [];
  if (isDoubles) {
    const numTeams = Math.ceil(activePlayerIds.length / 2);
    for (let i = 0; i < numTeams; i++) {
        const pid1 = activePlayerIds[i * 2];
        const pid2 = activePlayerIds[i * 2 + 1];
        const p1 = players.find(p => p.id === pid1);
        const p2 = players.find(p => p.id === pid2);
        teams.push({ 
          id: `team_${i}`, 
          name: `${p1?.name || 'TBD'} & ${p2?.name || 'TBD'}`,
          playerIds: [pid1, pid2].filter(id => !!id)
        });
    }
  } else {
    activePlayerIds.forEach((id) => {
        const p = players.find(player => player.id === id);
        teams.push({ id, name: p?.name || 'TBD', playerIds: [id] });
    });
  }

  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(Math.max(teams.length, 2))));
  while (teams.length < nextPowerOf2) {
    teams.push({ id: `bye_${teams.length}`, name: 'BYE', playerIds: [] });
  }

  const matches = [];
  for (let i = 0; i < teams.length; i += 2) {
    matches.push([teams[i], teams[i + 1]]);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container}>
      <View style={styles.column}>
        <Text style={styles.roundTitle}>Round 1</Text>
        {matches.map((match, idx) => (
            <View key={idx} style={styles.matchCard}>
                <TouchableOpacity 
                  disabled={!onTeamClick || match[0].name === 'BYE'} 
                  onPress={() => onTeamClick && onTeamClick(match[0])}
                >
                  <Text style={[styles.teamName, match[0].name === 'BYE' && { color: '#CBD5E1' }]} numberOfLines={1}>{match[0].name}</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity 
                  disabled={!onTeamClick || match[1].name === 'BYE'} 
                  onPress={() => onTeamClick && onTeamClick(match[1])}
                >
                  <Text style={[styles.teamName, match[1].name === 'BYE' && { color: '#CBD5E1' }]} numberOfLines={1}>{match[1].name}</Text>
                </TouchableOpacity>
                <View style={styles.connector} />
            </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  column: {
    gap: 16,
    minWidth: 200,
  },
  roundTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center',
  },
  matchCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    position: 'relative',
    gap: 4,
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
    marginVertical: 4,
  },
  connector: {
    position: 'absolute',
    top: '50%',
    right: -16,
    width: 16,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default TournamentBracket;
