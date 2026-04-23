import React, { useEffect, useState } from 'react';
import { 
  View, Text, TouchableOpacity, Image, StyleSheet, 
  SafeAreaView, Dimensions, StatusBar, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const LandingScreenWeb = ({ onLogin = () => {} }) => {
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  const { width, height } = dimensions;
  const isMobile = width < 768;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Background Layer - Full Immersion */}
      <View style={styles.backgroundLayer}>
        <Image 
          source={require('../assets/ChatGPT.png')}
          style={[styles.fullImage, { top: isMobile ? 40 : 60 }]}
          resizeMode="cover"
        />
        {/* Cinematic Gradient Overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Premium Header */}
      <SafeAreaView style={styles.header}>
        <View style={[styles.headerContent, { paddingHorizontal: isMobile ? 24 : '10%', paddingVertical: isMobile ? 15 : 30 }]}>
          <View style={styles.logoRow}>
            <View style={[styles.logoIcon, isMobile && { width: 32, height: 32, borderRadius: 8 }]}>
              <Text style={[styles.logoLetter, isMobile && { fontSize: 18 }]}>T</Text>
            </View>
            <Text style={[styles.logoText, isMobile && { fontSize: 22 }]}>AceTrack</Text>
          </View>
        </View>
      </SafeAreaView>

      <View 
        style={[styles.mainContent, { 
          paddingTop: isMobile ? '20%' : '10%', 
          paddingHorizontal: isMobile ? 24 : '10%',
          justifyContent: isMobile ? 'center' : 'flex-start'
        }]}
      >
        <View style={styles.heroSection}>
          <Text style={[styles.heroBadge, isMobile && { fontSize: 12, marginBottom: 8 }]}>PREMIUM MANAGEMENT PORTAL</Text>
          <Text style={[styles.headingText, { 
            fontSize: isMobile ? 28 : 72, 
            lineHeight: isMobile ? 34 : 80,
            marginBottom: isMobile ? 16 : 24
          }]}>
            ELEVATE YOUR GAME.{"\n"}
            <Text style={styles.accentText}>ACHIEVE EXCELLENCE.</Text>
          </Text>
          
          <Text style={[styles.subHeadingText, { 
            fontSize: isMobile ? 14 : 22, 
            lineHeight: isMobile ? 20 : 34,
            marginBottom: isMobile ? 32 : 48
          }]}>
            The industry-standard platform for ambitious athletes and professional managers. 
            Track real-time results, discover global events, and dominate leaderboards.
          </Text>
        </View>

        {/* Action Button */}
        <View style={[styles.actionContainer, isMobile && { width: '100%', maxWidth: 260 }]}>
          <TouchableOpacity 
            style={[styles.webStartButton, isMobile && { paddingVertical: 14 }]}
            onPress={onLogin}
          >
            <Text style={[styles.webStartText, isMobile && { fontSize: 16 }]}>GET STARTED</Text>
            <Ionicons name="arrow-forward" size={isMobile ? 18 : 20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer Branding - Conditional and Compact */}
      <View style={[styles.webFooter, isMobile ? styles.mobileFooterFixed : { left: '10%', right: '10%' }]}>
        <Text style={styles.webFooterText}>
          {isMobile ? '© 2024 AceTrack' : '© 2024 AceTrack Technologies. All Rights Reserved.'}
        </Text>
        {!isMobile && (
          <View style={styles.footerLinks}>
            <Text style={styles.footerLink}>Security</Text>
            <Text style={styles.footerLink}>Privacy</Text>
            <Text style={styles.footerLink}>Support</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
    backgroundColor: '#000000',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#D12621',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D12621',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  logoLetter: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 24,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  mainContent: {
    flex: 1,
  },
  heroSection: {
    maxWidth: 900,
  },
  heroBadge: {
    color: '#D12621',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
    opacity: 0.9,
  },
  headingText: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -1,
  },
  accentText: {
    color: 'rgba(255,255,255,0.7)',
  },
  subHeadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '400',
    maxWidth: 600,
  },
  actionContainer: {
    width: 260,
  },
  webStartButton: {
    backgroundColor: '#D12621',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 12,
    shadowColor: '#D12621',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  webStartText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  webFooter: {
    position: 'absolute',
    bottom: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 15,
  },
  mobileFooterFixed: {
    left: 24,
    right: 24,
    justifyContent: 'center',
  },
  webFooterText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
  },
  footerLink: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  }
});

export default LandingScreenWeb;
