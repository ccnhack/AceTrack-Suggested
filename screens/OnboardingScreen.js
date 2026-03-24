import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

/**
 * 🎯 Onboarding Screen
 * UX Fix: Guided 3-screen walkthrough for first-time users
 */

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_SLIDES = [
  {
    id: 1,
    icon: 'trophy',
    title: 'Welcome to AceTrack',
    subtitle: 'Your complete sports companion for Badminton, Table Tennis & Cricket',
    description: 'Find tournaments, track your skills, and compete with players in your city.',
    color: '#3B82F6',
    iconColor: '#60A5FA',
  },
  {
    id: 2,
    icon: 'analytics',
    title: 'Track Your Progress',
    subtitle: 'TrueSkill ratings, match analytics, and personalized insights',
    description: 'Get detailed stats on your game — rally length, shot distribution, and win rates. Watch your rating climb.',
    color: '#8B5CF6',
    iconColor: '#A78BFA',
  },
  {
    id: 3,
    icon: 'people',
    title: 'Join the Community',
    subtitle: 'Academies, coaches, and players — all in one place',
    description: 'Register for tournaments, get evaluated by coaches, and watch your match recordings with AI highlights.',
    color: '#10B981',
    iconColor: '#34D399',
  },
];

const OnboardingScreen = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateTransition = (toSlide) => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -50, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(50),
    ]).start(() => {
      setCurrentSlide(toSlide);
      slideAnim.setValue(50);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleNext = () => {
    if (currentSlide < ONBOARDING_SLIDES.length - 1) {
      animateTransition(currentSlide + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => handleComplete();

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch (e) { /* silent */ }
    onComplete();
  };

  const slide = ONBOARDING_SLIDES[currentSlide];
  const isLast = currentSlide === ONBOARDING_SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide content */}
      <Animated.View style={[styles.slideContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={[styles.iconCircle, { backgroundColor: slide.color + '20' }]}>
          <Ionicons name={slide.icon} size={64} color={slide.iconColor} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </Animated.View>

      {/* Dots */}
      <View style={styles.dotsContainer}>
        {ONBOARDING_SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentSlide && { backgroundColor: slide.color, width: 24 },
            ]}
          />
        ))}
      </View>

      {/* Action button */}
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: slide.color }]}
        onPress={handleNext}
      >
        <Text style={styles.actionText}>
          {isLast ? "Let's Get Started" : 'Next'}
        </Text>
        <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={20} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '500',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    marginHorizontal: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    gap: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
