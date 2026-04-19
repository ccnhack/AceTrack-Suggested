import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from './SafeAvatar';

// SafeAvatar handles these fallbacks internally now

const ProfileHeader = memo(({ 
  user, 
  academyTier, 
  imageError, 
  isCloudOnline, 
  isUsingCloud, 
  lastSyncTime, 
  onManualSync, 
  onAvatarPress, 
  onNotificationPress, 
  onWalletPress,
  logger 
}) => {
  const [localImageError, setLocalImageError] = React.useState(false);

  // Reset local error when avatar changes (e.g. after a fresh upload or sync)
  React.useEffect(() => {
    setLocalImageError(false);
  }, [user?.avatar]);

  if (!user) return null;

  return (
    <View style={styles.header}>
      <View style={styles.avatarContainer}>
        <SafeAvatar 
          uri={user?.avatar} 
          name={user?.name} 
          role={user?.role} 
          size={80} 
          borderRadius={40} 
          style={styles.avatar} 
        />
        <TouchableOpacity 
          style={styles.editBtn} 
          onPress={() => {
            if (logger?.logAction) logger.logAction('MODAL_OPEN', { modal: 'AvatarPicker' });
            onAvatarPress();
          }}
        >
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.userInfo}>
        <Text testID="profile.header.name" style={styles.userName}>{user?.name}</Text>
        {academyTier && (
          <View style={styles.roleRow}>
            <View style={[styles.tierBadge, academyTier === 'Gold' ? styles.tierGold : academyTier === 'Silver' ? styles.tierSilver : styles.tierBronze]}>
              <Text style={styles.tierText}>Academy Tier: {academyTier}</Text>
            </View>
          </View>
        )}

        {user?.role !== 'admin' && user?.role !== 'academy' && user?.role !== 'coach' && (
          <TouchableOpacity onPress={onWalletPress} style={styles.walletTrigger}>
            <Ionicons name="wallet" size={12} color="#16A34A" />
            <Text style={styles.walletTriggerText}>Wallet: ₹{user?.credits || 0}</Text>
          </TouchableOpacity>
        )}
        
        {/* Connection Status Badge */}
        <TouchableOpacity 
          onPress={() => {
            if (logger?.logAction) logger.logAction('MANUAL_SYNC_CLICK');
            onManualSync(true, true);
          }}
          style={[
            styles.syncBadge, 
            isCloudOnline ? styles.syncOnline : (isUsingCloud ? styles.syncOffline : styles.syncLocal)
          ]}
        >
          <Ionicons 
            name={isCloudOnline ? "cloud-done" : (isUsingCloud ? "cloud-offline" : "server")} 
            size={10} 
            color={isCloudOnline ? "#16A34A" : (isUsingCloud ? "#EF4444" : "#F59E0B")} 
          />
          <Text style={[styles.syncText, { color: isCloudOnline ? "#16A34A" : (isUsingCloud ? "#EF4444" : "#F59E0B") }]}>
            {isCloudOnline ? 'Cloud Synced' : (isUsingCloud ? 'Offline Mode' : 'Local Mode')}
          </Text>
        </TouchableOpacity>
        {lastSyncTime && (
          <Text style={styles.lastSyncText}>Last: {lastSyncTime}</Text>
        )}
      </View>

      <TouchableOpacity 
        style={styles.notificationBell} 
        onPress={() => {
          if (logger?.logAction) logger.logAction('MODAL_OPEN', { modal: 'Notifications' });
          onNotificationPress();
        }}
      >
        <Ionicons name="notifications-outline" size={24} color="#0F172A" />
        {user?.notifications?.some(n => !n.read) && (
          <View style={styles.notificationBadge}>
            <Text style={styles.badgeText}>
              {user.notifications.filter(n => !n.read).length}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
});

ProfileHeader.displayName = 'ProfileHeader';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8FAFC',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  editBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  roleRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierGold: {
    backgroundColor: '#FEF3C7',
  },
  tierSilver: {
    backgroundColor: '#F1F5F9',
  },
  tierBronze: {
    backgroundColor: '#FED7AA',
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  walletTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignSelf: 'flex-start',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  walletTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  syncOnline: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  syncOffline: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  syncLocal: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  syncText: {
    fontSize: 9,
    fontWeight: '700',
  },
  lastSyncText: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    marginLeft: 8,
  },
  notificationBell: {
    padding: 8,
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export { SafeAvatar as AvatarPlaceholder };
export default ProfileHeader;
