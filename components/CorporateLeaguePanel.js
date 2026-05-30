import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, shadows } from '../theme/designSystem';
import CorporateService from '../services/CorporateService';
import { usePlayersStore } from '../stores';
import { useTournamentsStore } from '../stores';

export default function CorporateLeaguePanel({ user }) {
  const { players } = usePlayersStore();
  const { matches = [] } = useTournamentsStore(); // Reusing the matches from tournament store, or should we use matches from video store? Actually we need match results
  
  // Mock departments for demonstration since we don't have a department creator UI yet
  const [departments, setDepartments] = useState([
    { id: 'd1', name: 'Engineering', employeeIds: [] },
    { id: 'd2', name: 'Sales & Marketing', employeeIds: [] },
    { id: 'd3', name: 'HR & Ops', employeeIds: [] },
  ]);

  const [standings, setStandings] = useState([]);
  const [metrics, setMetrics] = useState({ totalEmployees: 0, activeEmployees: 0, participationRate: 0 });

  useEffect(() => {
    // In a real implementation, employeeIds would come from the backend.
    // Here we'll mock it by randomly assigning corporate employees to departments for the demo
    const corporateEmployees = players.filter(p => p.role === 'user');
    
    const updatedDepartments = departments.map((d, index) => {
      // Just split them roughly evenly
      const empIds = corporateEmployees
        .filter((_, i) => i % 3 === index)
        .map(p => p.id);
      return { ...d, employeeIds: empIds };
    });

    const newStandings = CorporateService.calculateDepartmentStandings(updatedDepartments, corporateEmployees, matches);
    const newMetrics = CorporateService.calculateWellnessMetrics(updatedDepartments, corporateEmployees);
    
    setStandings(newStandings);
    setMetrics(newMetrics);
  }, [players, matches]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Corporate Wellness & League</Text>
      
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metrics.activeEmployees}</Text>
          <Text style={styles.metricLabel}>Active Players</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{Math.round(metrics.participationRate)}%</Text>
          <Text style={styles.metricLabel}>Participation</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{matches.length}</Text>
          <Text style={styles.metricLabel}>Matches</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>Inter-Department Leaderboard</Text>
      
      <View style={styles.leaderboardContainer}>
        {standings.map((dept, index) => (
          <View key={dept.id} style={styles.leaderboardRow}>
            <View style={[styles.rankBadge, index === 0 && styles.rankBadgeGold, index === 1 && styles.rankBadgeSilver, index === 2 && styles.rankBadgeBronze]}>
              <Text style={[styles.rankText, index < 3 && styles.rankTextTop]}>{index + 1}</Text>
            </View>
            <View style={styles.deptInfo}>
              <Text style={styles.deptName}>{dept.name}</Text>
              <Text style={styles.empCount}>{dept.employeeIds.length} Employees</Text>
            </View>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsValue}>{dept.points}</Text>
              <Text style={styles.pointsLabel}>PTS</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.navy[100],
    ...shadows.sm
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.navy[900],
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy[800],
    marginBottom: 12,
    marginTop: 8
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary.base,
    marginBottom: 4
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy[500]
  },
  leaderboardContainer: {
    gap: 12
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  rankBadgeGold: { backgroundColor: '#FEF3C7' },
  rankBadgeSilver: { backgroundColor: '#F1F5F9' },
  rankBadgeBronze: { backgroundColor: '#FFEDD5' },
  rankText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#64748B'
  },
  rankTextTop: { color: '#0F172A' },
  deptInfo: {
    flex: 1
  },
  deptName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy[900],
    marginBottom: 2
  },
  empCount: {
    fontSize: 12,
    color: colors.navy[500],
    fontWeight: '500'
  },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12
  },
  pointsValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary.base
  },
  pointsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary.base,
    marginTop: 2
  }
});
