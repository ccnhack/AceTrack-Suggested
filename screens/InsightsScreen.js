import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import designSystem from '../theme/designSystem';

const screenWidth = Dimensions.get('window').width;

const InsightsScreen = ({ players = [], tournaments = [], matchVideos = [] }) => {
  // 1. Process Sports Distribution
  const sportsStats = useMemo(() => {
    const counts = {};
    players.forEach(p => {
      const sport = p.sport || (p.certifiedSports && p.certifiedSports[0]) || 'Other';
      counts[sport] = (counts[sport] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(...sorted.map(s => s[1]), 1);
    return sorted.map(([name, count]) => ({ name, count, percent: (count / max) * 100 }));
  }, [players]);

  // 2. Process Geographic Insights
  const cityStats = useMemo(() => {
    const counts = {};
    players.forEach(p => {
      const city = p.city || 'Other';
      counts[city] = (counts[city] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = players.length || 1;
    return sorted.map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }));
  }, [players]);

  // 3. Simulated Growth Data (Mock)
  const growthPoints = [35, 55, 48, 75, 92, 110];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Admin Insights</Text>
            <Text style={styles.subText}>Platform performance & growth</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn}>
            <Ionicons name="analytics" size={22} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <StatBox title="Players" value={players.length} icon="people" color="#6366F1" trend="+12%" />
          <StatBox title="Tournaments" value={tournaments.length} icon="trophy" color="#F59E0B" trend="+5%" />
          <StatBox title="Footage" value={matchVideos.length} icon="videocam" color="#10B981" trend="+24%" />
        </View>

        {/* Custom Sports Popularity Chart (Vertical Bars) */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Sports Popularity</Text>
            <Text style={styles.chartSubtitle}>Active participants by sport</Text>
          </View>
          <View style={styles.barChartContainer}>
            {sportsStats.map((item, index) => (
              <View key={item.name} style={styles.barRow}>
                <View style={styles.barLabelContainer}>
                  <Text style={styles.barLabel}>{item.name}</Text>
                  <Text style={styles.barValue}>{item.count}</Text>
                </View>
                <View style={styles.barTrack}>
                  <AnimatedBar width={`${item.percent}%`} color={index === 0 ? '#6366F1' : '#94A3B8'} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Community Growth (Vertical Bar Mock Line Chart) */}
        <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Monthly Growth</Text>
                <View style={styles.growthBadge}>
                    <Ionicons name="trending-up" size={14} color="#10B981" />
                    <Text style={styles.growthBadgeText}>Safe</Text>
                </View>
            </View>
            <View style={styles.growthContainer}>
                {growthPoints.map((point, index) => (
                    <View key={index} style={styles.growthColumn}>
                        <View style={[styles.growthBar, { height: point }]} />
                        <Text style={styles.growthLabel}>{['J','F','M','A','M','J'][index]}</Text>
                    </View>
                ))}
            </View>
            <Text style={styles.growthCaption}>Consistently increasing player retention and new signups.</Text>
        </View>

        {/* Geographic Hotspots (List instead of Pie for stability) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Geographic Distribution</Text>
          <View style={styles.geoContainer}>
            {cityStats.map((item, index) => (
              <View key={item.name} style={styles.geoRow}>
                <View style={[styles.dot, { backgroundColor: ['#6366F1', '#EC4899', '#10B981', '#F59E0B'][index % 4] }]} />
                <Text style={styles.geoName}>{item.name}</Text>
                <View style={styles.geoValueContainer}>
                    <Text style={styles.geoCount}>{item.count}</Text>
                    <Text style={styles.geoPercent}>{item.percent}%</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </LinearGradient>
    </ScrollView>
  );
};

const AnimatedBar = ({ width, color }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [width]);

  return (
    <Animated.View 
      style={[
        styles.barFill, 
        { 
          backgroundColor: color,
          width: animatedWidth.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', width]
          })
        }
      ]} 
    />
  );
};

const StatBox = ({ title, value, icon, color, trend }) => (
  <View style={styles.statBox}>
    <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statTitle}>{title}</Text>
    <View style={styles.trendRow}>
        <Ionicons name="caret-up" size={12} color="#10B981" />
        <Text style={styles.trendText}>{trend}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40
  },
  welcomeText: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
  subText: { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...designSystem.shadows?.sm
  },
  statsGrid: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    marginBottom: 24 
  },
  statBox: {
    backgroundColor: '#fff',
    width: (screenWidth - 40 - 20) / 3,
    padding: 14,
    borderRadius: 20,
    ...designSystem.shadows?.sm
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  statTitle: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 9, color: '#10B981', fontWeight: '700', marginLeft: 2 },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    ...designSystem.shadows?.sm
  },
  chartHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginBottom: 20 
  },
  chartTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  chartSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  barChartContainer: { marginTop: 10 },
  barRow: { marginBottom: 18 },
  barLabelContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 6,
    paddingHorizontal: 2
  },
  barLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  barValue: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  barTrack: { 
    height: 8, 
    backgroundColor: '#F1F5F9', 
    borderRadius: 4,
    overflow: 'hidden'
  },
  barFill: { height: '100%', borderRadius: 4 },
  growthContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
    marginBottom: 16
  },
  growthColumn: { alignItems: 'center', width: (screenWidth - 80) / 6 },
  growthBar: { 
    width: 14, 
    backgroundColor: '#6366F1', 
    borderRadius: 6,
    opacity: 0.8
  },
  growthLabel: { fontSize: 10, color: '#94A3B8', marginTop: 8, fontWeight: '700' },
  growthBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#DCFCE7', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 8 
  },
  growthBadgeText: { fontSize: 11, fontWeight: '700', color: '#10B981', marginLeft: 4 },
  growthCaption: { fontSize: 12, color: '#64748B', fontStyle: 'italic', textAlign: 'center' },
  geoContainer: { marginTop: 10 },
  geoRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F8FAFC' 
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  geoName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  geoValueContainer: { alignItems: 'flex-end' },
  geoCount: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  geoPercent: { fontSize: 11, fontWeight: '600', color: '#94A3B8' }
});

export default InsightsScreen;
