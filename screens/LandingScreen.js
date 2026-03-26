import React from 'react';
import { 
  View, Text, TouchableOpacity, Image, StyleSheet, 
  SafeAreaView, Dimensions, ScrollView, StatusBar, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const LandingScreen = ({ onLogin = () => {}, onJoinCircle = () => {} }) => {
  console.log("🎨 LandingScreen Render:", { 
    hasOnLogin: typeof onLogin, 
    hasOnJoinCircle: typeof onJoinCircle 
  });
  const sportIcons = [
    { name: 'badminton', icon: 'shuttlecock', color: '#FFFFFF' }, // Custom icons would be ideal, using Ionicons as fallback
    { name: 'tennis', icon: 'tennisball-outline', color: '#4ADE80' },
    { name: 'soccer', icon: 'football', color: '#22C55E' },
    { name: 'track', icon: 'stats-chart', color: '#EF4444' },
    { name: 'cricket', icon: 'baseball-outline', color: '#94A3B8' },
    { name: 'basketball', icon: 'basketball', color: '#F97316' },
    { name: 'tennis-ball', icon: 'disc-outline', color: '#84CC16' },
    { name: 'running', icon: 'walk', color: '#3B82F6' },
    { name: 'jumping', icon: 'trending-up', color: '#B91C1C' },
    { name: 'hockey', icon: 'analytics', color: '#FFFFFF' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.fullscreenContainer}>
        {/* Full Composite Image Section */}
        <Image 
          source={require('../assets/landing_full.png')}
          style={styles.fullImage}
          resizeMode="cover"
        />
        
        {/* Logo Overlay - Explicitly re-added for branding */}
        <SafeAreaView style={styles.logoOverlay}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoLetter}>T</Text>
            </View>
            <Text style={styles.logoText}>AceTrack</Text>
          </View>
        </SafeAreaView>

        <View style={styles.buttonOverlay}>
          <SafeAreaView>
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.primaryButton} 
                onPress={() => {
                  console.log("🔵 LandingScreen: LOGIN pressed");
                  if (typeof onLogin === 'function') onLogin();
                }}
              >
                <Text style={styles.primaryButtonText}>LOGIN</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryButton} 
                onPress={() => {
                  console.log("🟢 LandingScreen: JOIN press detected. Calling onJoinCircle prop...");
                  if (typeof onJoinCircle === 'function') {
                    onJoinCircle();
                  } else {
                    console.error("❌ LandingScreen: onJoinCircle is not a function!", typeof onJoinCircle);
                  }
                }}
              >
                <View style={styles.secondaryContent}>
                  <Ionicons name="business" size={18} color="#FFFFFF" />
                  <Text style={styles.secondaryButtonText}>JOIN AN ELITE CIRCLE</Text>
                </View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // True black to match reference
  },
  fullscreenContainer: {
    flex: 1,
    width: width,
    height: height,
  },
  fullImage: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  logoOverlay: {
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 100,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D12621',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLetter: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  buttonOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 60,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#D12621', // Specific AceTrack Red
    height: 54,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#333333', // Charcoal grey
    height: 54,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default LandingScreen;
