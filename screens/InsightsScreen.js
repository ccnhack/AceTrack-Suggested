import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import designSystem from '../theme/designSystem';

const screenWidth = Dimensions.get('window').width;

const InsightsScreen = ({ players = [], tournaments = [], matchVideos = [] }) => {
  // 1. Process Sports Distribution (Players)
  const sportsData = useMemo(() => {
    const counts = {};
    players.forEach(p => {
      const sport = p.sport || (p.certifiedSports && p.certifiedSports[0]) || 'Other';
      counts[sport] = (counts[sport] || 0) + 1;
    });
    
    // Sort and take top 5
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      labels: sorted.map(s => s[0]),
      datasets: [{ data: sorted.map(s => s[1]) }]
    };
  }, [players]);

  // 2. Process Geographic Distribution (City-wise)
  const cityData = useMemo(() => {
    const counts = {};
    players.forEach(p => {
      const city = p.city || 'Unknown';
      counts[city] = (counts[city] || 0) + 1;
    });
    
    const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#64748B'];
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], index) => ({
        name,
        population: count,
        color: colors[index % colors.length],
        legendFontColor: '#475569',
        legendFontSize: 12
      }));
  }, [players]);

  // 3. Simulated Player Growth (Mocking registration dates)
  const growthData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        data: [12, 19, 35, 52, 68, (players.length || 85)],
        color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
        strokeWidth: 3
      }
    ],
    legend: ["Total Players"]
  };

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "6", strokeWidth: "2", stroke: "#EF4444" }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Platform Insights</Text>
            <Text style={styles.subText}>Real-time system analytics</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn}>
            <Ionicons name="refresh" size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard title="Players" value={players.length} icon="people" color="#6366F1" />
          <StatCard title="Tournaments" value={tournaments.length} icon="trophy" color="#F59E0B" />
          <StatCard title="Videos" value={matchVideos.length} icon="play-circle" color="#10B981" />
        </View>

        {/* Sports Popularity (Bar Chart) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Sports Popularity</Text>
          <BarChart
            data={sportsData}
            width={screenWidth - 48}
            height={220}
            chartConfig={chartConfig}
            verticalLabelRotation={0}
            style={styles.chart}
            fromZero
            showValuesOnTopOfBars
          />
        </View>

        {/* Player Growth (Line Chart) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Community Growth</Text>
          <LineChart
            data={growthData}
            width={screenWidth - 48}
            height={220}
            chartConfig={{...chartConfig, color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})` }}
            bezier
            style={styles.chart}
          />
        </View>

        {/* Geographic Distribution (Pie Chart) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Geographic Distribution</Text>
          <PieChart
            data={cityData}
            width={screenWidth - 48}
            height={200}
            chartConfig={chartConfig}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
            absolute
          />
        </View>

        <View style={{ height: 40 }} />
      </LinearGradient>
    </ScrollView>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconContainer, { backgroundColor: `${color}15` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statTitle}>{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 24 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20
  },
  welcomeText: { fontSize: 28, fontWeight: '800', color: '#1E293B' },
  subText: { fontSize: 14, color: '#64748B', marginTop: 4 },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...designSystem.shadows.sm
  },
  statsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    marginBottom: 24 
  },
  statCard: {
    backgroundColor: '#fff',
    width: (screenWidth - 48 - 24) / 3,
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    ...designSystem.shadows.sm
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  statTitle: { fontSize: 10, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase' },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
    ...designSystem.shadows.sm
  },
  chartTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#334155', 
    marginBottom: 16,
    marginLeft: 8
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16
  }
});

export default InsightsScreen;
