import React, { memo, useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

/**
 * Extracts up to 2 initials from a name string.
 */
export const getInitials = (name) => {
  if (!name) return 'AT';
  return name
    .split(' ')
    .filter(Part => Part.length > 0)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

/**
 * SafeAvatar Component
 * 
 * Provides robust avatar rendering with:
 * 1. Image URI support
 * 2. Fallback to local initials if URI is missing
 * 3. Fallback to local initials if Image fails to load
 * 4. Deterministic background colors based on name length
 */
const SafeAvatar = memo(({ uri, name, size = 44, borderRadius = 14, style, textStyle }) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state if the URI changes
  useEffect(() => {
    setHasError(false);
  }, [uri]);

  const initials = getInitials(name);
  
  // Vibrant, accessible background colors
  const colors = [
    '#6366F1', // Indigo
    '#EF4444', // Red
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#3B82F6', // Blue
    '#06B6D4', // Cyan
    '#84CC16'  // Lime
  ];
  
  const colorIndex = (name || '').length % colors.length;
  const backgroundColor = colors[colorIndex];

  const isRemoteImage = uri && 
    typeof uri === 'string' && 
    uri.trim() !== '' && 
    uri !== 'null' && 
    uri !== 'undefined';

  if (isRemoteImage && !hasError) {
    return (
      <Image
        source={{ uri }}
        style={[styles.avatar, { width: size, height: size, borderRadius }, style]}
        onError={() => {
          console.log(`[SafeAvatar] Failed to load image: ${uri}. Falling back to initials.`);
          setHasError(true);
        }}
      />
    );
  }

  return (
    <View style={[
      styles.placeholder,
      { width: size, height: size, borderRadius, backgroundColor },
      style
    ]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }, textStyle]}>
        {initials}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  avatar: { 
    backgroundColor: '#F1F5F9' 
  },
  placeholder: { 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  initials: { 
    color: '#FFFFFF', 
    fontWeight: '800' 
  },
});

export default SafeAvatar;
