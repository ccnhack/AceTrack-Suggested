/**
 * ⚡ QuickEvaluationView — v2.6.566
 * Simplified 4-metric evaluation for fast tournament scoring.
 * Maps 4 quick scores back to the full evaluation structure so that
 * EvaluationService and useEvaluationsStore remain unchanged.
 */
import React, { useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/designSystem';
import { Sport } from '../types';

/**
 * Quick evaluation metrics — maps to the full rubric internally.
 */
const QUICK_METRICS = [
  {
    key: 'overallSkill',
    label: 'Overall Skill',
    icon: 'star',
    description: 'General playing ability and consistency',
    maps: ['serve', 'control', 'return'], // Maps to these full rubric keys
    weight: 2.0,
  },
  {
    key: 'movement',
    label: 'Court Movement',
    icon: 'walk',
    description: 'Footwork, positioning, and coverage',
    maps: ['footwork'],
    weight: 1.0,
  },
  {
    key: 'consistency',
    label: 'Consistency',
    icon: 'sync',
    description: 'Shot accuracy and error rate',
    maps: ['rally', 'defense'],
    weight: 1.0,
  },
  {
    key: 'gameSense',
    label: 'Game Sense',
    icon: 'bulb',
    description: 'Strategy, shot selection, and adaptability',
    maps: ['strategy', 'attack'],
    weight: 1.0,
  },
];

const StarRating = memo(({ value, onChange, maxStars = 5 }) => (
  <View style={starStyles.container}>
    {Array.from({ length: maxStars }, (_, i) => (
      <TouchableOpacity
        key={`star-${i}`}
        onPress={() => onChange(i + 1)}
        style={starStyles.starBtn}
        activeOpacity={0.6}
      >
        <Ionicons
          name={i < value ? 'star' : 'star-outline'}
          size={32}
          color={i < value ? '#F59E0B' : '#CBD5E1'}
        />
      </TouchableOpacity>
    ))}
  </View>
));

/**
 * Convert quick scores (1-5 stars) to the full 0-10 evaluation scores object.
 * Each star = 2 points on the 10-scale.
 */
const mapQuickToFull = (quickScores) => {
  const fullScores = {};
  
  QUICK_METRICS.forEach(metric => {
    const quickValue = quickScores[metric.key] || 0;
    const mappedValue = quickValue * 2; // 1-5 stars → 2-10 scale
    
    metric.maps.forEach(fullKey => {
      fullScores[fullKey] = mappedValue;
    });
  });

  return fullScores;
};

const QuickEvaluationView = memo(({ onSubmit, playerName, sport }) => {
  const [scores, setScores] = useState({
    overallSkill: 0,
    movement: 0,
    consistency: 0,
    gameSense: 0,
  });

  const updateScore = (key, value) => {
    setScores(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const allRated = QUICK_METRICS.every(m => scores[m.key] > 0);
    if (!allRated) {
      Alert.alert('Incomplete', 'Please rate all 4 metrics before submitting.');
      return;
    }

    // Map quick scores to the full evaluation structure
    const fullScores = mapQuickToFull(scores);
    
    // Calculate weighted average for display
    const totalWeight = QUICK_METRICS.reduce((sum, m) => sum + m.weight, 0);
    const weightedSum = QUICK_METRICS.reduce((sum, m) => sum + (scores[m.key] * m.weight), 0);
    const averageScore = ((weightedSum / totalWeight) * 2); // Convert to 10-scale

    onSubmit({
      scores: fullScores,
      averageScore: Math.round(averageScore * 10) / 10,
      isQuickEvaluation: true,
    });
  };

  const isComplete = QUICK_METRICS.every(m => scores[m.key] > 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerBadge}>
        <Ionicons name="flash" size={14} color="#F59E0B" />
        <Text style={styles.headerBadgeText}>QUICK RATE</Text>
      </View>
      
      {playerName && (
        <Text style={styles.playerLabel}>
          Rating: <Text style={styles.playerName}>{playerName}</Text>
        </Text>
      )}

      {QUICK_METRICS.map(metric => (
        <View key={metric.key} style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <View style={styles.metricIconBg}>
              <Ionicons name={metric.icon} size={18} color="#6366F1" />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricDesc}>{metric.description}</Text>
            </View>
            {scores[metric.key] > 0 && (
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreCircleText}>{scores[metric.key] * 2}</Text>
              </View>
            )}
          </View>
          <StarRating
            value={scores[metric.key]}
            onChange={(val) => updateScore(metric.key, val)}
          />
        </View>
      ))}

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!isComplete}
        style={{ borderRadius: 16, overflow: 'hidden', marginTop: 16, opacity: isComplete ? 1 : 0.5 }}
      >
        <LinearGradient
          colors={isComplete ? ['#6366F1', '#4F46E5'] : ['#CBD5E1', '#94A3B8']}
          style={styles.submitBtn}
        >
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.submitBtnText}>Submit Quick Rating</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
});

QuickEvaluationView.displayName = 'QuickEvaluationView';

// Export the mapper for external use (e.g., testing)
export { mapQuickToFull, QUICK_METRICS };

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: 1,
  },
  playerLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  playerName: {
    fontWeight: '800',
    color: '#0F172A',
  },
  metricCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricInfo: {
    flex: 1,
    marginLeft: 12,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  scoreCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreCircleText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.3,
  },
});

const starStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
});

export default QuickEvaluationView;
