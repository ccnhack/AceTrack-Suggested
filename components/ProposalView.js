import React from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, 
  StyleSheet, SafeAreaView, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ProposalView = ({ onBack }) => {
  const handlePrint = () => {
    Alert.alert("Print Feature", "PDF generation is available in the web version. Mobile export coming soon!");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerNav}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={18} color="#0F172A" />
          <Text style={styles.backButtonText}>Back to App</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePrint} style={styles.printButton}>
          <Ionicons name="document-text" size={18} color="#FFFFFF" />
          <Text style={styles.printButtonText}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.docHeader}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>T</Text>
            </View>
            <Text style={styles.brandTitle}>AceTrack</Text>
          </View>
          <Text style={styles.docTitle}>Project Proposal & Technical Documentation</Text>
          <Text style={styles.docMeta}>v1.0 • March 2025 • Confidential</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Executive Summary</Text>
          <Text style={styles.paragraph}>
            AceTrack is a specialized sports management ecosystem built for the "weekend warrior"—working professionals and students who seek competitive play without the administrative burden of self-organizing. Starting with high-density metro markets like Bangalore, AceTrack focuses on skill-based matchmaking, reliable scheduling, and transparent player progression.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Core Features</Text>
          <View style={styles.featureGrid}>
            <View style={styles.featureCol}>
              <Text style={styles.featureColTitle}>Player Experience</Text>
              <Text style={styles.listItem}>• Skill-Based Discovery & Filtering</Text>
              <Text style={styles.listItem}>• Hybrid Credit/Cash Payment Model</Text>
              <Text style={styles.listItem}>• Self-Service Opt-Out & Refunds</Text>
              <Text style={styles.listItem}>• Smart Rescheduling Capability</Text>
              <Text style={styles.listItem}>• ELO-style Rating Tracking</Text>
              <Text style={styles.listItem}>• AI Coaching Integration</Text>
            </View>
            <View style={styles.featureCol}>
              <Text style={styles.featureColTitle}>Admin Operations</Text>
              <Text style={styles.listItem}>• Centralized Participant Registries</Text>
              <Text style={styles.listItem}>• Dynamic Tournament Lifecycle</Text>
              <Text style={styles.listItem}>• Participant Reliability Monitoring</Text>
              <Text style={styles.listItem}>• Automated Result Verification</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Technical Stack</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Layer</Text>
              <Text style={styles.tableHeaderText}>Technology</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Frontend</Text>
              <Text style={styles.tableValue}>React Native (Expo)</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Styling</Text>
              <Text style={styles.tableValue}>Platform StyleSheet</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Intelligence</Text>
              <Text style={styles.tableValue}>Gemini API</Text>
            </View>
            <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.tableLabel}>Architecture</Text>
              <Text style={styles.tableValue}>Component-Driven</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Strategic Roadmap</Text>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapNum}>01</Text>
            <View style={styles.roadmapText}>
              <Text style={styles.roadmapTitle}>Automation (Q3 2025)</Text>
              <Text style={styles.roadmapDesc}>Automated bracket engine and WhatsApp integration for match reminders.</Text>
            </View>
          </View>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapNum}>02</Text>
            <View style={styles.roadmapText}>
              <Text style={styles.roadmapTitle}>Computer Vision (Q4 2025)</Text>
              <Text style={styles.roadmapDesc}>AI-powered match recording with line detection and player heatmaps.</Text>
            </View>
          </View>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapNum}>03</Text>
            <View style={styles.roadmapText}>
              <Text style={styles.roadmapTitle}>Expansion (2026)</Text>
              <Text style={styles.roadmapDesc}>B2B portal for company tournaments and sponsorship engine.</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          AceTrack Sports Technology • CONFIDENTIAL • Do Not Distribute
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  printButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  docHeader: {
    borderBottomWidth: 4,
    borderBottomColor: '#EF4444',
    paddingBottom: 24,
    marginBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  docTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  docMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#334155',
  },
  featureGrid: {
    gap: 24,
  },
  featureCol: {
    gap: 8,
  },
  featureColTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    borderLeftWidth: 4,
    borderLeftColor: '#0F172A',
    paddingLeft: 12,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 12,
    color: '#475569',
    marginLeft: 4,
  },
  tableCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  tableValue: {
    fontSize: 12,
    color: '#64748B',
  },
  roadmapItem: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  roadmapNum: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FECACA',
  },
  roadmapText: {
    flex: 1,
  },
  roadmapTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  roadmapDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 18,
  },
  footer: {
    fontSize: 8,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
});

export default ProposalView;
