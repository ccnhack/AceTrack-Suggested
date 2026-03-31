import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, 
  Modal, ScrollView, TextInput, SafeAreaView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';

const SPORT_CRITERIA = {
  'Badminton': ['Footwork', 'Smash Power', 'Net Play', 'Service Accuracy', 'Stamina'],
  'Cricket': ['Batting Technique', 'Bowling Speed', 'Fielding Agility', 'Catching Reliability'],
  'Table Tennis': ['Reaction Time', 'Spin Control', 'Backhand Drive', 'Service Variety']
};

export default function LiveScoringScreen({ route, onSaveEvaluation, navigation }) {
  const { 
    match = { sport: 'Badminton', format: 'Singles' }, 
    player1, player2, team1 = [], team2 = [], tournamentId 
  } = route.params || {};
  
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [history, setHistory] = useState([]);
  
  // Evaluation State
  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [ratings, setRatings] = useState({});
  const [notes, setNotes] = useState('');

  const isDoubles = match.format?.toLowerCase().includes('doubles');

  const addPoint = (team) => {
    setHistory([...history, { score1, score2 }]);
    if (team === 1) setScore1(s => s + 1);
    else setScore2(s => s + 1);
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setScore1(last.score1);
    setScore2(last.score2);
    setHistory(history.slice(0, -1));
  };

  const sportQuestions = SPORT_CRITERIA[match.sport] || SPORT_CRITERIA['Badminton'];

  const openEvaluation = (player) => {
    // If player is an object with id/name, use those, otherwise assume it's a name string or id
    setSelectedPlayer(player);
    // Reset ratings for this player session
    const initialRatings = {};
    sportQuestions.forEach(q => initialRatings[q] = 0);
    setRatings(initialRatings);
    setNotes('');
    setEvalModalVisible(true);
  };

  const submitEval = () => {
    const values = Object.values(ratings);
    if (values.some(v => v === 0)) {
      Alert.alert("Incomplete", "Please provide a rating for all criteria.");
      return;
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    
    const evaluationData = {
      id: `eval_${Date.now()}`,
      playerId: typeof selectedPlayer === 'object' ? selectedPlayer.id : selectedPlayer,
      playerName: typeof selectedPlayer === 'object' ? selectedPlayer.name : (selectedPlayer || 'Unknown Player'),
      tournamentId: tournamentId || match.tournamentId || 'manual_match',
      sport: match.sport,
      date: new Date().toISOString(),
      ratings: ratings,
      averageScore: Number(avg.toFixed(1)),
      notes: notes,
      evaluatorId: 'current_coach' // Simplified for mock
    };

    if (onSaveEvaluation) {
      onSaveEvaluation(evaluationData);
      Alert.alert("Success", `Evaluation saved for ${evaluationData.playerName}`);
    } else {
      Alert.alert("Mock Success", "Evaluation details would be saved to history.");
    }
    setEvalModalVisible(false);
  };

  const renderPlayer = (name, pData) => (
    <View style={styles.playerItem}>
       <Text style={styles.playerName} numberOfLines={1}>{name}</Text>
       <TouchableOpacity style={styles.evalBtnCompact} onPress={() => openEvaluation(pData || name)}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.evalBtnTextCompact}>Evaluate</Text>
       </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.sportTitle}>{match.sport.toUpperCase()}</Text>
          <Text style={styles.formatTitle}>{match.format}</Text>
        </View>
        <View style={styles.setCounter}>
          <Text style={styles.setText}>SET {currentSet}</Text>
        </View>
      </View>

      <View style={styles.scoringBoard}>
        {/* Team 1 Area */}
        <View style={styles.teamArea}>
          <View style={styles.playersList}>
             {isDoubles ? (team1 || []).map((p, idx) => renderPlayer(typeof p === 'string' ? p : p.name, p)) 
                       : renderPlayer(player1 || 'Player 1', player1)}
          </View>
          <TouchableOpacity style={styles.scoreContainer} onPress={() => addPoint(1)}>
            <Text style={styles.scoreNumber}>{score1}</Text>
            <View style={styles.pointLabel}>
              <Text style={styles.pointPlus}>+</Text>
              <Text style={styles.pointText}>1 POINT</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.vDivider} />

        {/* Team 2 Area */}
        <View style={styles.teamArea}>
          <View style={styles.playersList}>
             {isDoubles ? (team2 || []).map((p, idx) => renderPlayer(typeof p === 'string' ? p : p.name, p)) 
                       : renderPlayer(player2 || 'Player 2', player2)}
          </View>
          <TouchableOpacity style={styles.scoreContainer} onPress={() => addPoint(2)}>
            <Text style={styles.scoreNumber}>{score2}</Text>
            <View style={styles.pointLabel}>
              <Text style={styles.pointPlus}>+</Text>
              <Text style={styles.pointText}>1 POINT</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={undo}>
           <Ionicons name="arrow-undo-outline" size={22} color="#94A3B8" />
           <Text style={styles.controlText}>UNDO</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={() => { setScore1(0); setScore2(0); setHistory([]); }}>
           <Ionicons name="refresh-outline" size={22} color="#94A3B8" />
           <Text style={styles.controlText}>RESET</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.finishBtn} onPress={() => {
           Alert.alert("Finish Set", "Advance to the next set?", [
             { text: "Cancel" },
             { text: "Finish", onPress: () => { setCurrentSet(s => s + 1); setScore1(0); setScore2(0); }}
           ]);
        }}>
           <Text style={styles.finishBtnText}>FINISH SET</Text>
        </TouchableOpacity>
      </View>

      {/* Evaluation Modal */}
      <Modal visible={evalModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Player Evaluation</Text>
                <Text style={styles.modalPlayer}>
                  {typeof selectedPlayer === 'object' && selectedPlayer !== null 
                    ? selectedPlayer.name 
                    : (selectedPlayer || 'Unknown Player')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEvalModalVisible(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {(sportQuestions || []).map(q => (
                <View key={q} style={styles.ratingGroup}>
                  <Text style={styles.ratingLabel}>{q}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <TouchableOpacity 
                        key={star} 
                        onPress={() => setRatings({...ratings, [q]: star})}
                        style={styles.starTouch}
                      >
                        <Ionicons 
                          name={ratings[q] >= star ? "star" : "star-outline"} 
                          size={32} 
                          color={ratings[q] >= star ? "#F59E0B" : "#475569"} 
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}

              <Text style={styles.sectionLabel}>Technical Notes</Text>
              <TextInput 
                style={styles.notesInput}
                multiline
                placeholder="Observed strengths or areas for improvement..."
                placeholderTextColor="#64748B"
                value={notes}
                onChangeText={setNotes}
              />

              <TouchableOpacity style={styles.saveEvalBtn} onPress={submitEval}>
                <Text style={styles.saveEvalText}>Save to Player History</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { 
    flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 10,
    borderBottomWidth: 1, borderBottomColor: '#1E293B' 
  },
  backBtn: { padding: 8, marginRight: 10 },
  headerInfo: { flex: 1 },
  sportTitle: { color: '#6366F1', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  formatTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
  setCounter: { backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  setText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  scoringBoard: { flex: 1, flexDirection: 'row' },
  teamArea: { flex: 1, padding: 15, justifyContent: 'space-between' },
  playersList: { gap: 10 },
  playerItem: { 
    backgroundColor: '#1E293B', padding: 12, borderRadius: 16, borderLeftWidth: 3, borderLeftColor: '#3B82F6' 
  },
  playerName: { color: '#F1F5F9', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  evalBtnCompact: { 
    flexDirection: 'row', alignItems: 'center', gap: 4, 
    backgroundColor: 'rgba(245, 158, 11, 0.1)', alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 
  },
  evalBtnTextCompact: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  scoreContainer: { 
    flex: 1, justifyContent: 'center', alignItems: 'center', 
    backgroundColor: '#162136', borderRadius: 32, marginVertical: 40, borderStyle: 'dashed', borderWidth: 1, borderColor: '#334155'
  },
  scoreNumber: { color: '#fff', fontSize: 110, fontWeight: '900' },
  pointLabel: { alignItems: 'center', gap: 2, marginTop: -10 },
  pointPlus: { color: '#3B82F6', fontSize: 24, fontWeight: '900' },
  pointText: { color: '#64748B', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  vDivider: { width: 1, backgroundColor: '#1E293B' },
  controls: { 
    flexDirection: 'row', padding: 25, gap: 15, alignItems: 'center', 
    backgroundColor: '#111827', borderTopLeftRadius: 32, borderTopRightRadius: 32 
  },
  controlBtn: { alignItems: 'center', gap: 4, padding: 10 },
  controlText: { color: '#94A3B8', fontSize: 10, fontWeight: '800' },
  finishBtn: { 
    flex: 1, backgroundColor: '#6366F1', paddingVertical: 18, borderRadius: 20, 
    alignItems: 'center', shadowColor: '#6366F1', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5
  },
  finishBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalContent: { 
    backgroundColor: '#0F172A', borderTopLeftRadius: 40, borderTopRightRadius: 40, 
    height: '85%', padding: 30, borderWidth: 1, borderColor: '#1E293B' 
  },
  modalHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 
  },
  modalTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 },
  modalPlayer: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  ratingGroup: { marginBottom: 30 },
  ratingLabel: { color: '#F1F5F9', fontSize: 16, fontWeight: '800', marginBottom: 15 },
  starRow: { flexDirection: 'row', gap: 15 },
  starTouch: { padding: 4 },
  sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 15 },
  notesInput: { 
    backgroundColor: '#1E293B', borderRadius: 20, padding: 20, color: '#F1F5F9', 
    height: 120, fontSize: 16, textAlignVertical: 'top', borderWidth: 1, borderColor: '#334155' 
  },
  saveEvalBtn: { 
    backgroundColor: '#10B981', paddingVertical: 20, borderRadius: 24, 
    alignItems: 'center', marginTop: 40, shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 10
  },
  saveEvalText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});
