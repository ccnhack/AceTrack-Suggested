import React, { useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, Image, StyleSheet, 
  SafeAreaView, Dimensions, StatusBar, Platform, PixelRatio
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const LandingScreen = ({ onLogin = () => {}, onJoinCircle = () => {} }) => {
  
  useEffect(() => {
    // 📱 iOS PREMIUM DIAGNOSTIC
    console.log(`🍎 [iOS] LandingScreen Dimensions: ${JSON.stringify({
      window: { width, height },
      pixelRatio: PixelRatio.get(),
      isTallScreen: height > 800, // iPhone X, 11, 12, 13, 14, 15, 16
    })}`);
  }, []);

  const isTallScreen = height > 800;

  return (
    <View testID="app.landing.screen" style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.fullscreenContainer}>
        <Image 
          source={require('../assets/ChatGPT.png')}
          style={styles.fullImage}
          resizeMode="cover"
        />
        
        {/* Live Text Overlay - Shifted UP on iOS to avoid emoji footer clutter */}
        <View style={styles.textOverlay}>
          <Text style={styles.headingText}>
            STAY AHEAD. ACHIEVE EXCELLENCE.{"\n"}
            UPCOMING MATCHES &{"\n"}
            GLOBAL TOURNAMENTS
          </Text>
          <Text style={styles.subHeadingText}>
            The ultimate platform for ambitious athletes. Track results, discover multi-sport events, and compete on international leaderboards.
          </Text>
        </View>
        
        {/* Logo Overlay - Higher padding for Notch */}
        <SafeAreaView style={styles.logoOverlay}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoLetter}>T</Text>
            </View>
            <Text style={styles.logoText}>AceTrack</Text>
          </View>
        </SafeAreaView>

        {/* Buttons Overlay */}
        <View style={styles.buttonOverlay}>
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              testID="landing.login.btn"
              style={styles.primaryButton} 
              onPress={() => {
                console.log("🍎 iOS Landing: LOGIN pressed");
                onLogin();
              }}
            >
              <Text style={styles.primaryButtonText}>LOGIN</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              testID="landing.signup.btn"
              style={styles.secondaryButton} 
              onPress={() => {
                console.log("🍎 iOS Landing: JOIN pressed");
                onJoinCircle();
              }}
            >
              <View style={styles.secondaryContent}>
                <Ionicons name="business" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>JOIN AN ELITE CIRCLE</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenContainer: {
    flex: 1,
  },
  fullImage: {
    position: 'absolute',
    bottom: height > 800 ? 50 : 30, // Universal shift UP to clear icons from buttons
    left: 0,
    width: '100%',
    height: '100%',
  },
  logoOverlay: {
    position: 'absolute',
    top: height > 800 ? 60 : 40, // More breathing room for Notch
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
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
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  buttonOverlay: {
    position: 'absolute',
    bottom: height > 800 ? 35 : 20, // Lowered buttons for better balance (v2.6.51)
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#D12621',
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D12621',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    letterSpacing: 0.3,
  },
  textOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    // Fix: Moved UP to clear the emoji clutter seen in the dashboard screenshot
    top: height > 800 ? (height * 0.38) : (height * 0.35), 
    zIndex: 10,
  },
  headingText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginBottom: 8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subHeadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    opacity: 0.95,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default LandingScreen;
