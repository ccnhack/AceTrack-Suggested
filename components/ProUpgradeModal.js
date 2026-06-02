import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import config from '../config';
import storage from '../utils/storage';
import { useAuthStore, usePlayersStore } from '../stores';

const ProUpgradeModal = ({ visible, onClose, user }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState('monthly'); // 'monthly' | 'annual'

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const token = await storage.getItem('userToken');
      const endpoint = config.getEndpoint('SUBSCRIBE_PRO');
      const response = await fetch(`${config.API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Id': user.id
        },
        body: JSON.stringify({ tier: selectedTier })
      });
      
      const result = await response.json();
      if (response.ok && result.success) {
        // Update local stores
        useAuthStore.getState().setCurrentUser(result.user);
        const players = usePlayersStore.getState().players;
        usePlayersStore.getState().setPlayers(players.map(p => p.id === user.id ? result.user : p));
        
        Alert.alert('Welcome to Pro!', 'Your subscription is active.');
        onClose();
      } else {
        Alert.alert('Subscription Failed', result.message || 'Something went wrong.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Network Error', 'Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    'Deep AI Match Analysis',
    'Historical TrueSkill Trends',
    'Download Unwatermarked Videos',
    'Priority Customer Support'
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroSection}>
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              style={styles.proBadge}
            >
              <Text style={styles.proBadgeText}>PRO</Text>
            </LinearGradient>
            <Text style={styles.title}>Elevate Your Game</Text>
            <Text style={styles.subtitle}>Unlock professional tools to analyze your performance and win more matches.</Text>
          </View>

          <View style={styles.featuresList}>
            {features.map((feat, idx) => (
              <View key={idx} style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={styles.featureText}>{feat}</Text>
              </View>
            ))}
          </View>

          <View style={styles.tiersContainer}>
            <TouchableOpacity 
              style={[styles.tierCard, selectedTier === 'monthly' && styles.tierCardActive]}
              onPress={() => setSelectedTier('monthly')}
            >
              <Text style={[styles.tierDuration, selectedTier === 'monthly' && { color: '#0F172A' }]}>Monthly</Text>
              <Text style={[styles.tierPrice, selectedTier === 'monthly' && { color: '#0F172A' }]}>₹499<Text style={styles.tierPeriod}>/mo</Text></Text>
              {selectedTier === 'monthly' && <View style={styles.radioActive} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tierCard, selectedTier === 'annual' && styles.tierCardActive]}
              onPress={() => setSelectedTier('annual')}
            >
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>SAVE 20%</Text>
              </View>
              <Text style={[styles.tierDuration, selectedTier === 'annual' && { color: '#0F172A' }]}>Annual</Text>
              <Text style={[styles.tierPrice, selectedTier === 'annual' && { color: '#0F172A' }]}>₹4,999<Text style={styles.tierPeriod}>/yr</Text></Text>
              {selectedTier === 'annual' && <View style={styles.radioActive} />}
            </TouchableOpacity>
          </View>

        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.subscribeBtn} 
            onPress={handleSubscribe}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              style={styles.gradientBtn}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>Subscribe Now</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.terms}>Recurring billing. Cancel anytime.</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  content: {
    padding: 24,
    paddingTop: 12,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  proBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
  },
  proBadgeText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  featuresList: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  tiersContainer: {
    gap: 16,
  },
  tierCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  tierCardActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  tierDuration: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  tierPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#64748B',
  },
  tierPeriod: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  saveBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  saveText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  radioActive: {
    position: 'absolute',
    left: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  footer: {
    padding: 24,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  subscribeBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gradientBtn: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  terms: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  }
});

export default ProUpgradeModal;
