import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated, SafeAreaView, Modal, TextInput, Alert, Linking, LayoutAnimation, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import logger from '../utils/logger';
import { AcademyAnalytics } from '../components/AcademyAnalytics';

const screenWidth = Dimensions.get('window').width;

import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';
import { useTournaments } from '../context/TournamentContext';
import { useVideos } from '../context/VideoContext';
import { useEvaluations } from '../context/EvaluationContext';
import { useSupport } from '../context/SupportContext';
import { formatDateIST } from '../utils/tournamentUtils';


const InsightsScreen = ({ navigation }) => {
  const { currentUser: user, userRole: role } = useAuth();
  const { players } = usePlayers();
  const { tournaments } = useTournaments();
  const { matchVideos, matches } = useVideos();
  const { evaluations } = useEvaluations();
  const { supportTickets: tickets } = useSupport();
  
  const academyId = user?.id; // Standard fallback
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedAcademyId, setSelectedAcademyId] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null); // 'Players' | 'Tournaments' | 'Footage' | 'Coaches' | 'Devices' | 'Tickets' | null
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  const [selectedPlatform, setSelectedPlatform] = useState(null); // 'ios' | 'android'
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [insightModalVisible, setInsightModalVisible] = useState(false);
  const [drilldownType, setDrilldownType] = useState(null); // 'platform' | 'version'
  const [drilldownValue, setDrilldownValue] = useState(null); // 'ios', 'android', or '2.6.25'
  const [autoSelectUser, setAutoSelectUser] = useState(null);
  const [autoSelectTicketId, setAutoSelectTicketId] = useState(null);

  const statusColors = {
    'Open': { bg: '#EFF6FF', text: '#2563EB' },
    'In Progress': { bg: '#FFFBEB', text: '#D97706' },
    'Awaiting Response': { bg: '#FAF5FF', text: '#9333EA' },
    'Resolved': { bg: '#F0FDF4', text: '#16A34A' },
    'Closed': { bg: '#F1F5F9', text: '#64748B' },
  };

  // Initial Diagnostic Log
  useEffect(() => {
    try {
        logger.logAction('Insights_Mount', { 
            playerCount: (players || []).length, 
            tournamentCount: (tournaments || []).length, 
            videoCount: (matchVideos || []).length,
            coachCount: (players || []).filter(p => (p || {}).role === 'coach').length
        });
    } catch (e) {
        console.warn('Insights log failed silently', e);
    }
  }, []);

  // 1. Process Sports Distribution (General)
  const sportsStats = useMemo(() => {
    const counts = {};
    (players || []).forEach(p => {
      const sport = p.sport || (p.certifiedSports && p.certifiedSports[0]) || 'Other';
      counts[sport] = (counts[sport] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(...sorted.map(s => s[1]), 1);
    return sorted.map(([name, count]) => ({ name, count, percent: (count / max) * 100 }));
  }, [players]);

  // 2. Process Geographic Insights (Cities)
  const cityStats = useMemo(() => {
    const counts = {};
    (players || []).forEach(p => {
      const city = p.city || 'Other';
      counts[city] = (counts[city] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = (players || []).length || 1;
    return sorted.map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }));
  }, [players]);

  // 3. Drill-down Area Stats (within city)
  const areaStats = useMemo(() => {
    if (!selectedCity) return [];
    const counts = {};
    (players || []).filter(p => p && p.city === selectedCity).forEach(p => {
        const area = p.mostPlayedVenue || 'General Area';
        counts[area] = (counts[area] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = (players || []).filter(p => p && p.city === selectedCity).length || 1;
    return sorted.map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }));
  }, [players, selectedCity]);

  // 4. Academy Hosting Stats
  const academyStats = useMemo(() => {
    const counts = {};
    (tournaments || []).forEach(t => {
        const authorId = t.creatorId || 'system';
        counts[authorId] = (counts[authorId] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({
        id,
        name: (players || []).find(p => p.id === id)?.name || (id === 'system' ? 'Platform Admin' : 'Unknown Academy'),
        count,
        percent: (count / Math.max((tournaments || []).length, 1)) * 100
      }));
  }, [tournaments, players]);

  // 5. Academy Detail Stats
  const academyDetailStats = useMemo(() => {
    if (!selectedAcademyId) return null;
    const hosted = (tournaments || []).filter(t => t && (t.creatorId || 'system') === selectedAcademyId);
    const sportsCounts = {};
    hosted.forEach(t => { sportsCounts[t.sport] = (sportsCounts[t.sport] || 0) + 1; });
    const sportsDist = Object.entries(sportsCounts).map(([name, count]) => ({ name, count, percent: (count / (hosted.length || 1)) * 100 }));
    const totalParticipation = hosted.reduce((sum, t) => sum + (t.registeredPlayerIds?.length || 0), 0);
    return { sportsDistribution: sportsDist, totalParticipation, count: hosted.length };
  }, [tournaments, selectedAcademyId]);

  // 6. Stat Box Drill-downs
  const statDrillDownData = useMemo(() => {
    if (!selectedStat) return null;
    if (selectedStat === 'Players') {
        const counts = {};
        const newCounts = {};
        const _p = (players || []);
        _p.forEach((p, index) => { 
            const area = p.mostPlayedVenue || 'General Area'; 
            counts[area] = (counts[area] || 0) + 1; 
            if (index > _p.length * 0.7) {
                newCounts[area] = (newCounts[area] || 0) + 1;
            }
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ 
            name, value: count, label: 'Players', 
            newPct: Math.round(((newCounts[name] || 0) / count) * 100) 
        }));
    }
    if (selectedStat === 'Tournaments') {
        const counts = {};
        (tournaments || []).forEach(t => { 
            const area = t.location || 'General Venue'; 
            counts[area] = (counts[area] || 0) + 1; 
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ 
            name, 
            value: count, 
            label: 'Upcoming' 
        }));
    }

    if (selectedStat === 'Footage') {
        const counts = {};
        (matchVideos || []).forEach(v => {
            const tourney = (tournaments || []).find(t => t.id === v.tournamentId);
            const authorId = tourney?.creatorId || 'system';
            const academyName = (players || []).find(p => p.id === authorId)?.name || 'Platform Admin';
            counts[academyName] = (counts[academyName] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, value: count, label: 'Uploads' }));
    }
    if (selectedStat === 'Coaches') {
        const coachPlayers = (players || []).filter(p => p && p.role === 'coach');
        return coachPlayers.sort((a, b) => {
            const countA = (tournaments || []).filter(t => (t.assignedCoachIds || []).includes(a.id) || Object.keys(t.coachOtps || {}).includes(a.id)).length;
            const countB = (tournaments || []).filter(t => (t.assignedCoachIds || []).includes(b.id) || Object.keys(t.coachOtps || {}).includes(b.id)).length;
            return countB - countA;
        }).slice(0, 6).map(coach => {
            const judgedCount = (tournaments || []).filter(t => 
                (t.assignedCoachIds || []).includes(coach.id) || 
                (t.assignedCoachIds || []).includes(coach._id) ||
                Object.keys(t.coachOtps || {}).includes(coach.id) ||
                Object.keys(t.coachOtps || {}).includes(coach.phone)
            ).length;
            
            return {
                id: coach.id || coach._id,
                name: coach.name || coach.displayName || 'Unknown Coach',
                value: judgedCount,
                label: 'Judged'
            };
        });
    }


    return null;
  }, [selectedStat, players, tournaments, matchVideos]);

  // 7. Neighborhood Deep-dive Stats (Players & Sports)
  const neighborhoodStats = useMemo(() => {
    if (!selectedArea) return null;
    const areaPlayers = players.filter(p => (p.mostPlayedVenue || 'General Area') === selectedArea);
    
    // Sports distribution for these specific players
    const sportsCounts = {};
    areaPlayers.forEach(p => {
      const sport = p.sport || (p.certifiedSports && p.certifiedSports[0]) || 'Other';
      sportsCounts[sport] = (sportsCounts[sport] || 0) + 1;
    });
    
    const sportsDist = Object.entries(sportsCounts).map(([name, count]) => ({
      name,
      count,
      percent: (count / areaPlayers.length) * 100
    }));

    return {
      players: areaPlayers.slice(0, 8),
      sportsDistribution: sportsDist,
      total: areaPlayers.length
    };
  }, [players, selectedArea]);

  // 8. Coach Detail Stats
  const coachDetailStats = useMemo(() => {
    if (!selectedCoachId) return null;
    const judged = tournaments.filter(t => 
        (t.assignedCoachIds || []).includes(selectedCoachId) || 
        Object.keys(t.coachOtps || {}).includes(selectedCoachId)
    );
    
    const sportsCounts = {};
    const areaCounts = {};
    judged.forEach(t => {
        sportsCounts[t.sport] = (sportsCounts[t.sport] || 0) + 1;
        areaCounts[t.location] = (areaCounts[t.location] || 0) + 1;
    });

    return {
        count: judged.length,
        sportsDist: Object.entries(sportsCounts).map(([name, count]) => ({ name, count, percent: (count / judged.length) * 100 })),
        areaDist: Object.entries(areaCounts).map(([name, count]) => ({ name, count, percent: (count / judged.length) * 100 })),
        tournaments: judged.slice(0, 5)
    };
  }, [tournaments, selectedCoachId]);

  // 8.5 Tournament Detail Stats (Location-based)
  const tournamentDetailStats = useMemo(() => {
    if (!selectedLocation) return null;
    const locationTournaments = tournaments.filter(t => (t.location || 'General Venue') === selectedLocation);
    
    // Monthly distribution within this location
    const monthCounts = {};
    locationTournaments.forEach(t => {
        const m = new Date(t.date).toLocaleString('default', { month: 'short' });
        monthCounts[m] = (monthCounts[m] || 0) + 1;
    });

    return {
        count: locationTournaments.length,
        dist: Object.entries(monthCounts).map(([name, count]) => ({ name, count, percent: (count / locationTournaments.length) * 100 })),
        tournaments: locationTournaments.slice(0, 8)
    };
  }, [tournaments, selectedLocation]);
  
  // 9. Device Distribution Insights

  const deviceStats = useMemo(() => {
    const counts = { ios: 0, android: 0, other: 0 };
    (players || []).forEach(p => {
      if (!p.devices || p.devices.length === 0) return;
      const latestDevice = [...p.devices].sort((a,b) => (b.lastActive || 0) - (a.lastActive || 0))[0];
      const name = (latestDevice?.name || '').toLowerCase();
      const pVer = (latestDevice?.platformVersion || '').toLowerCase();
      const fullInfo = `${name} ${pVer}`;
      
      if (fullInfo.includes('ios') || fullInfo.includes('iphone') || fullInfo.includes('ipad') || fullInfo.includes('apple')) counts.ios++;
      else if (fullInfo.includes('android')) counts.android++;
      else counts.other++;
    });
    return counts;
  }, [players]);

  // 10. Support Ticket Device/Version Insights
  const ticketDeviceStats = useMemo(() => {
    const versionCounts = {}; // { '2.6.25': 5, ... }
    const osCounts = { ios: 0, android: 0, other: 0 };
    const _t = (tickets || []);

    _t.forEach(t => {
      const deviceInfo = t.deviceInfo;
      const appVer = deviceInfo?.appVersion || 'Unknown';
      versionCounts[appVer] = (versionCounts[appVer] || 0) + 1;
      
      if (deviceInfo?.os?.toLowerCase() === 'ios') osCounts.ios++;
      else if (deviceInfo?.os?.toLowerCase() === 'android') osCounts.android++;
      else osCounts.other++;
    });

    const sortedVersions = Object.entries(versionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxVal = Math.max(...sortedVersions.map(v => v[1]), 1);

    return {
      versions: sortedVersions.map(([v, count]) => ({ name: v, count, percent: (count / maxVal) * 100 })),
      platforms: osCounts
    };
  }, [tickets]);

  // 11. Detailed Device Player Lists
  const deviceDetailList = useMemo(() => {
    if (selectedStat !== 'Devices' && selectedStat !== 'Tickets') return [];
    
    // For Devices stat, we show distribution of ALL players
    if (selectedStat === 'Devices') {
        const iosPlayers = [];
        const androidPlayers = [];
        
        players.forEach(p => {
            if (!p.devices || p.devices.length === 0) return;
            const latestDevice = [...p.devices].sort((a,b) => (b.lastActive || 0) - (a.lastActive || 0))[0];
            const name = (latestDevice?.name || '').toLowerCase();
            const pVer = (latestDevice?.platformVersion || '').toLowerCase();
            const fullInfo = `${name} ${pVer}`;
            
            const info = { ...p, appVersion: latestDevice?.appVersion || 'Legacy' };
            
            if (fullInfo.includes('ios') || fullInfo.includes('iphone') || fullInfo.includes('ipad') || fullInfo.includes('apple')) iosPlayers.push(info);
            else if (fullInfo.includes('android')) androidPlayers.push(info);
        });

        return { ios: iosPlayers, android: androidPlayers };
    }
    return null;
  }, [players, selectedStat]);

  // 12. Filtered Device Users for Modal Search
  const filteredDeviceUsers = useMemo(() => {
    if (!selectedPlatform || !deviceDetailList) return [];
    const list = selectedPlatform === 'ios' ? deviceDetailList.ios : deviceDetailList.android;
    if (!deviceSearchQuery.trim()) return list;
    
    const q = deviceSearchQuery.toLowerCase();
    return list.filter(p => 
        (p.name || '').toLowerCase().includes(q) || 
        (p.id || '').toLowerCase().includes(q) || 
        (p.appVersion || '').toLowerCase().includes(q)
    );
  }, [selectedPlatform, deviceDetailList, deviceSearchQuery]);

  // Growth Data with Percentages
  const growthStats = useMemo(() => {
    const rawData = [35, 55, 48, 75, 92, 110];
    return rawData.map((val, i) => {
        if (i === 0) return { val, p: ['J','F','M','A','M','J'][i], pct: 0 };
        const prev = rawData[i-1];
        const pct = Math.round(((val - prev) / prev) * 100);
        return { val, p: ['J','F','M','A','M','J'][i], pct };
    });
  }, []);

  // 14. 🧪 Unified Support Insights Drill-down Logic (v2.6.40)
  const insightDrilldownData = useMemo(() => {
    if (!drilldownType || !drilldownValue) return null;
    
    // Filter tickets based on criteria
    const filtered = (tickets || []).filter(t => {
      if (drilldownType === 'platform') {
        return t.deviceInfo?.os?.toLowerCase() === drilldownValue.toLowerCase();
      }
      if (drilldownType === 'version') {
        return (t.deviceInfo?.appVersion || 'Unknown') === drilldownValue;
      }
      return false;
    });
    
    // Group by Category (type)
    const categoryCounts = {};
    filtered.forEach(t => {
      const cat = t.type || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    
    const total = Math.max(filtered.length, 1);
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / total) * 100)
      }));
      
    return {
      tickets: filtered.slice(0, 50),
      categories: sortedCategories,
      totalCount: filtered.length
    };
  }, [tickets, drilldownType, drilldownValue]);

  // Action Handlers with Logging
  const handleStatSelect = (stat) => {
    const newVal = selectedStat === stat ? null : stat;
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    logger.logAction('Insights_Stat_Toggle', { stat, action: newVal ? 'open' : 'close' });
    setSelectedStat(newVal);
    setSelectedArea(null);
    setSelectedCoachId(null);
    setSelectedLocation(null);
  };


  const handleCitySelect = (city) => {
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    logger.logAction('Insights_City_Select', { city });
    setSelectedCity(city);
  };

  const handleAcademySelect = (id, name) => {
    logger.logAction('Insights_Academy_Select', { id, name });
    setSelectedAcademyId(id);
  };

  const handleAreaSelect = (area) => {
    logger.logAction('Insights_Area_DeepDive', { area });
    setSelectedArea(area);
  };

  const handleCoachSelect = (id, name) => {
    logger.logAction('Insights_Coach_DeepDive', { id, name });
    setSelectedCoachId(id);
  };

  const handleTournamentSelect = (location) => {
    logger.logAction('Insights_Tournament_DeepDive', { location });
    setSelectedLocation(location);
  };


  if (role === 'academy') {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.academyHeader}>
                <Text style={styles.welcomeText}>Academy Insights</Text>
                <Text style={styles.subText}>Performance & Revenue analytics</Text>
            </View>
            <AcademyAnalytics 
                academyId={academyId || user?.id} 
                tournaments={tournaments} 
                players={players} 
                matchVideos={matchVideos}
                matches={matches}
                evaluations={evaluations}
            />
        </SafeAreaView>
    );
  }

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
          <StatBox title="Players" value={(players || []).length} icon="people" color="#6366F1" trend="+12%" isActive={selectedStat === 'Players'} onPress={() => handleStatSelect('Players')} />
          <StatBox title="Tournaments" value={(tournaments || []).length} icon="trophy" color="#F59E0B" trend="+5%" isActive={selectedStat === 'Tournaments'} onPress={() => handleStatSelect('Tournaments')} />
          <StatBox title="Footage" value={(matchVideos || []).length} icon="videocam" color="#10B981" trend="+24%" isActive={selectedStat === 'Footage'} onPress={() => handleStatSelect('Footage')} />
          <StatBox title="Coaches" value={(players || []).filter(p => p && p.role === 'coach').length} icon="school" color="#8B5CF6" trend="+18%" isActive={selectedStat === 'Coaches'} onPress={() => handleStatSelect('Coaches')} />
          <StatBox title="Devices" value={deviceStats.ios + deviceStats.android} icon="phone-portrait" color="#EC4899" trend="Dist" isActive={selectedStat === 'Devices'} onPress={() => handleStatSelect('Devices')} />
          <StatBox title="Tickets" value={(tickets || []).length} icon="chatbubbles" color="#3B82F6" trend="Issues" isActive={selectedStat === 'Tickets'} onPress={() => handleStatSelect('Tickets')} />
        </View>

        {/* Dynamic Stat Drill-down with Area/Coach Deep-dive */}
        {selectedStat && (
            <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                    <Text style={styles.chartTitle}>
                        {selectedArea ? 'Neighborhood Detail' : selectedCoachId ? 'Coach Performance' : `${selectedStat} Distribution`}
                    </Text>
                    <TouchableOpacity onPress={() => {
                        if (selectedArea) setSelectedArea(null);
                        else if (selectedCoachId) setSelectedCoachId(null);
                        else if (selectedLocation) setSelectedLocation(null);
                        else setSelectedStat(null);
                    }}>
                        <Ionicons name={(selectedArea || selectedCoachId || selectedLocation) ? "arrow-back-circle" : "close-circle"} size={22} color="#6366F1" />
                    </TouchableOpacity>

                </View>

                {selectedArea ? (
                    <View style={styles.areaDetail}>
                         <View style={styles.areaHero}>
                            <Text style={styles.areaHeroTitle}>{selectedArea}</Text>
                            <Text style={styles.areaHeroCount}>{neighborhoodStats?.total} Total Players</Text>
                         </View>
                         {/* ... Existing Area Detail logic ... */}
                         <Text style={styles.subChartTitle}>Sport Engagement</Text>
                         {neighborhoodStats?.sportsDistribution.map((item) => (
                             <View key={item.name} style={styles.detailBarRow}>
                                <View style={styles.barLabelContainer}>
                                    <Text style={styles.barLabel}>{item.name}</Text>
                                    <Text style={styles.barValue}>{item.count} Players</Text>
                                </View>
                                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: '#6366F1' }]} /></View>
                             </View>
                         ))}
                    </View>
                ) : selectedCoachId ? (
                    <View style={styles.coachDetail}>
                        <View style={styles.areaHero}>
                            <Text style={styles.areaHeroTitle}>{players.find(p => p.id === selectedCoachId)?.name}</Text>
                            <Text style={styles.areaHeroCount}>{coachDetailStats?.count} Tournaments Judged</Text>
                        </View>

                        <Text style={styles.subChartTitle}>Specialties (Sports)</Text>
                        {coachDetailStats?.sportsDist.map((item) => (
                             <View key={item.name} style={styles.detailBarRow}>
                                <View style={styles.barLabelContainer}>
                                    <Text style={styles.barLabel}>{item.name}</Text>
                                    <Text style={styles.barValue}>{item.count} Events</Text>
                                </View>
                                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: '#8B5CF6' }]} /></View>
                             </View>
                        ))}

                        <Text style={[styles.subChartTitle, { marginTop: 20 }]}>Geographic Activity (Areas)</Text>
                        {coachDetailStats?.areaDist.map((item) => (
                             <View key={item.name} style={styles.detailBarRow}>
                                <View style={styles.barLabelContainer}>
                                    <Text style={styles.barLabel}>{item.name}</Text>
                                    <Text style={styles.barValue}>{item.count} Events</Text>
                                </View>
                                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: '#10B981' }]} /></View>
                             </View>
                        ))}
                    </View>
                ) : selectedLocation ? (
                    <View style={styles.areaDetail}>
                         <View style={styles.areaHero}>
                            <Text style={styles.areaHeroTitle}>{selectedLocation}</Text>
                            <Text style={styles.areaHeroCount}>{tournamentDetailStats?.count} Total Events</Text>
                         </View>

                         <Text style={styles.subChartTitle}>Calendar Mix</Text>
                         {tournamentDetailStats?.dist.map((item) => (
                             <View key={item.name} style={styles.detailBarRow}>
                                <View style={styles.barLabelContainer}>
                                    <Text style={styles.barLabel}>{item.name}</Text>
                                    <Text style={styles.barValue}>{item.count} Events</Text>
                                </View>
                                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: '#F59E0B' }]} /></View>
                             </View>
                         ))}

                         <Text style={[styles.subChartTitle, { marginTop: 20 }]}>Participating Tournaments</Text>
                         {tournamentDetailStats?.tournaments.map((t) => (
                            <View key={t.id} style={styles.drillDownCardSmall}>
                                <View style={styles.rowBetween}>
                                    <View style={styles.flexItem}>
                                        <Text style={styles.drillDownLabel}>{t.title}</Text>
                                        <Text style={styles.drillDownSubText}>{t.sport} • {formatDateIST(t.date)}</Text>
                                    </View>
                                    <Ionicons name="trophy" size={14} color="#F59E0B" />
                                </View>
                            </View>
                         ))}
                    </View>
                ) : (

                    <View>
                        <View style={styles.drillInfoBox}>
                            <Ionicons 
                                name={selectedStat === 'Players' ? 'location' : selectedStat === 'Coaches' ? 'people' : 'analytics'} 
                                size={14} 
                                color="#6366F1" 
                            />
                            <Text style={styles.drillInfoText}>
                                {selectedStat === 'Coaches' ? 'Tap a coach to review judging history and specialized categories' : 
                                 selectedStat === 'Players' ? 'Tap a neighborhood for local engagement and sport hotspots' :
                                 selectedStat === 'Tournaments' ? 'Tap a tournament for participant lists and bracket summaries' :
                                 selectedStat === 'Matches' ? 'Review global match activity and regional scoring trends' :
                                 'Select an item below to see more detailed sub-tab metrics'}
                            </Text>
                        </View>
                        {statDrillDownData?.map((item, index) => (
                            <TouchableOpacity 
                                key={item.name || item.id} 
                                style={styles.barRow}
                                onPress={() => {
                                    if (selectedStat === 'Players') handleAreaSelect(item.name);
                                    if (selectedStat === 'Coaches') handleCoachSelect(item.id, item.name);
                                    if (selectedStat === 'Tournaments') handleTournamentSelect(item.name);
                                }}
                            >
                                <View style={styles.barLabelContainer}>
                                    <View style={styles.flexItem}>
                                        <Text style={styles.barLabel}>{item.name}</Text>
                                        {item.newPct !== undefined && <Text style={styles.newLabel}>{item.newPct}% New Joiners</Text>}
                                    </View>
                                    <Text style={styles.barValue}>{item.value} {item.label}</Text>
                                    {(selectedStat === 'Players' || selectedStat === 'Coaches' || selectedStat === 'Tournaments') && <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />}
                                </View>

                                <View style={styles.barTrack}>
                                    <View style={[styles.barFill, { width: `${(item.value / (statDrillDownData[0].value || 1)) * 100}%`, backgroundColor: index === 0 ? (selectedStat === 'Coaches' ? '#8B5CF6' : '#6366F1') : '#CBD5E1' }]} />
                                </View>
                            </TouchableOpacity>
                        ))}
                        
                        {/* Device Detail View */}
                        {selectedStat === 'Devices' && (
                            <View style={styles.deviceDetailContainer}>
                                <View style={styles.drillInfoBox}>
                                    <Ionicons name="phone-portrait" size={14} color="#6366F1" />
                                    <Text style={styles.drillInfoText}>Tap a platform to search and filter specific players by their device hardware</Text>
                                </View>
                                <Text style={styles.subChartTitle}>Android vs iPhone (by Players)</Text>
                                <View style={styles.deviceSplitRow}>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            setSelectedPlatform('android');
                                            setDeviceModalVisible(true);
                                        }}
                                        style={[styles.deviceCol, { borderLeftColor: '#10B981', borderLeftWidth: 3 }]}
                                    >
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.deviceTitle}>Android</Text>
                                            <Ionicons name="search" size={12} color="#94A3B8" />
                                        </View>
                                        <Text style={styles.deviceCount}>{deviceStats.android}</Text>
                                        <Text style={styles.tapToSearch}>Tap to search all users</Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity 
                                        onPress={() => {
                                            setSelectedPlatform('ios');
                                            setDeviceModalVisible(true);
                                        }}
                                        style={[styles.deviceCol, { borderLeftColor: '#3B82F6', borderLeftWidth: 3 }]}
                                    >
                                        <View style={styles.rowBetween}>
                                            <Text style={styles.deviceTitle}>iPhone</Text>
                                            <Ionicons name="search" size={12} color="#94A3B8" />
                                        </View>
                                        <Text style={styles.deviceCount}>{deviceStats.ios}</Text>
                                        <Text style={styles.tapToSearch}>Tap to search all users</Text>
                                    </TouchableOpacity>
                                </View>

                            </View>
                        )}

                        {/* Ticket Analysis View */}
                        {selectedStat === 'Tickets' && (
                            <View style={styles.ticketDetailContainer}>
                                <Text style={styles.subChartTitle}>Issue Source Breakdown</Text>
                                <View style={styles.deviceSplitRow}>
                                    <View style={[styles.deviceCol, { borderLeftColor: '#F59E0B', borderLeftWidth: 3, flex: 1 }]}>
                                        <Text style={styles.deviceTitle}>Tickets Total</Text>
                                        <Text style={styles.deviceCount}>{tickets.length}</Text>
                                    </View>
                                </View>

                                <Text style={[styles.subChartTitle, { marginTop: 20 }]}>Tickets by App Version</Text>
                                <View style={styles.drillInfoBox}>
                                    <Ionicons name="information-circle" size={14} color="#6366F1" />
                                    <Text style={styles.drillInfoText}>Tap any version below to see specific issue categories reported in that build</Text>
                                </View>
                                {ticketDeviceStats.versions.map((ver) => (
                                    <TouchableOpacity 
                                        key={ver.name} 
                                        onPress={() => {
                                            setDrilldownType('version');
                                            setDrilldownValue(ver.name);
                                            setInsightModalVisible(true);
                                            logger.logAction('Insights_Version_Tickets_Open', { version: ver.name });
                                        }}
                                        style={[styles.detailBarRow, { marginBottom: 12 }]}
                                    >
                                        <View style={styles.barLabelContainer}>
                                            <Text style={styles.barLabel}>Version {ver.name}</Text>
                                            <Text style={styles.barValue}>{ver.count} Issues</Text>
                                        </View>
                                        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${ver.percent}%`, backgroundColor: '#F59E0B' }]} /></View>
                                    </TouchableOpacity>
                                ))}

                                <Text style={[styles.subChartTitle, { marginTop: 20 }]}>Tickets by Platform</Text>
                                <View style={styles.rowBetween}>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            setDrilldownType('platform');
                                            setDrilldownValue('android');
                                            setInsightModalVisible(true);
                                            logger.logAction('Insights_Platform_Tickets_Open', { platform: 'android' });
                                        }}
                                        style={styles.platformIconBox}
                                    >
                                        <Ionicons name="logo-android" size={18} color="#10B981" />
                                        <Text style={styles.platformIconText}>{ticketDeviceStats.platforms.android} Android</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            setDrilldownType('platform');
                                            setDrilldownValue('ios');
                                            setInsightModalVisible(true);
                                            logger.logAction('Insights_Platform_Tickets_Open', { platform: 'ios' });
                                        }}
                                        style={styles.platformIconBox}
                                    >
                                        <Ionicons name="logo-apple" size={18} color="#0F172A" />
                                        <Text style={styles.platformIconText}>{ticketDeviceStats.platforms.ios} iPhone</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </View>
        )}

        {/* Home View Sections (Only if no stat selected) */}
        {!selectedStat && (
            <>
                <View style={styles.chartCard}>
                    <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>Top Hosting Academies</Text>
                        {selectedAcademyId && (
                            <TouchableOpacity onPress={() => setSelectedAcademyId(null)} style={styles.backBtn}>
                                <Ionicons name="arrow-back" size={14} color="#6366F1" />
                                <Text style={styles.backBtnText}>All</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {selectedAcademyId ? (
                        <View style={styles.academyDetail}>
                            <Text style={styles.detailName}>{players.find(p => p.id === selectedAcademyId)?.name}</Text>
                            <View style={styles.detailStatsRow}>
                                <View style={styles.detailStat}><Text style={styles.detailStatVal}>{academyDetailStats?.count}</Text><Text style={styles.detailStatLabel}>Events</Text></View>
                                <View style={styles.detailStat}><Text style={styles.detailStatVal}>{academyDetailStats?.totalParticipation}</Text><Text style={styles.detailStatLabel}>Players</Text></View>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.academyList}>
                            {academyStats.map((item, index) => (
                                <TouchableOpacity key={item.id} style={styles.academyRow} onPress={() => handleAcademySelect(item.id, item.name)}>
                                    <View style={[styles.academyRank, { backgroundColor: index === 0 ? '#6366F1' : '#F1F5F9' }]}><Text style={[styles.rankText, { color: index === 0 ? '#fff' : '#475569' }]}>{index+1}</Text></View>
                                    <Text style={styles.academyName}>{item.name}</Text>
                                    <Text style={styles.academyTournaments}>{item.count} Hosts</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                <View style={styles.chartCard}>
                    <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>{selectedCity ? `Areas in ${selectedCity}` : 'Hotspot Cities'}</Text>
                        {selectedCity && (
                            <TouchableOpacity onPress={() => setSelectedCity(null)} style={styles.backBtn}>
                                <Ionicons name="arrow-back" size={14} color="#6366F1" />
                                <Text style={styles.backBtnText}>Cities</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.geoContainer}>
                        {(selectedCity ? areaStats : cityStats).map((item, index) => (
                            <TouchableOpacity key={item.name} style={styles.geoRow} onPress={() => !selectedCity && handleCitySelect(item.name)}>
                                <View style={[styles.dot, { backgroundColor: ['#6366F1', '#EC4899', '#10B981', '#F59E0B'][index % 4] }]} />
                                <Text style={styles.geoName}>{item.name}</Text>
                                <Text style={styles.geoCount}>{item.count}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </>
        )}

        {/* Global Split (Only if no stat selected) */}
        {!selectedStat && (
            <View style={styles.chartCard} pointerEvents="none">
              <Text style={styles.chartTitle}>Global Sports Split</Text>
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
        )}

        {/* Community Growth */}
        <View style={styles.chartCard}>
            <View style={styles.chartHeaderExpanded}>
                <View>
                    <Text style={styles.chartTitle}>Community Growth</Text>
                    <Text style={styles.chartSubtitle}>Month-over-month engagement</Text>
                </View>
                <View style={styles.growthBadge}><Ionicons name="flash" size={14} color="#6366F1" /><Text style={styles.growthBadgeText}>Active</Text></View>
            </View>
            <View style={styles.growthContainer}>
                {growthStats.map((item, index) => {
                    const maxHeight = 90; // Reduced for safer vertical padding
                    const visualHeight = Math.min((item.val / 110) * maxHeight, maxHeight);
                    return (
                        <View key={index} style={styles.growthColumn}>
                            <View style={styles.pctContainer}>{item.pct > 0 && <Text style={styles.pctText}>+{item.pct}%</Text>}</View>
                            <View style={[styles.growthBar, { height: visualHeight }]} />
                            <Text style={styles.growthLabel}>{item.p}</Text>
                        </View>
                    );
                })}
            </View>
        </View>

        <View style={{ height: 40 }} />
      </LinearGradient>

      {/* Full-screen Searchable User Modal */}
      <Modal 
        visible={deviceModalVisible} 
        animationType="slide" 
        onRequestClose={() => setDeviceModalVisible(false)}
      >
        <SafeAreaView style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{selectedPlatform === 'ios' ? 'iPhone' : 'Android'} Users</Text>
              <Text style={styles.modalSubtitle}>{filteredDeviceUsers.length} total users match search</Text>
            </View>
            <TouchableOpacity onPress={() => { setDeviceModalVisible(false); setDeviceSearchQuery(''); }}>
              <Ionicons name="close-circle" size={32} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBarWrapper}>
            <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
            <TextInput 
              style={styles.modalSearchInput}
              placeholder="Search by name, ID or version..."
              value={deviceSearchQuery}
              onChangeText={setDeviceSearchQuery}
              autoFocus={true}
            />
            {deviceSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setDeviceSearchQuery('')}>
                <Ionicons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            {filteredDeviceUsers.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={48} color="#F1F5F9" />
                    <Text style={styles.emptyStateText}>No users found for "{deviceSearchQuery}"</Text>
                </View>
            ) : (
                filteredDeviceUsers.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={styles.deviceUserRow}
                      onPress={() => {
                        logger.logAction('Insights_Click_Modal_User', { userId: p.id, platform: selectedPlatform });
                        
                        // Use native Alert to offer options
                        const options = [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Investigate in Admin Hub', 
                            onPress: () => {
                                setDeviceModalVisible(false);
                                setDeviceSearchQuery('');
                                navigation.navigate('Admin', { 
                                    autoSelectUser: p.id, 
                                    autoSelectSubTab: 'diagnostics' 
                                });
                            }
                          }
                        ];
                        
                        // If they have a phone, we could offer more, but diagnostic API is what was requested
                        Alert.alert(
                          `User: ${p.name || p.id}`,
                          `Technical ID: ${p.id}\nPlatform: ${selectedPlatform === 'ios' ? 'iPhone' : 'Android'}\nVersion: v${p.appVersion}`,
                          options
                        );
                      }}
                    >
                        <View style={styles.flexItem}>
                            <Text style={styles.deviceUserName}>{p.name}</Text>
                            <Text style={styles.deviceUserId}>ID: {p.id}</Text>
                        </View>
                        <View style={styles.appVersionBadge}>
                            <Text style={styles.appVersionText}>v{p.appVersion}</Text>
                        </View>
                    </TouchableOpacity>
                ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 🧪 Unified Support Insight Detail Modal (v2.6.40) */}
      <Modal 
        visible={insightModalVisible} 
        animationType="slide"
        onRequestClose={() => setInsightModalVisible(false)}
      >
        <SafeAreaView style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.flexItem}>
              <View style={styles.rowAlign}>
                <Ionicons 
                  name={drilldownType === 'version' ? "cube" : (drilldownValue === 'ios' ? "logo-apple" : "logo-android")} 
                  size={20} 
                  color={drilldownType === 'version' ? "#F59E0B" : (drilldownValue === 'ios' ? "#0F172A" : "#10B981")} 
                />
                <Text style={[styles.modalTitle, { marginLeft: 8 }]}>
                    {drilldownType === 'version' ? `Version ${drilldownValue}` : (drilldownValue === 'ios' ? 'iPhone' : 'Android')} Issues
                </Text>
              </View>
              <Text style={styles.modalSubtitle}>{insightDrilldownData?.totalCount} Total matching tickets</Text>
            </View>
            <TouchableOpacity onPress={() => setInsightModalVisible(false)}>
              <Ionicons name="close-circle" size={32} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.platformInsightsSection}>
              <Text style={styles.subChartTitle}>Issue Category Breakdown (%)</Text>
              {insightDrilldownData?.categories.map((cat, idx) => (
                <View key={cat.name} style={styles.detailBarRow}>
                  <View style={styles.barLabelContainer}>
                    <Text style={styles.barLabel}>{cat.name}</Text>
                    <Text style={styles.barValue}>{cat.percent}%</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${cat.percent}%`, backgroundColor: idx === 0 ? '#6366F1' : '#94A3B8' }]} />
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.platformInsightsSection, { marginTop: 24 }]}>
              <Text style={styles.subChartTitle}>Recent Tickets ({drilldownValue})</Text>
              {insightDrilldownData?.tickets.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No tickets found for this criteria</Text>
                </View>
              ) : (
                insightDrilldownData?.tickets.map(t => (
                  <TouchableOpacity 
                    key={t.id} 
                    style={styles.deviceUserRow}
                    onPress={() => {
                        Alert.alert(
                            "View Ticket",
                            `Would you like to open Ticket #${t.id} in the Support Center?`,
                            [
                                { text: "Cancel", style: "cancel" },
                                { text: "Open", onPress: () => {
                                    setInsightModalVisible(false);
                                    navigation.navigate('Admin', { 
                                        subTab: 'grievances', 
                                        autoSelectTicketId: t.id 
                                    });
                                }}
                            ]
                        );
                    }}
                  >
                    <View style={styles.flexItem}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.deviceUserName}>{t.title}</Text>
                        <View style={[styles.statusMiniBadge, { backgroundColor: statusColors[t.status]?.bg || '#F1F5F9' }]}>
                           <Text style={[styles.statusMiniText, { color: statusColors[t.status]?.text || '#64748B' }]}>{t.status}</Text>
                        </View>
                      </View>
                      <View style={styles.rowAlign}>
                         <Text style={styles.deviceUserId}>ID: {t.id} • {t.type}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                ))
              )}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
};

