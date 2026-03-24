import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const Layout = ({ 
  children, activeTab, setActiveTab, title, onBack, role, 
  onNotificationClick, hasUnreadNotifications, notificationCount, 
  adminActionCount, recordingsCount 
}) => {
  const showHeader = activeTab !== 'explore';

  return (
    <SafeAreaView style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color="#475569" />
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={onNotificationClick}
          >
            <Ionicons name="notifications-outline" size={24} color="#EF4444" />
            {hasUnreadNotifications && (
              <View style={styles.notificationDot} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content Area */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <NavItem 
          icon="home-outline" 
          activeIcon="home"
          label="Home" 
          active={activeTab === 'explore'} 
          onClick={() => setActiveTab('explore')}
        />
        {(role === 'user' || role === 'coach') && (
          <NavItem 
            icon="document-text-outline" 
            activeIcon="document-text"
            label="Matches" 
            active={activeTab === 'matches'} 
            onClick={() => setActiveTab('matches')}
          />
        )}
        <NavItem 
          icon="trophy-outline" 
          activeIcon="trophy"
          label="Ranking" 
          active={activeTab === 'ranking'} 
          onClick={() => setActiveTab('ranking')}
        />
        {(role === 'user' || role === 'coach') && (
          <NavItem 
            icon="videocam-outline" 
            activeIcon="videocam"
            label="Recordings" 
            active={activeTab === 'recordings'} 
            onClick={() => setActiveTab('recordings')}
            count={recordingsCount}
          />
        )}
        {role === 'admin' && (
          <NavItem 
            icon="settings-outline" 
            activeIcon="settings"
            label="Admin" 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')}
            count={adminActionCount}
          />
        )}
        {role === 'academy' && (
          <NavItem 
            icon="business-outline" 
            activeIcon="business"
            label="Academy" 
            active={activeTab === 'academy'} 
            onClick={() => setActiveTab('academy')}
          />
        )}
        <NavItem 
          icon="person-outline" 
          activeIcon="person"
          label="Profile" 
          active={activeTab === 'profile'} 
          onClick={() => setActiveTab('profile')}
          count={notificationCount}
        />
      </View>
    </SafeAreaView>
  );
};

const NavItem = ({ icon, activeIcon, label, active, onClick, count }) => (
  <TouchableOpacity 
    onPress={onClick}
    style={styles.navItem}
  >
    <View style={[styles.navIconContainer, active && styles.navIconContainerActive]}>
      <Ionicons name={active ? activeIcon : icon} size={20} color={active ? '#EF4444' : '#CBD5E1'} />
      {count && count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      ) : null}
    </View>
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  notificationButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    backgroundColor: '#DC2626',
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navIconContainer: {
    padding: 6,
    borderRadius: 12,
  },
  navIconContainerActive: {
    backgroundColor: '#FEF2F2',
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  navLabelActive: {
    color: '#EF4444',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#DC2626',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
});

export default Layout;
