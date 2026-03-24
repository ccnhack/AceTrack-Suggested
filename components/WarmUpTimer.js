import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ⏱️ Warm-Up Timer Component
 * COACH Fix: Configurable countdown timer for match warm-up periods
 */

const WarmUpTimer = ({ 
  durationMinutes = 5, 
  onComplete, 
  onCancel,
  courtName = '',
  player1Name = '',
  player2Name = '' 
}) => {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning && !isPaused && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setIsRunning(false);
            // Haptic feedback / vibration when timer ends
            if (Platform.OS !== 'web') {
              try { Vibration.vibrate([0, 500, 200, 500, 200, 500]); } catch(e) {}
            }
            if (onComplete) onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, isPaused, secondsLeft]);

  // Pulse animation when < 30 seconds
  useEffect(() => {
    if (secondsLeft <= 30 && secondsLeft > 0 && isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [secondsLeft <= 30 && isRunning]);

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => setIsPaused(!isPaused);

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setSecondsLeft(durationMinutes * 60);
    setIsRunning(false);
    setIsPaused(false);
  };

  const progress = 1 - (secondsLeft / (durationMinutes * 60));
  const isUrgent = secondsLeft <= 30 && secondsLeft > 0;

  return (
    <View style={styles.container}>
      {courtName ? <Text style={styles.courtName}>{courtName}</Text> : null}
      
      {player1Name && player2Name ? (
        <Text style={styles.matchup}>{player1Name} vs {player2Name}</Text>
      ) : null}

      <Animated.View style={[
        styles.timerCircle,
        isUrgent && styles.timerUrgent,
        { transform: [{ scale: isUrgent ? pulseAnim : 1 }] }
      ]}>
        <Text style={styles.label}>WARM-UP</Text>
        <Text style={[styles.time, isUrgent && styles.timeUrgent]}>
          {formatTime(secondsLeft)}
        </Text>
        {secondsLeft === 0 && <Text style={styles.doneLabel}>READY</Text>}
      </Animated.View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }, isUrgent && styles.progressUrgent]} />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isRunning ? (
          <TouchableOpacity style={styles.startButton} onPress={handleStart}>
            <Ionicons name="play" size={24} color="#FFF" />
            <Text style={styles.buttonText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.pauseButton} onPress={handlePause}>
              <Ionicons name={isPaused ? 'play' : 'pause'} size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Ionicons name="refresh" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </>
        )}
        {onCancel && (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
  },
  courtName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  matchup: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 24,
  },
  timerCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  timerUrgent: {
    borderColor: '#EF4444',
    backgroundColor: '#1C1917',
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 2,
    marginBottom: 4,
  },
  time: {
    fontSize: 40,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -2,
  },
  timeUrgent: {
    color: '#EF4444',
  },
  doneLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#10B981',
    marginTop: 4,
    letterSpacing: 2,
  },
  progressBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  progressUrgent: {
    backgroundColor: '#EF4444',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pauseButton: {
    backgroundColor: '#F59E0B',
    padding: 14,
    borderRadius: 14,
  },
  resetButton: {
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 14,
  },
  cancelButton: {
    padding: 14,
  },
  cancelText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default WarmUpTimer;
