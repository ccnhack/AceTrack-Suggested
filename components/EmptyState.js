import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * 🎨 Empty State Illustrations
 * UX Fix: Beautiful empty states instead of blank screens
 */

const EmptyState = ({ 
  icon = 'document-text-outline', 
  title = 'Nothing here yet', 
  subtitle = '', 
  actionLabel = '', 
  onAction = null,
  color = '#3B82F6'
}) => (
  <View style={styles.container}>
    <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={56} color={color} />
    </View>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    {actionLabel && onAction ? (
      <TouchableOpacity style={[styles.actionButton, { backgroundColor: color }]} onPress={onAction}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

// Preset empty states
export const EmptyTournaments = ({ onAction }) => (
  <EmptyState
    icon="trophy-outline"
    title="No tournaments found"
    subtitle="Discover upcoming tournaments in your area or adjust your filters."
    actionLabel="Explore Events"
    onAction={onAction}
    color="#8B5CF6"
  />
);

export const EmptyMatches = () => (
  <EmptyState
    icon="game-controller-outline"
    title="No matches yet"
    subtitle="Join a tournament to start playing and track your progress."
    color="#10B981"
  />
);

export const EmptyVideos = () => (
  <EmptyState
    icon="videocam-outline"
    title="No recordings"
    subtitle="Match recordings and AI highlights will appear here."
    color="#F59E0B"
  />
);

export const EmptyPlayers = () => (
  <EmptyState
    icon="people-outline"
    title="No players found"
    subtitle="Players who register for tournaments will appear in the rankings."
    color="#EC4899"
  />
);

export const EmptySupport = ({ onAction }) => (
  <EmptyState
    icon="chatbubble-ellipses-outline"
    title="No support tickets"
    subtitle="Need help? Create a support ticket and we'll respond quickly."
    actionLabel="New Ticket"
    onAction={onAction}
    color="#3B82F6"
  />
);

export const EmptyNotifications = () => (
  <EmptyState
    icon="notifications-outline"
    title="All caught up!"
    subtitle="You'll receive notifications for tournament updates, match results, and more."
    color="#6366F1"
  />
);

export const EmptyCoachNotes = ({ onAction }) => (
  <EmptyState
    icon="clipboard-outline"
    title="No notes yet"
    subtitle="Add coaching notes to track player progress across tournaments."
    actionLabel="Add Note"
    onAction={onAction}
    color="#14B8A6"
  />
);

export const EmptyWaitlist = () => (
  <EmptyState
    icon="hourglass-outline"
    title="Waitlist is empty"
    subtitle="Players who join the waitlist when the tournament is full will appear here."
    color="#F97316"
  />
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
    marginBottom: 20,
  },
  actionButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default EmptyState;
