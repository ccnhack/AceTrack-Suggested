import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from './SafeAvatar';
import { formatDateIST } from '../utils/tournamentUtils';

const SocialFeed = ({ feed, onPlayerPress, onTournamentPress }) => {
  const renderItem = ({ item }) => {
    if (item.type === 'match_result') {
      const match = item.data;
      const winnerName = match.winnerId === match.player1Id ? match.senderName : (match.winnerId === match.player2Id ? match.receiverName : 'Someone');
      const loserName = match.winnerId === match.player1Id ? match.receiverName : match.senderName;
      
      return (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>
              <Ionicons name="trophy" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.timeAgo}>{new Date(item.timestamp).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.mainText}>
            <Text style={styles.highlightText}>{winnerName}</Text> defeated <Text style={styles.highlightText}>{loserName}</Text> in a {match.sport} match!
          </Text>
          <View style={styles.scorePill}>
            <Text style={styles.scoreText}>{match.resultText || 'Match Completed'}</Text>
          </View>
        </View>
      );
    }

    if (item.type === 'tournament_result') {
      const t = item.data;
      return (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.iconContainer, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="medal" size={20} color="#10B981" />
            </View>
            <Text style={styles.timeAgo}>{new Date(item.timestamp).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.mainText}>
            <Text style={styles.highlightText}>{t.title}</Text> has concluded. 
          </Text>
          {t.sponsorName && (
            <Text style={styles.subText}>Sponsored by {t.sponsorName}</Text>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => onTournamentPress && onTournamentPress(t)}>
            <Text style={styles.actionBtnText}>View Results</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    if (item.type === 'tournament_new') {
        const t = item.data;
        return (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconContainer, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="megaphone" size={20} color="#3B82F6" />
              </View>
              <Text style={styles.timeAgo}>{new Date(item.timestamp).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.mainText}>
              New Tournament Announced: <Text style={styles.highlightText}>{t.title}</Text>
            </Text>
            <Text style={styles.subText}>{t.location} • {formatDateIST(t.date)}</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onTournamentPress && onTournamentPress(t)}>
              <Text style={styles.actionBtnText}>View Details</Text>
            </TouchableOpacity>
          </View>
        );
      }

    return null;
  };

  return (
    <View style={styles.container}>
      <FlashList
        data={feed}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        estimatedItemSize={150}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="newspaper-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No recent activity in your community.</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeAgo: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  mainText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 8,
  },
  highlightText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  subText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  scorePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B82F6',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

export default SocialFeed;
