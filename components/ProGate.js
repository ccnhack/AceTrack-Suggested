import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import ProUpgradeModal from './ProUpgradeModal';

const ProGate = ({ user, children, featureName = 'Premium Feature' }) => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isPro = user?.isPro === true;

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {/* Render children underneath but disable pointer events */}
      <View pointerEvents="none">
        {children}
      </View>

      {/* Blur Overlay */}
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* CTA Overlay */}
      <View style={styles.overlayContent}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed" size={32} color="#FBBF24" />
        </View>
        <Text style={styles.title}>Unlock {featureName}</Text>
        <Text style={styles.subtitle}>
          Get AceTrack Pro to access advanced analytics, AI match highlights, and more.
        </Text>
        
        <TouchableOpacity 
          style={styles.upgradeBtn}
          onPress={() => setShowUpgradeModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            style={styles.gradientBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="star" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Upgrade to Pro</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ProUpgradeModal 
        visible={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        user={user}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#CBD5E1',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  upgradeBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 240,
  },
  gradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  btnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  }
});

export default ProGate;
