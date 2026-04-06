import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated, SafeAreaView, Modal, TextInput, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import designSystem from '../theme/designSystem';
import logger from '../utils/logger';
import { AcademyAnalytics } from '../components/AcademyAnalytics';

const screenWidth = Dimensions.get('window').width;

const InsightsScreen = ({ 
  role, 
  user, 
  academyId, 
  players = [], 
  tournaments = [], 
  matchVideos = [],
  matches = [],
  evaluations = [],
  supportTickets: tickets = [], // Alias supportTickets to tickets for component-wide usage
  navigation
}) => {
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedAcademyId, setSelectedAcademyId] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null); // 'Players' | 'Tournaments' | 'Footage' | 'Coaches' | 'Devices' | 'Tickets' | null
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null); // 'ios' | 'android'
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  // Initial Diagnostic Log
  useEffect(() => {
    logger.logAction('Insights_Mount', { 
        playerCount: (players || []).length, 
        tournamentCount: (tournaments || []).length, 
        videoCount: (matchVideos || []).length,
        coachCount: (players || []).filter(p => (p || {}).role === 'coach').length
    });
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
        (tournaments || []).forEach(t => { const area = t.location || 'General Venue'; counts[area] = (counts[area] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, value: count, label: 'Hosts' }));
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
        const counts = {};
        (tournaments || []).forEach(t => {
            const coachIds = (t.assignedCoachIds || []).concat(Object.keys(t.coachOtps || {}));
            [...new Set(coachIds)].forEach(cid => {
                counts[cid] = (counts[cid] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cid, count]) => ({
            id: cid,
            name: (players || []).find(p => p.id === cid)?.name || 'Unknown Coach',
            value: count,
            label: 'Judged'
        }));
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
      
      const os = deviceInfo?.os?.toLowerCase() || 'other';
      if (os === 'ios') osCounts.ios++;
      else if (os === 'android') osCounts.android++;
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

  // Action Handlers with Logging
  const handleStatSelect = (stat) => {
    const newVal = selectedStat === stat ? null : stat;
    logger.logAction('Insights_Stat_Toggle', { stat, action: newVal ? 'open' : 'close' });
    setSelectedStat(newVal);
    setSelectedArea(null);
    setSelectedCoachId(null);
  };

  const handleCitySelect = (city) => {
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
                        else setSelectedStat(null);
                    }}>
                        <Ionicons name={(selectedArea || selectedCoachId) ? "arrow-back-circle" : "close-circle"} size={22} color="#6366F1" />
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
                ) : (
                    <View>
                        <View style={styles.drillInfoBox}>
                            <Ionicons name="location" size={14} color="#6366F1" />
                            <Text style={styles.drillInfoText}>
                                {selectedStat === 'Coaches' ? 'Click a coach to see their judging history and specialties' : 'Click an area to see specific players and their sports'}
                            </Text>
                        </View>
                        {statDrillDownData?.map((item, index) => (
                            <TouchableOpacity 
                                key={item.name || item.id} 
                                style={styles.barRow}
                                onPress={() => {
                                    if (selectedStat === 'Players') handleAreaSelect(item.name);
                                    if (selectedStat === 'Coaches') handleCoachSelect(item.id, item.name);
                                }}
                            >
                                <View style={styles.barLabelContainer}>
                                    <View style={styles.flexItem}>
                                        <Text style={styles.barLabel}>{item.name}</Text>
                                        {item.newPct !== undefined && <Text style={styles.newLabel}>{item.newPct}% New Joiners</Text>}
                                    </View>
                                    <Text style={styles.barValue}>{item.value} {item.label}</Text>
                                    {(selectedStat === 'Players' || selectedStat === 'Coaches') && <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />}
                                </View>
                                <View style={styles.barTrack}>
                                    <View style={[styles.barFill, { width: `${(item.value / (statDrillDownData[0].value || 1)) * 100}%`, backgroundColor: index === 0 ? (selectedStat === 'Coaches' ? '#8B5CF6' : '#6366F1') : '#CBD5E1' }]} />
                                </View>
                            </TouchableOpacity>
                        ))}
                        
                        {/* Device Detail View */}
                        {selectedStat === 'Devices' && (
                            <View style={styles.deviceDetailContainer}>
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
                                {ticketDeviceStats.versions.map((ver) => (
                                    <View key={ver.name} style={[styles.detailBarRow, { marginBottom: 12 }]}>
                                        <View style={styles.barLabelContainer}>
                                            <Text style={styles.barLabel}>Version {ver.name}</Text>
                                            <Text style={styles.barValue}>{ver.count} Issues</Text>
                                        </View>
                                        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${ver.percent}%`, backgroundColor: '#F59E0B' }]} /></View>
                                    </View>
                                ))}

                                <Text style={[styles.subChartTitle, { marginTop: 20 }]}>Tickets by Platform</Text>
                                <View style={styles.rowBetween}>
                                    <View style={styles.platformIconBox}>
                                        <Ionicons name="logo-android" size={18} color="#10B981" />
                                        <Text style={styles.platformIconText}>{ticketDeviceStats.platforms.android} Android</Text>
                                    </View>
                                    <View style={styles.platformIconBox}>
                                        <Ionicons name="logo-apple" size={18} color="#0F172A" />
                                        <Text style={styles.platformIconText}>{ticketDeviceStats.platforms.ios} iPhone</Text>
                                    </View>
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
                {growthStats.map((item, index) => (
                    <View key={index} style={styles.growthColumn}>
                        <View style={styles.pctContainer}>{item.pct > 0 && <Text style={styles.pctText}>+{item.pct}%</Text>}</View>
                        <View style={[styles.growthBar, { height: item.val }]} /><Text style={styles.growthLabel}>{item.p}</Text>
                    </View>
                ))}
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
                        const userBaseUrl = `https://acetrack-suggested.onrender.com/api/diagnostics?userId=${p.id}`;
                        
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
  welcomeText: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
  subText: { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...designSystem.shadows?.sm },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 },
  statBox: { backgroundColor: '#fff', width: (screenWidth - 40 - 10) / 2 - 5, padding: 14, borderRadius: 20, ...designSystem.shadows?.sm },
  iconCircle: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  statTitle: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 9, color: '#10B981', fontWeight: '700', marginLeft: 2 },
  chartCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 20, ...designSystem.shadows?.sm },
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
  barTrack: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  drillInfoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 12, borderRadius: 14, marginBottom: 20, width: '100%' },
  drillInfoText: { fontSize: 11, color: '#475569', marginLeft: 8, fontWeight: '700', flex: 1, lineHeight: 15 },
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
  growthContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 110, marginTop: 4 },
  growthColumn: { alignItems: 'center', width: (screenWidth - 80) / 6 },
  growthBar: { width: 14, backgroundColor: '#6366F1', borderRadius: 6, opacity: 0.8 },
  growthLabel: { fontSize: 10, color: '#94A3B8', marginTop: 8, fontWeight: '700' },
  growthBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  growthBadgeText: { fontSize: 11, fontWeight: '700', color: '#6366F1', marginLeft: 4 },
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
  emptyStateText: { fontSize: 14, color: '#94A3B8', marginTop: 16, fontWeight: '600' },
});

export default InsightsScreen;
