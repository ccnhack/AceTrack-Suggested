import React, { useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, Image, StyleSheet, 
  SafeAreaView, Dimensions, StatusBar, Platform, PixelRatio
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const LandingScreen = ({ onLogin = () => {}, onJoinCircle = () => {} }) => {
  
  useEffect(() => {
    // DIAGNOSTIC LOGGING - To help find the ratio issue
    console.log(`📱 [DIAGNOSTIC] LandingScreen Dimensions: ${JSON.stringify({
      window: { width, height },
      screen: { 
        width: Dimensions.get('screen').width, 
        height: Dimensions.get('screen').height 
      },
      pixelRatio: PixelRatio.get(),
      platform: Platform.OS,
      isTallScreen: height > 800,
      isShortScreen: height < 700
    })}`);
  }, []);

  const isShortScreen = height < 750; // Increased threshold for better coverage

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
        
        {/* Logo Overlay */}
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
                  onLogin();
                }}
              >
                <Text style={styles.primaryButtonText}>LOGIN</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryButton} 
                onPress={() => {
                  console.log("🟢 LandingScreen: JOIN pressed");
                  onJoinCircle();
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
    backgroundColor: '#000000',
  },
  fullscreenContainer: {
    flex: 1,
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
    top: Platform.OS === 'ios' ? 60 : (height < 750 ? 25 : 40),
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
    paddingBottom: Platform.OS === 'ios' ? 40 : (height < 750 ? 25 : 60),
  },
  buttonContainer: {
    gap: height < 750 ? 8 : 12,
  },
  primaryButton: {
    backgroundColor: '#D12621',
    height: 54,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#333333',
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
