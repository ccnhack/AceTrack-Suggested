import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, 
  StyleSheet, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoManagement } from '../components/VideoManagement';

const RecordingsScreen = ({ 
  user, role, matchVideos = [], tournaments = [], players = [], 
  onSaveVideo, onUnlockVideo, onPurchaseAiHighlights, onTopUp, onVideoPlay,
  onToggleFavourite
}) => {
  const [activeFilter, setActiveFilter] = useState('recent');
  const isCoach = role === 'coach';

  // Players see videos they played in. Coaches see videos for tournaments they are assigned to.
  const allMyVideos = matchVideos.filter(v => {
    if (v.adminStatus === 'Removed' || v.adminStatus === 'Trash') return false;
    if (v.playerIds?.includes(user?.id)) return true;
    if (isCoach) {
      const tournament = tournaments.find(t => t.id === v.tournamentId);
      return tournament?.assignedCoachId === user.id;
    }
    return false;
  });

  const filteredVideos = (() => {
    switch (activeFilter) {
      case 'recent':
        return [...allMyVideos].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
      case 'favorites':
        return allMyVideos.filter(v => user?.favouritedVideos?.includes(v.id));
      case 'analyzed':
        return allMyVideos.filter(v => v.hasAiHighlights || v.aiStatus === 'completed');
      default:
        return allMyVideos;
    }
  })();

  const filters = [
    { id: 'recent', label: 'Recent', icon: 'time-outline' },
    { id: 'favorites', label: 'Favorites', icon: 'heart-outline' },
    { id: 'analyzed', label: 'Analyzed', icon: 'sparkles-outline' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isCoach ? 'Coached Recordings' : 'My Recordings'}
        </Text>
        <Text style={styles.headerSubtitle}>
          {allMyVideos.length} video{allMyVideos.length !== 1 ? 's' : ''} available
        </Text>
      </View>

      {/* Filter Tabs — matches web RECENT / FAVORITES / ANALYZED */}
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.id}
            onPress={() => setActiveFilter(f.id)}
            style={[styles.filterTab, activeFilter === f.id && styles.filterTabActive]}
          >
            <Ionicons
              name={f.icon}
              size={14}
              color={activeFilter === f.id ? '#FFFFFF' : '#94A3B8'}
            />
            <Text style={[styles.filterTabText, activeFilter === f.id && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {filteredVideos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <Ionicons
                name={activeFilter === 'favorites' ? 'heart' : activeFilter === 'analyzed' ? 'sparkles' : 'videocam'}
                size={32}
                color="#94A3B8"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'favorites' ? 'No Favorites Yet' :
               activeFilter === 'analyzed' ? 'No Analyzed Videos' : 'No Recordings Yet'}
            </Text>
            <Text style={styles.emptyText}>
              {activeFilter === 'favorites'
                ? 'Mark videos as favorites to see them here.'
                : activeFilter === 'analyzed'
                ? 'Videos with AI highlights will appear here.'
                : 'Your match recordings will appear here once uploaded by organizers.'}
            </Text>
          </View>
        ) : (
          <VideoManagement 
            academyId={user.id} 
            tournaments={tournaments} 
            players={players} 
            matchVideos={filteredVideos} 
            onSaveVideo={onSaveVideo}
            onUnlockVideo={onUnlockVideo}
            onPurchaseAiHighlights={onPurchaseAiHighlights}
            onTopUp={onTopUp}
            onVideoPlay={onVideoPlay}
            onToggleFavourite={onToggleFavourite}
            isPlayerMode={true}
            user={user}
            hideSelector={activeFilter === 'favorites'}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 10,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    backgroundColor: '#F1F5F9',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RecordingsScreen;