const AnimatedBar = ({ width, color }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(animatedWidth, { toValue: 1, duration: 1200, useNativeDriver: false }).start(); }, [width]);
  return (<Animated.View style={[styles.barFill, { backgroundColor: color, width: animatedWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', width] }) }]} />);
};

const StatBox = ({ title, value, icon, color, trend, isActive, onPress }) => (
  <TouchableOpacity 
    style={[
      styles.statBox, 
      { borderColor: isActive ? color : '#fff', borderWidth: 2 },
      isActive && { backgroundColor: '#F8FAFC' }
    ]} 
    onPress={onPress}
  >
    <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={20} color={color} /></View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statTitle}>{title}</Text>
    <View style={styles.trendRow}><Ionicons name="caret-up" size={12} color="#10B981" /><Text style={styles.trendText}>{trend}</Text></View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20 },
  academyHeader: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 16, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 40 },
  welcomeText: { ...typography.h1, color: colors.navy[900] },
  subText: { ...typography.caption, color: colors.navy[500], marginTop: 2 },
  refreshBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...shadows?.sm },
  statsGrid: { 
    flexDirection: 'row', 
    justifyContent: 'flex-start', 
    marginBottom: 24, 
    flexWrap: 'wrap', 
    gap: 10,
    width: '100%',
  },
  statBox: { 
    backgroundColor: '#fff', 
    width: '47%', 
    padding: 14, 
    borderRadius: borderRadius.lg, 
    ...shadows.sm 
  },
  iconCircle: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { ...typography.h2, color: colors.navy[900] },
  statTitle: { ...typography.micro, color: colors.navy[400], marginBottom: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 9, color: colors.success, fontWeight: '700', marginLeft: 2 },
  chartCard: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: 20, marginBottom: 20, ...shadows.sm },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  chartHeaderExpanded: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  chartTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  chartSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  barChartContainer: { marginTop: 10 },
  barRow: { marginBottom: 18 },
  barLabelContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2 },
  barLabel: { fontSize: 13, fontWeight: '700', color: '#334155', flex: 1 },
  barValue: { fontSize: 12, fontWeight: '800', color: '#1E293B', marginRight: 8 },
  newLabel: { fontSize: 10, color: '#10B981', fontWeight: '700', marginTop: 1 },
  barTrack: { height: 8, backgroundColor: colors.navy[100], borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  drillInfoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 10, borderRadius: 10, marginBottom: 12, gap: 8 },
  drillInfoText: { fontSize: 11, color: '#4F46E5', fontWeight: '500', flex: 1 },
  areaDetail: { marginTop: 4 },
  areaHero: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 20 },
  areaHeroTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  areaHeroCount: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  subChartTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 16, marginLeft: 2 },
  detailBarRow: { marginBottom: 14 },
  playerList: { marginTop: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: '#fff', padding: 10, borderRadius: 12, borderContent: '#F1F5F9', borderWidth: 1 },
  playerName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155', marginLeft: 10 },
  playerTag: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  playerTagText: { fontSize: 9, fontWeight: '700', color: '#6366F1' },
  growthContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 160, marginTop: 4, paddingHorizontal: 4 },
  growthColumn: { alignItems: 'center', flex: 1 },
  platformInsightsSection: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 20,
    marginTop: 8
  },
  rowAlign: { flexDirection: 'row', alignItems: 'center' },
  statusMiniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  statusMiniText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  growthBar: { width: 14, backgroundColor: '#6366F1', borderRadius: 6, opacity: 0.8 },
  growthLabel: { fontSize: 10, color: '#94A3B8', marginTop: 8, fontWeight: '700' },
  growthBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  growthBadgeText: { ...typography.caption, color: colors.primary.base, marginLeft: 4 },
  pctContainer: { height: 20, justifyContent: 'flex-end', marginBottom: 4 },
  pctText: { fontSize: 9, fontWeight: '800', color: '#10B981' },
  flexItem: { flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  backBtnText: { fontSize: 12, fontWeight: '700', color: '#6366F1', marginLeft: 4 },
  academyList: { marginTop: 4 },
  academyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  academyRank: { width: 24, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankText: { fontSize: 11, fontWeight: '800' },
  academyName: { fontSize: 14, fontWeight: '700', color: '#334155', flex: 1 },
  academyTournaments: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  academyDetail: { paddingVertical: 8 },
  detailName: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 12 },
  detailStatsRow: { flexDirection: 'row', gap: 20 },
  detailStat: { alignItems: 'center' },
  detailStatVal: { fontSize: 16, fontWeight: '800', color: '#6366F1' },
  detailStatLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  geoContainer: { marginTop: 4 },
  geoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  geoName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  geoCount: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  deviceDetailContainer: { marginTop: 10 },
  deviceSplitRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  deviceCol: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12 },
  deviceTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  deviceCount: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  deviceUserRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8 },
  deviceUserName: { fontSize: 13, fontWeight: '700', color: '#334155' },
  deviceUserId: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  appVersionBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  appVersionText: { fontSize: 10, fontWeight: '800', color: '#6366F1' },
  platformIconBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, flex: 1, marginRight: 10, justifyContent: 'center' },
  platformIconText: { fontSize: 12, fontWeight: '700', color: '#334155', marginLeft: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tapToSearch: { fontSize: 9, fontWeight: '700', color: '#6366F1', marginTop: 4, fontStyle: 'italic' },
  modalFullContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  modalSubtitle: { fontSize: 11, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  searchBarWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', margin: 24, marginTop: 12, marginBottom: 12, paddingHorizontal: 16, borderRadius: 14, height: 48, borderWidth: 1, borderColor: '#F1F5F9' },
  modalSearchInput: { flex: 1, height: '100%', fontSize: 14, color: '#1E293B', fontWeight: '600' },
  searchIcon: { marginRight: 10 },
  modalContent: { flex: 1 },
  modalScrollContent: { padding: 24, paddingTop: 0 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyStateText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
});

export default InsightsScreen;
