import React, { useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, Image, StyleSheet, 
  SafeAreaView, Dimensions, StatusBar, Platform, PixelRatio
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

const LandingScreen = ({ onLogin = () => {}, onJoinCircle = () => {} }) => {
  
  useEffect(() => {
    // DIAGNOSTIC LOGGING
    console.log("📱 [DIAGNOSTIC] LandingScreen Dimensions:", {
      window: { width, height },
      screen: { screenWidth, screenHeight },
      pixelRatio: PixelRatio.get(),
      fontScale: PixelRatio.getFontScale(),
      platform: Platform.OS,
      osVersion: Platform.Version,
      isTallScreen: height > 800,
      isShortScreen: height < 700
    });
  }, []);

  const sportEmojis = ['🏸', '🎾', '⚽', '🏃', '🏏', '🏀', '🏒', '🥊', '🏊', '⛳'];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* BACKGROUND IMAGE - Using Final2.png athletes-only zone */}
      <View style={styles.backgroundContainer}>
        <Image 
          source={require('../assets/landing_full.png')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
        {/* Dark overlay to ensure text readability and blend with bottom */}
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', '#000000']}
          locations={[0, 0.4, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* TOP BRANDING */}
      <SafeAreaView style={styles.logoContainer}>
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoLetter}>T</Text>
          </View>
          <Text style={styles.logoText}>AceTrack</Text>
        </View>
      </SafeAreaView>

      {/* NATIVE CONTENT AREA - Ensuring responsiveness */}
      <View style={styles.contentOverlay}>
        <SafeAreaView style={styles.safeContent}>
          
          <View style={styles.textSection}>
            <Text style={styles.headline}>
              STAY AHEAD. ACHIEVE{'\n'}EXCELLENCE.{'\n'}UPCOMING MATCHES &{'\n'}GLOBAL TOURNAMENTS
            </Text>
            
            <Text style={styles.subtitle}>
              AceTrack: The ultimate platform for ambitious athletes. Track results, discover multi-sport events, and compete on international leaderboards.
            </Text>

            {/* SPORT ICONS ROW - Native rebuild */}
            <View style={styles.sportIconsRow}>
              {sportEmojis.map((emoji, index) => (
                <Text key={index} style={styles.sportEmoji}>{emoji}</Text>
              ))}
            </View>
          </View>

          {/* BUTTONS SECTION */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.primaryButton} 
              onPress={() => {
                console.log("🔵 LandingScreen: LOGIN pressed");
                if (typeof onLogin === 'function') onLogin();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>LOGIN</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryButton} 
              onPress={() => {
                console.log("🟢 LandingScreen: JOIN pressed");
                if (typeof onJoinCircle === 'function') onJoinCircle();
              }}
              activeOpacity={0.8}
            >
              <View style={styles.secondaryContent}>
                <Ionicons name="business" size={20} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>JOIN AN ELITE CIRCLE</Text>
              </View>
            </TouchableOpacity>
          </View>

        </SafeAreaView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '70%', // Background image only takes top 70% to avoid cluttering bottom
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  logoContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 40,
    left: 24,
    zIndex: 10,
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
  contentOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  safeContent: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 20 : 40,
  },
  textSection: {
    marginBottom: 24,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: height < 700 ? 18 : 22,
    fontWeight: '800',
    lineHeight: height < 700 ? 24 : 30,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: height < 700 ? 12 : 13,
    lineHeight: height < 700 ? 17 : 20,
    marginBottom: 16,
  },
  sportIconsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: height < 700 ? 8 : 12,
  },
  sportEmoji: {
    fontSize: height < 700 ? 20 : 26,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#D12621',
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
    backgroundColor: '#1E293B',
    height: 54,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
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
