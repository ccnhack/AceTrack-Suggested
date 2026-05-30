import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const VideoHighlights = ({ highlights, onSeekTo }) => {
  if (!highlights || highlights.length === 0) return null;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color="#F59E0B" />
        <Text style={styles.title}>AI Generated Highlights</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {highlights.map((clip, index) => (
          <TouchableOpacity 
            key={clip.id} 
            style={styles.clipCard}
            onPress={() => onSeekTo(clip.startTime)}
          >
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="play-circle" size={32} color="#FFFFFF" />
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>
                  {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                </Text>
              </View>
            </View>
            <Text style={styles.descriptionText} numberOfLines={2}>
              {clip.description}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginLeft: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  clipCard: {
    width: width * 0.45,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    height: 100,
    backgroundColor: '#334155',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  }
});

export default VideoHighlights;
