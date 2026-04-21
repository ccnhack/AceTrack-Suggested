import React, { memo, useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import config from '../config';

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
const SafeAvatar = memo(({ uri, name, role, size = 44, borderRadius = 14, style, textStyle }) => {
  const [retryCount, setRetryCount] = useState(0);
  const [hasError, setHasError] = useState(false);


  // Reset error state if the URI changes
  useEffect(() => {
    setHasError(false);
    setRetryCount(0);
  }, [uri]);

  const initials = getInitials(name);
  
  // 🛡️ ADMIN BRANDING GUARD (v2.6.2): Use brand logo for system admin by default
  const isAdmin = role === 'admin' || role === 'system_admin' || String(name).toLowerCase().includes('system admin') || String(name).toLowerCase().includes('acetrack admin');

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
  const backgroundColor = isAdmin ? '#0F172A' : colors[colorIndex];

  const isRemoteImage = uri && 
    typeof uri === 'string' && 
    uri.trim() !== '' && 
    !uri.includes('null') && 
    !uri.includes('undefined');

  // 🛡️ [REPLICATION] High-precision URL preparation matching mobile-app 4
  const sanitizedUri = config.sanitizeUrl(uri);
  const finalUri = retryCount > 0 ? `${sanitizedUri}${sanitizedUri.includes('?') ? '&' : '?'}retry=${retryCount}` : sanitizedUri;
  
  if (isRemoteImage && !hasError) {
    return (
      <Image
        source={{ uri: finalUri }}
        style={[styles.avatar, { width: size, height: size, borderRadius }, style]}
        onError={() => {
          if (retryCount < 2) {
            console.log(`[SafeAvatar] Load failed for ${sanitizedUri}. Retrying (${retryCount + 1}/2)...`);
            setTimeout(() => setRetryCount(prev => prev + 1), 1000);
          } else {
            if (!sanitizedUri.includes('ui-avatars.com') && !sanitizedUri.includes('api.dicebear.com')) {
              console.log(`[SafeAvatar] Permanent load failure: ${sanitizedUri}. Falling back.`);
            }
            setHasError(true);
          }
        }}
      />
    );
  }

  // Fallback case: Admin gets brand logo, others get initials
  if (isAdmin && (!isRemoteImage || hasError)) {
    return (
      <View style={[
        styles.placeholder,
        { width: size, height: size, borderRadius, backgroundColor, borderWidth: 1, borderColor: '#3B82F6' },
        style
      ]}>
        <Image 
          source={require('../assets/icon.png')} 
          style={{ width: size * 0.6, height: size * 0.6, resizeMode: 'contain' }} 
        />
      </View>
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
