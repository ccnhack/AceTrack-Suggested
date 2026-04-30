import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, borderRadius, spacing } from '../theme/designSystem';
import SafeAvatar from './SafeAvatar';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

/**
 * 🛡️ GlobalHeader (v2.6.310)
 * Premium unified header for search, notifications, and profile access.
 */
const GlobalHeader = ({ title, showSearch = true, onSearchPress }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, setShowNotifications } = useAuth();
  const { setShowNotifications: setShowAppNotifications } = useApp();
  
  const unreadCount = (currentUser?.notifications || []).filter(n => !n.read).length;

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.contentRow}>
        <View style={styles.leftSection}>
          <SafeAvatar 
            user={currentUser} 
            size={40} 
            borderWidth={2}
            borderColor={colors.glass.border}
          />
          <View style={styles.titleGroup}>
            <Text style={styles.headerTitle}>{title || 'ACETRACK'}</Text>
            <Text style={styles.welcomeText}>Hello, {currentUser?.name?.split(' ')[0] || 'Player'}</Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          {showSearch && (
            <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
              <Ionicons name="search" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={() => setShowAppNotifications(true)}
          >
            <Ionicons name="notifications" size={22} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.navy[900],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 60,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleGroup: {
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 14,
  },
  welcomeText: {
    ...typography.caption,
    color: colors.navy[400],
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.glass.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.primary.base,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.navy[900],
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  }
});

export default GlobalHeader;
