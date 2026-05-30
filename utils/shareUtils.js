/**
 * 🔗 Share Utilities — v2.6.566
 * Provides platform-adaptive sharing for player stats cards.
 * Uses expo-sharing on native and the Web Share API on web.
 */
import { Platform, Share, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';

/**
 * Share a player stats summary as text (universal fallback).
 * Works on all platforms without any image capture dependency.
 */
export const sharePlayerStatsAsText = async (user) => {
  if (!user) return;

  const wins = user.wins || 0;
  const losses = user.losses || 0;
  const total = user.matchesPlayed || (wins + losses);
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const trueSkill = user.trueSkillRating ? Math.round(user.trueSkillRating) : '--';
  const sport = user.sport || user.managedSports?.[0] || 'Multi-sport';

  const message = [
    `🏆 AceTrack Player Card`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 ${user.name || 'Player'}`,
    `🎯 ${sport} • ${user.skillLevel || 'Unranked'}`,
    `📊 TrueSkill: ${trueSkill}`,
    `🏅 Win Rate: ${winRate}%`,
    `🎮 ${total} Matches • ${wins}W / ${losses}L`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Track your game at AceTrack! 🚀`,
  ].join('\n');

  try {
    if (Platform.OS === 'web') {
      if (navigator.share) {
        await navigator.share({ title: 'My AceTrack Stats', text: message });
      } else {
        await navigator.clipboard?.writeText(message);
        Alert.alert('Copied!', 'Stats copied to clipboard.');
      }
    } else {
      await Share.share({
        message,
        title: 'My AceTrack Stats',
      });
    }
    return { success: true };
  } catch (error) {
    if (error.message !== 'User did not share') {
      console.warn('[ShareUtils] Share failed:', error);
    }
    return { success: false, error: error.message };
  }
};

/**
 * Compute derived stats for the shareable card.
 * Pure function — no side effects.
 */
export const computePlayerCardData = (user, tournaments = []) => {
  if (!user) return null;

  const wins = user.wins || 0;
  const losses = user.losses || 0;
  const totalMatches = user.matchesPlayed || (wins + losses);
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  const trueSkill = user.trueSkillRating ? Math.round(user.trueSkillRating) : null;
  const noShows = user.noShows || 0;

  // Compute recent form (last 5 matches from trueSkillHistory)
  const history = user.trueSkillHistory || [];
  const recentTrend = history.length >= 2
    ? (history[history.length - 1].rating - history[history.length - 2].rating)
    : 0;

  // Determine player tier from TrueSkill
  let tier = 'Rookie';
  let tierColor = '#94A3B8';
  if (trueSkill !== null) {
    if (trueSkill >= 2000) { tier = 'Legend'; tierColor = '#F59E0B'; }
    else if (trueSkill >= 1500) { tier = 'Master'; tierColor = '#8B5CF6'; }
    else if (trueSkill >= 1200) { tier = 'Expert'; tierColor = '#3B82F6'; }
    else if (trueSkill >= 800) { tier = 'Rising'; tierColor = '#10B981'; }
  }

  // Count tournaments participated in
  const tournamentsPlayed = tournaments.filter(t =>
    (t.registeredPlayerIds || []).includes(user.id) && 
    (t.status === 'completed' || t.tournamentConcluded)
  ).length;

  return {
    name: user.name || 'Player',
    avatar: user.avatar,
    sport: user.sport || user.managedSports?.[0] || 'Multi-sport',
    skillLevel: user.skillLevel || 'Unranked',
    trueSkill,
    winRate,
    totalMatches,
    wins,
    losses,
    noShows,
    recentTrend: Math.round(recentTrend),
    tier,
    tierColor,
    tournamentsPlayed,
    city: user.city || '',
    referralCode: user.referralCode || null,
  };
};
