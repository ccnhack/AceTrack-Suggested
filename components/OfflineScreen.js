import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const OfflineScreen = ({ onRetry }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        {/* We use a combination of icons to build the visual since the custom racket asset is unavailable */}
        <Ionicons name="wifi" size={100} color="#EF4444" style={styles.mainIcon} />
        <View style={styles.slashOverlay}>
          <Ionicons name="remove" size={120} color="#1E2532" style={{ position: 'absolute', transform: [{ rotate: '-45deg' }] }} />
          <Ionicons name="remove" size={110} color="#EF4444" style={{ transform: [{ rotate: '-45deg' }] }} />
        </View>
      </View>
      
      <Text style={styles.title}>Could not connect to the internet.</Text>
      <Text style={styles.subtitle}>Please check your network.</Text>
      
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2532', // Dark navy background matching the user's screenshot
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    // It will be wrapped full-screen by App.js, but these ensure it stretches
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999, 
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 120,
    width: 120,
  },
  mainIcon: {
    opacity: 0.9,
  },
  slashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: 0.3,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444', // Red try again text
    letterSpacing: 0.5,
  }
});

export default OfflineScreen;
