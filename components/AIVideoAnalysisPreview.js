import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ProGate from './ProGate';

const AIVideoAnalysisPreview = ({ user }) => {
  return (
    <ProGate user={user} featureName="AI Video Analysis">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Performance Insights</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PRO</Text>
          </View>
        </View>

        <View style={styles.mockContent}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Serve Accuracy</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '78%' }]} />
            </View>
            <Text style={styles.statValue}>78%</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Unforced Errors</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '32%', backgroundColor: '#EF4444' }]} />
            </View>
            <Text style={styles.statValue}>32%</Text>
          </View>

          <View style={styles.insightBox}>
            <Text style={styles.insightTitle}>💡 AI Coaching Tip</Text>
            <Text style={styles.insightText}>Your forehand topspin consistency drops during long rallies. Focus on maintaining shoulder rotation.</Text>
          </View>
        </View>
      </View>
    </ProGate>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#D97706',
    fontWeight: '900',
    fontSize: 10,
  },
  mockContent: {
    gap: 16,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statLabel: {
    width: 110,
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  statValue: {
    width: 36,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'right',
  },
  insightBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  insightTitle: {
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 6,
  },
  insightText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  }
});

export default AIVideoAnalysisPreview;
