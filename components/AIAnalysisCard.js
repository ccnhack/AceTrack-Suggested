import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { aiAnalysisService } from '../services/aiAnalysisService';
import ProUpgradeModal from './ProUpgradeModal';

const AIAnalysisCard = ({ evaluationScores, playerName, playerSkillLevel, isPro, user }) => {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    // Only generate analysis if Pro and scores are present
    if (isPro && evaluationScores && Object.keys(evaluationScores).length > 0) {
      generateAnalysis();
    }
  }, [evaluationScores, isPro]);

  const generateAnalysis = async () => {
    setLoading(true);
    try {
      const result = await aiAnalysisService.generateAnalysis(evaluationScores, playerName, playerSkillLevel);
      setAnalysis(result);
    } catch (error) {
      setAnalysis("We couldn't generate your AI analysis at this time. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    Alert.alert("Share", "This would open the native sharing dialog to share your AI coach's feedback!");
  };

  if (!isPro) {
    return (
      <View style={[styles.container, styles.blurredContainer]}>
        <View style={styles.blurOverlay}>
          <Ionicons name="lock-closed" size={32} color="#1E293B" style={styles.lockIcon} />
          <Text style={styles.lockedTitle}>Pro AI Coach Analysis</Text>
          <Text style={styles.lockedSubtitle}>Unlock AceTrack Pro to get personalized, AI-driven insights on your game after every evaluation.</Text>
          <TouchableOpacity 
            style={styles.upgradeBtn}
            onPress={() => setShowUpgradeModal(true)}
          >
            <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.mockContent}>
          <Text style={styles.title}>AI Coach Analysis</Text>
          <Text style={styles.mockText}>Keep up the great work on the court! Your fundamentals are looking solid... [Unlock to read full analysis]</Text>
        </View>
        <ProUpgradeModal 
          visible={showUpgradeModal} 
          onClose={() => setShowUpgradeModal(false)} 
          user={user}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.loadingText}>Coach AI is analyzing your performance...</Text>
        </View>
      </View>
    );
  }

  if (!analysis) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={styles.iconContainer}>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>AI Coach Analysis</Text>
          </View>
        </View>
        <View style={styles.contentBox}>
          <Text style={styles.analysisText}>Complete a coach evaluation to unlock your personalized AI insights.</Text>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient 
      colors={['#1E1B4B', '#312E81']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { borderColor: '#4F46E5', borderWidth: 1 }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <LinearGradient 
            colors={['#F59E0B', '#D97706']}
            style={styles.iconContainer}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </LinearGradient>
          <Text style={[styles.title, { color: '#FFFFFF' }]}>Deep AI Match Analysis</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-social" size={18} color="#818CF8" />
          <Text style={[styles.shareText, { color: '#818CF8' }]}>Share Insights</Text>
        </TouchableOpacity>
      </View>
      
      <View style={[styles.contentBox, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255,255,255,0.2)' }]}>
        <Text style={[styles.analysisText, { color: '#E0E7FF' }]}>{analysis}</Text>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  blurredContainer: {
    backgroundColor: '#F8FAFC',
    position: 'relative',
    minHeight: 220,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockIcon: {
    marginBottom: 8,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  lockedSubtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  upgradeBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  mockContent: {
    opacity: 0.3,
  },
  mockText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 22,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#64748B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: '#6366F1',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  shareText: {
    color: '#6366F1',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4,
  },
  contentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  analysisText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  }
});

export default AIAnalysisCard;
