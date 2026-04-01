import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';

const { width, height } = Dimensions.get('window');

export const AcademyAnalytics = ({ 
  academyId, 
  tournaments = [], 
  players = [], 
  matchVideos = [],
  matches = [],
  evaluations = []
}) => {
  const [activeModal, setActiveModal] = useState(null); // 'revenue' | 'retention' | 'sport' | 'area'
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const stats = useMemo(() => {
    // 1. My Data Filter
    const myTournaments = tournaments.filter(t => t.creatorId === academyId);
    const myVideos = matchVideos.filter(v => v.academyId === academyId || myTournaments.some(t => t.id === v.tournamentId));

    // 2. Revenue Calculation & Details
    const tournamentRevenueDetails = myTournaments.map(t => {
        const regRev = (t.registeredPlayerIds || []).length * (t.entryFee || 0);
        const tVideos = myVideos.filter(v => v.tournamentId === t.id);
        const vidRev = tVideos.reduce((sum, v) => sum + (v.revenue || 0), 0);
        return {
            id: t.id,
            title: t.title,
            sport: t.sport,
            regRev,
            vidRev,
            total: regRev + vidRev
        };
    }).sort((a, b) => b.total - a.total);

    const tRevenue = tournamentRevenueDetails.reduce((acc, t) => acc + t.regRev, 0);
    const vRevenue = tournamentRevenueDetails.reduce((acc, t) => acc + t.vidRev, 0);
    const totalRev = tRevenue + vRevenue;

    // 3. Retention & Player List
    const registrationHistory = myTournaments.flatMap(t => (t.registeredPlayerIds || []).map(pid => ({ pid, tid: t.id })));
    const uniquePlayerIds = [...new Set(registrationHistory.map(r => r.pid))];
    
    const playerRetentionList = uniquePlayerIds.map(pid => {
        const p = players.find(player => player.id === pid);
        const pTournaments = registrationHistory.filter(r => r.pid === pid);
        return {
            id: pid,
            name: p?.name || 'Unknown Player',
            participationCount: pTournaments.length,
            tournaments: pTournaments.map(r => r.tid)
        };
    }).sort((a,b) => b.participationCount - a.participationCount);

    const returningUsers = playerRetentionList.filter(p => p.participationCount > 1).length;
    const retentionRate = uniquePlayerIds.length > 0 ? (returningUsers / uniquePlayerIds.length) * 100 : 0;

    // 4. Monthly Trend
    const monthlyRev = myTournaments.reduce((acc, t) => {
        const monthYear = new Date(t.date).toLocaleString('default', { month: 'short', year: '2-digit' });
        const rev = (t.registeredPlayerIds || []).length * (t.entryFee || 0);
        acc[monthYear] = (acc[monthYear] || 0) + rev;
        return acc;
    }, {});

    // 5. Sport Participation
    const sportParticipation = myTournaments.reduce((acc, t) => {
        acc[t.sport] = (acc[t.sport] || 0) + (t.registeredPlayerIds || []).length;
        return acc;
    }, {});

    // 6. Top Areas
    const areaRegs = registrationHistory.reduce((acc, r) => {
        const p = players.find(player => player.id === r.pid);
        const area = p?.area || p?.city || 'Unknown';
        acc[area] = (acc[area] || 0) + 1;
        return acc;
    }, {});

    // 7. Average Fill Rate
    const fillRates = myTournaments.filter(t => t.maxPlayers > 0).map(t => ((t.registeredPlayerIds || []).length / t.maxPlayers));
    const avgFill = fillRates.length > 0 ? (fillRates.reduce((a,b) => a+b, 0) / fillRates.length) * 100 : 0;

    return {
        totalRev,
        tRevenue,
        vRevenue,
        retentionRate,
        uniquePlayersCount: uniquePlayerIds.length,
        avgFill,
        monthlyRev,
        sportParticipation,
        areaRegs,
        revPerPlayer: uniquePlayerIds.length > 0 ? totalRev / uniquePlayerIds.length : 0,
        tournamentRevenueDetails,
        playerRetentionList,
        myTournaments
    };
  }, [academyId, tournaments, players, matchVideos]);

  const selectedPlayerHistory = useMemo(() => {
    if (!selectedPlayerId) return null;
    const p = players.find(player => player.id === selectedPlayerId);
    if (!p) return null;

    const myTournaments = tournaments.filter(t => t.creatorId === academyId);
    const pTournaments = myTournaments.filter(t => (t.registeredPlayerIds || []).includes(selectedPlayerId));

    const history = pTournaments.map(t => {
        const pMatches = matches.filter(m => m.tournamentId === t.id && (m.player1Id === selectedPlayerId || m.player2Id === selectedPlayerId));
        const pEvaluations = evaluations.filter(e => e.tournamentId === t.id && e.playerId === selectedPlayerId);
        return {
            tournament: t,
            matches: pMatches,
            evaluations: pEvaluations
        };
    });

    return { player: p, history };
  }, [selectedPlayerId, tournaments, matches, evaluations, academyId, players]);

  const renderProgressBar = (label, value, total, color = '#6366F1') => {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return (
        <View key={label} style={styles.metricRow}>
            <View style={styles.metricHeader}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{value} ({Math.round(percentage)}%)</Text>
            </View>
            <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: color }]} />
            </View>
        </View>
    );
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedPlayerId(null);
  };

  const renderDrillDownContent = () => {
    if (selectedPlayerId) {
        return (
            <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setSelectedPlayerId(null)} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#0F172A" />
                    </TouchableOpacity>
                    <View style={styles.flex}>
                        <Text style={styles.modalTitle}>{selectedPlayerHistory?.player.name}</Text>
                        <Text style={styles.modalSub}>History & Ratings</Text>
                    </View>
                    <TouchableOpacity onPress={closeModals} style={styles.closeBtnSmall}>
                        <Ionicons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    {selectedPlayerHistory?.history.map((item, idx) => (
                        <View key={item.tournament.id} style={styles.historyCard}>
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyTTitle}>{item.tournament.title}</Text>
                                <Text style={styles.historyDate}>{new Date(item.tournament.date).toLocaleDateString()}</Text>
                            </View>

                            <View style={styles.historySection}>
                                <Text style={styles.historyLabel}>Match Results</Text>
                                {item.matches.length > 0 ? item.matches.map(m => (
                                    <View key={m.id} style={styles.matchItem}>
                                        <Text style={styles.matchText}>Round {m.round}: {m.score1} - {m.score2}</Text>
                                        <View style={[styles.resBadge, { backgroundColor: m.winnerId === selectedPlayerId ? '#DCFCE7' : '#FEE2E2' }]}>
                                            <Text style={[styles.resText, { color: m.winnerId === selectedPlayerId ? '#16A34A' : '#EF4444' }]}>
                                                {m.winnerId === selectedPlayerId ? 'WIN' : 'LOSS'}
                                            </Text>
                                        </View>
                                    </View>
                                )) : <Text style={styles.emptyText}>No matches recorded</Text>}
                            </View>

                            <View style={styles.historySection}>
                                <Text style={styles.historyLabel}>Coach Evaluations</Text>
                                {item.evaluations.length > 0 ? item.evaluations.map(e => (
                                    <View key={e.id} style={styles.evalItem}>
                                        <View style={styles.evalHeader}>
                                            <Text style={styles.evalAvg}>Score: {e.averageScore.toFixed(1)}/10</Text>
                                            <Text style={styles.evalRound}>Round {e.round || 'N/A'}</Text>
                                        </View>
                                        <View style={styles.scoresGrid}>
                                            {Object.entries(e.scores).map(([skill, score]) => (
                                                <View key={skill} style={styles.scoreRow}>
                                                    <Text style={styles.scoreSkill}>{skill}</Text>
                                                    <Text style={styles.scoreVal}>{score}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )) : <Text style={styles.emptyText}>No evaluations yet</Text>}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }

    switch (activeModal) {
        case 'revenue':
            return (
                <View style={styles.modalBody}>
                    <View style={styles.modalHeader}>
                        <View style={styles.flex}>
                            <Text style={styles.modalTitle}>Revenue Details</Text>
                            <Text style={styles.modalSub}>Detailed breakdown of tournament income</Text>
                        </View>
                        <TouchableOpacity onPress={closeModals} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalScroll}>
                        {stats.tournamentRevenueDetails.map(item => (
                            <View key={item.id} style={styles.drillDownCard}>
                                <View style={styles.drillDownCardRow}>
                                    <View style={styles.flex}>
                                        <View style={styles.row}>
                                            <Text style={styles.drillDownLabel}>{item.title}</Text>
                                            <View style={styles.miniSportBadge}>
                                                <Text style={styles.miniSportText}>{item.sport}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.drillDownSubRow}>
                                            <Text style={styles.drillDownSubText}>Fees: ₹{item.regRev}</Text>
                                            <View style={styles.dotSeparator} />
                                            <Text style={styles.drillDownSubText}>Videos: ₹{item.vidRev}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.drillDownTotal}>₹{item.total.toLocaleString()}</Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            );
        case 'retention':
            return (
                <View style={styles.modalBody}>
                    <View style={styles.modalHeader}>
                        <View style={styles.flex}>
                            <Text style={styles.modalTitle}>Player Retention</Text>
                            <Text style={styles.modalSub}>Repeat participants across your events</Text>
                        </View>
                        <TouchableOpacity onPress={closeModals} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalScroll}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.tableLabel, { flex: 2 }]}>Player</Text>
                            <Text style={[styles.tableLabel, { textAlign: 'right' }]}>Participations</Text>
                        </View>
                        {stats.playerRetentionList.map(p => (
                            <View key={p.id} style={styles.playerRow}>
                                <Text style={[styles.playerName, { flex: 2 }]}>{p.name}</Text>
                                <TouchableOpacity onPress={() => setSelectedPlayerId(p.id)} style={styles.countBadgeLarge}>
                                    <Text style={styles.countBadgeTextLarge}>{p.participationCount}</Text>
                                    <Ionicons name="chevron-forward" size={12} color="#fff" style={{ marginLeft: 6 }} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            );
        case 'sport':
            return (
                <View style={styles.modalBody}>
                    <View style={styles.modalHeader}>
                        <View style={styles.flex}>
                            <Text style={styles.modalTitle}>Sport Distribution</Text>
                            <Text style={styles.modalSub}>Player participation by sport category</Text>
                        </View>
                        <TouchableOpacity onPress={closeModals} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalScroll}>
                        {Object.entries(stats.sportParticipation).map(([sport, total]) => (
                            <View key={sport} style={styles.drillDownSection}>
                                <View style={styles.drillDownHeadline}>
                                    <Text style={styles.drillDownTitle}>{sport}</Text>
                                    <Text style={styles.drillDownVal}>{total} Players</Text>
                                </View>
                                {stats.myTournaments.filter(t => t.sport === sport).map(t => (
                                    <View key={t.id} style={styles.drillDownCardSmall}>
                                        <Text style={styles.drillDownLabel}>{t.title}</Text>
                                        <Text style={styles.drillDownSubText}>{(t.registeredPlayerIds || []).length} Participants</Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            );
        case 'area':
            return (
                <View style={styles.modalBody}>
                    <View style={styles.modalHeader}>
                        <View style={styles.flex}>
                            <Text style={styles.modalTitle}>Regional Growth</Text>
                            <Text style={styles.modalSub}>Registrations grouped by player location</Text>
                        </View>
                        <TouchableOpacity onPress={closeModals} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalScroll}>
                        {Object.entries(stats.areaRegs).sort((a,b) => b[1] - a[1]).map(([area, total]) => (
                            <View key={area} style={styles.drillDownCard}>
                                <View style={styles.drillDownCardRow}>
                                    <View style={styles.flex}>
                                        <Text style={styles.drillDownLabel}>{area}</Text>
                                        <Text style={styles.drillDownSubText}>Total Participants</Text>
                                    </View>
                                    <Text style={styles.drillDownTotal}>{total}</Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            );
        default:
            return null;
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Business Overview</Text>
      
      {/* Primary Stat Cards */}
      <View style={styles.statsGrid}>
        <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}
            onPress={() => setActiveModal('revenue')}
        >
            <View style={styles.statCardHeader}>
                <Ionicons name="cash-outline" size={20} color="#6366F1" />
                <Ionicons name="expand-outline" size={14} color="#6366F1" style={{ opacity: 0.6 }} />
            </View>
            <Text style={styles.statVal}>₹{stats.totalRev.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Revenue</Text>
            <View style={styles.revBreakdown}>
                <Text style={styles.revSubText}>Event: ₹{stats.tRevenue} | Video: ₹{stats.vRevenue}</Text>
            </View>
        </TouchableOpacity>

        <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}
            onPress={() => setActiveModal('retention')}
        >
            <View style={styles.statCardHeader}>
                <Ionicons name="refresh-outline" size={20} color="#16A34A" />
                <Ionicons name="expand-outline" size={14} color="#16A34A" style={{ opacity: 0.6 }} />
            </View>
            <Text style={styles.statVal}>{Math.round(stats.retentionRate)}%</Text>
            <Text style={styles.statLabel}>Retention</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="stats-chart-outline" size={20} color="#EA580C" />
            <Text style={styles.statVal}>{Math.round(stats.avgFill)}%</Text>
            <Text style={styles.statLabel}>Avg Fill Rate</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="person-outline" size={20} color="#64748B" />
            <Text style={styles.statVal}>₹{Math.round(stats.revPerPlayer)}</Text>
            <Text style={styles.statLabel}>Rev / Player</Text>
        </View>
      </View>

      {/* Participation Breakdown */}
      <View style={styles.chartCard} onTouchEnd={() => setActiveModal('sport')}>
        <View style={styles.cardHeader}>
            <Ionicons name="fitness-outline" size={20} color="#0F172A" />
            <Text style={styles.cardTitle}>Participation by Sport</Text>
        </View>
        <View style={styles.chartBody}>
            {Object.entries(stats.sportParticipation).map(([sport, count]) => (
                renderProgressBar(sport, count, Object.values(stats.sportParticipation).reduce((a,b)=>a+b, 0))
            ))}
        </View>
      </View>

      {/* Area Breakdown */}
      <TouchableOpacity style={styles.chartCard} onPress={() => setActiveModal('area')}>
        <View style={styles.cardHeader}>
            <Ionicons name="location-outline" size={20} color="#0F172A" />
            <Text style={styles.cardTitle}>Growth by Area</Text>
        </View>
        <View style={styles.chartBody}>
            {Object.entries(stats.areaRegs).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([area, count]) => (
                renderProgressBar(area, count, Object.values(stats.areaRegs).reduce((a,b)=>a+b, 0), '#10B981')
            ))}
        </View>
      </TouchableOpacity>

      {/* Monthly Trends */}
      <View style={styles.chartCard}>
        <View style={styles.cardHeader}>
            <Ionicons name="trending-up-outline" size={20} color="#0F172A" />
            <Text style={styles.cardTitle}>Revenue Trend (Events)</Text>
        </View>
        <View style={styles.trendList}>
            {Object.entries(stats.monthlyRev).slice(-6).map(([month, rev]) => (
                <View key={month} style={styles.trendRow}>
                    <Text style={styles.trendMonth}>{month}</Text>
                    <Text style={styles.trendVal}>₹{rev.toLocaleString()}</Text>
                </View>
            ))}
        </View>
      </View>

      {/* Drill-down Modal */}
      <Modal visible={!!activeModal || !!selectedPlayerId} animationType="slide">
        <SafeAreaView style={styles.modalOverlayFull}>
            {renderDrillDownContent()}
        </SafeAreaView>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 4 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginTop: 8 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 24, gap: 6, borderWidth: 1, borderColor: '#F1F5F9', minHeight: 120, justifyContent: 'center' },
  statCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statVal: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  revBreakdown: { marginTop: 4 },
  revSubText: { fontSize: 9, fontWeight: '700', color: '#6366F1' },
  chartCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  chartBody: { gap: 16 },
  metricRow: { gap: 8 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontSize: 13, fontWeight: '700', color: '#475569' },
  metricValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  progressBg: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  trendList: { gap: 12 },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  trendMonth: { fontSize: 14, fontWeight: '700', color: '#475569' },
  trendVal: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  
  // Full-screen Modal styles
  modalOverlayFull: { flex: 1, backgroundColor: '#F8FAFC' },
  modalBody: { flex: 1, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, marginTop: 10 },
  modalTitle: { fontSize: 28, fontWeight: '900', color: '#0F172A' },
  modalSub: { fontSize: 14, color: '#64748B', fontWeight: '700', marginTop: 4 },
  backBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 16, ...designSystem.shadows?.sm },
  closeBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...designSystem.shadows?.sm },
  closeBtnSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1 },
  flex: { flex: 1 },
  
  // Drill-down Content Styles
  drillDownCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  drillDownCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drillDownLabel: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  drillDownSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  drillDownSubText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  dotSeparator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', mx: 8, marginHorizontal: 8 },
  drillDownTotal: { fontSize: 16, fontWeight: '900', color: '#6366F1' },
  
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 12, marginBottom: 16 },
  tableLabel: { fontSize: 11, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  playerName: { fontSize: 16, fontWeight: '800', color: '#334155' },
  countBadgeLarge: { backgroundColor: '#6366F1', minWidth: 60, height: 36, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  countBadgeTextLarge: { color: '#fff', fontSize: 14, fontWeight: '900' },

  // History styles
  historyCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', paddingBottom: 12 },
  historyTTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', flex: 1 },
  historyDate: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  historySection: { marginBottom: 24 },
  historyLabel: { fontSize: 12, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1.5 },
  matchItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16 },
  matchText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  resBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  resText: { fontSize: 11, fontWeight: '900' },
  emptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
  evalItem: { backgroundColor: '#F8FAFC', padding: 20, borderRadius: 20 },
  evalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  evalAvg: { fontSize: 16, fontWeight: '800', color: '#6366F1' },
  evalRound: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  scoresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  scoreRow: { width: '45%' },
  scoreSkill: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  scoreVal: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniSportBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniSportText: { fontSize: 10, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase' },
  drillDownSection: { marginBottom: 24 },
  drillDownHeadline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8 },
  drillDownCardSmall: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }
});
