import React, { useState, useEffect } from 'react';
import { 
  View, Text, Image, TouchableOpacity, StyleSheet, 
  Modal, Dimensions, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import logger from '../utils/logger';

const { width, height } = Dimensions.get('window');
const DEMO_SEEN_KEY = '@acetrack_academy_demo_seen_v1';

const DEMO_SLIDES = [
  {
    id: 'events',
    title: 'Host Tournaments',
    description: 'Create and manage premium tennis events, set entry fees, and track your revenue.',
    image: require('../assets/demo/academy_demo_events.png'),
    icon: 'calendar',
    color: '#3B82F6',
  },
  {
    id: 'scouts',
    title: 'Scout Feed',
    description: 'Discover promising talent with deep player analytics and TrueSkill radar charts.',
    image: require('../assets/demo/academy_demo_scouts.png'),
    icon: 'analytics',
    color: '#10B981',
  },
  {
    id: 'blast',
    title: 'Blast Messages',
    description: 'Send bulk push notifications directly to players across all your tournaments.',
    image: require('../assets/demo/academy_demo_blast.png'),
    icon: 'megaphone',
    color: '#8B5CF6',
  },
];

export const useAcademyInteractiveDemo = (user) => {
  const [showDemo, setShowDemo] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const checkDemoStatus = async () => {
      try {
        if (!user || user.role !== 'academy') {
          setHasChecked(true);
          return;
        }
        const seen = await AsyncStorage.getItem(DEMO_SEEN_KEY);
        if (!seen) {
          setShowDemo(true);
        }
      } catch (err) {
        logger.error('Failed to read academy demo status', { error: err.message });
      } finally {
        setHasChecked(true);
      }
    };
    checkDemoStatus();
  }, [user]);

  const markDemoSeen = async () => {
    try {
      await AsyncStorage.setItem(DEMO_SEEN_KEY, 'true');
      setShowDemo(false);
    } catch (err) {
      logger.error('Failed to save academy demo status', { error: err.message });
      setShowDemo(false);
    }
  };

  return { showDemo, hasChecked, markDemoSeen };
};

const AcademyInteractiveDemo = ({ visible, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < DEMO_SLIDES.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!visible) return null;

  const currentSlide = DEMO_SLIDES[currentIndex];
  const isLast = currentIndex === DEMO_SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip Demo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.imageContainer}>
            <Image 
              source={currentSlide.image}
              style={styles.mockupImage}
              resizeMode="contain"
            />
            <LinearGradient
              colors={['transparent', 'rgba(15, 23, 42, 0.9)']}
              style={styles.imageOverlay}
            />
          </View>

          <View style={styles.textContainer}>
            <View style={[styles.iconBadge, { backgroundColor: currentSlide.color + '20' }]}>
              <Ionicons name={currentSlide.icon} size={28} color={currentSlide.color} />
            </View>
            <Text style={styles.title}>{currentSlide.title}</Text>
            <Text style={styles.description}>{currentSlide.description}</Text>
            
            <View style={styles.pagination}>
              {DEMO_SLIDES.map((_, idx) => (
                <View 
                  key={idx} 
                  style={[
                    styles.dot, 
                    idx === currentIndex && [styles.dotActive, { backgroundColor: currentSlide.color }]
                  ]} 
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            onPress={handleNext} 
            activeOpacity={0.8}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={[currentSlide.color, currentSlide.color + 'DD']}
              style={styles.nextBtn}
            >
              <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
              <Ionicons 
                name={isLast ? 'checkmark' : 'arrow-forward'} 
                size={20} 
                color="#FFF" 
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    zIndex: 10,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  skipText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    width: width * 0.85,
    height: height * 0.48,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  mockupImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -40,
    zIndex: 5,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 48,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  dotActive: {
    width: 24,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});

export default AcademyInteractiveDemo;
