import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, shadows } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import CorporateLeaguePanel from '../components/CorporateLeaguePanel';

export default function CorporateDashboardScreen({ navigation }) {
  const { currentUser: user } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient 
        colors={[colors.primary.base, colors.primary.dark]} 
        style={styles.pageHeader}
      >
        <View style={styles.headerContent}>
          <Text style={styles.pageTitle}>Corporate Hub</Text>
          <Text style={styles.pageSubtitle}>{user?.name || 'Your Company'}</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Welcome to AceTrack Corporate</Text>
          <Text style={styles.introText}>
            Engage your employees with healthy competition. Track wellness metrics, 
            organize inter-department leagues, and foster team building through sports.
          </Text>
        </View>

        <CorporateLeaguePanel user={user} />
        
        {/* Placeholder for future features */}
        <View style={styles.placeholderCard}>
           <Text style={styles.placeholderTitle}>Manage Departments</Text>
           <Text style={styles.placeholderText}>Create departments and invite employees. (Coming Soon)</Text>
        </View>
        <View style={styles.placeholderCard}>
           <Text style={styles.placeholderTitle}>Corporate Tournaments</Text>
           <Text style={styles.placeholderText}>Host company-wide tournaments. (Coming Soon)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.navy[50] 
  },
  pageHeader: { 
    padding: 24, 
    paddingBottom: 32, 
    borderBottomLeftRadius: 32, 
    borderBottomRightRadius: 32, 
    ...shadows.md 
  },
  headerContent: {
    marginTop: 10
  },
  pageTitle: { 
    ...typography.h1, 
    color: '#FFFFFF',
    textTransform: 'uppercase' 
  },
  pageSubtitle: { 
    fontSize: 14, 
    marginTop: 4, 
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)' 
  },
  content: { 
    flex: 1, 
    padding: 20,
    marginTop: 10
  },
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.navy[100],
    ...shadows.sm
  },
  introTitle: {
    ...typography.h3,
    color: colors.navy[900],
    marginBottom: 8
  },
  introText: {
    fontSize: 14,
    color: colors.navy[500],
    lineHeight: 20
  },
  placeholderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed'
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy[700],
    marginBottom: 4
  },
  placeholderText: {
    fontSize: 12,
    color: colors.navy[400]
  }
});
