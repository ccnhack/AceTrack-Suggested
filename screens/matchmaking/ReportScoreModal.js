import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./MatchmakingScreen.styles";

export const ReportScoreModal = (props) => {
  const { reportScoreMatch, setReportScoreMatch, reportSets, setReportSets, getOpponentName, user, submitScoreReport } = props;
  
  return (
      <Modal visible={!!reportScoreMatch} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>REPORT MATCH SCORE</Text>
                <Text style={styles.modalTitle}>{reportScoreMatch?.sport}</Text>
              </View>
              <TouchableOpacity onPress={() => setReportScoreMatch(null)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>
            
            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionLabel}>Game Scores</Text>
              {reportSets.map((set, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                  <Text style={{ position: 'absolute', left: 0, top: 20, fontSize: 10, fontWeight: '700', color: '#94A3B8', transform: [{rotate: '-90deg'}, {translateX: -15}, {translateY: -15}] }}>SET {idx + 1}</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.detailLabel}>You</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={String(set.score1)}
                      onChangeText={(val) => {
                        const newSets = [...reportSets];
                        newSets[idx].score1 = parseInt(val) || 0;
                        setReportSets(newSets);
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#CBD5E1' }}>-</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.detailLabel}>{getOpponentName(reportScoreMatch)}</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={String(set.score2)}
                      onChangeText={(val) => {
                        const newSets = [...reportSets];
                        newSets[idx].score2 = parseInt(val) || 0;
                        setReportSets(newSets);
                      }}
                    />
                  </View>
                </View>
              ))}
              
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 5, marginBottom: 15 }}>
                {reportSets.length < 5 && (
                  <TouchableOpacity 
                    style={[styles.smallBtn, { backgroundColor: '#EEF2FF' }]}
                    onPress={() => setReportSets([...reportSets, { score1: 0, score2: 0 }])}
                  >
                    <Text style={[styles.smallBtnText, { color: '#6366F1' }]}>+ Add Set</Text>
                  </TouchableOpacity>
                )}
                {reportSets.length > 1 && (
                  <TouchableOpacity 
                    style={[styles.smallBtn, { backgroundColor: '#FEF2F2' }]}
                    onPress={() => setReportSets(reportSets.slice(0, -1))}
                  >
                    <Text style={[styles.smallBtnText, { color: '#EF4444' }]}>- Remove Set</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={submitScoreReport}>
              <Text style={styles.confirmBtnText}>Finalize Match</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
  );
};
