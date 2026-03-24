import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

const LandingScreen = ({ onLogin, onSignup }) => (
  <View style={styles.container}>
    <View style={styles.imageContainer}>
      <Image 
        source={{ uri: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop" }} 
        style={styles.image} 
      />
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>T</Text>
        </View>
        <Text style={styles.logoText}>AceTrack</Text>
      </View>
    </View>
    
    <View style={styles.content}>
      <Text style={styles.headline}>
        STAY UPTO DATE WITH THE <Text style={styles.highlight}>UPCOMING MATCHES</Text> & TOURNAMENTS
      </Text>
      <Text style={styles.description}>
        Join the elite circle of amateur athletes. Track your progress, find matches, and climb the leaderboards.
      </Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          onPress={onLogin}
          style={styles.loginButton}
        >
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={onSignup}
          style={styles.signupButton}
        >
          <Text style={styles.signupButtonText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  imageContainer: {
    height: height * 0.35,
    minHeight: 220,
    backgroundColor: '#000',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  logoContainer: {
    position: 'absolute',
    top: 60,
    left: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 32,
    height: 32,
    backgroundColor: '#EF4444',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 28,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  highlight: {
    color: '#EF4444',
    textDecorationLine: 'underline',
  },
  description: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    gap: 12,
    paddingBottom: 16,
  },
  loginButton: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#EF4444',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  signupButton: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: '#334155',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default LandingScreen;
