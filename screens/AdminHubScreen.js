import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Image, TextInput, Modal, Alert, Linking, Platform, Share,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import PlayerDashboardView from '../components/PlayerDashboardView';
import AdminAuditLogsPanel from '../components/AdminAuditLogsPanel';
import AdminRecordingsDashboard from '../components/AdminRecordingsDashboard';
import { AdminGrievancesPanel } from '../components/AdminGrievancesPanel';
import ParticipantsModal from '../components/ParticipantsModal';
import config from '../config';
import logger from '../utils/logger';

const AdminHubScreen = ({ 
  players, tournaments, matchVideos, supportTickets, auditLogs = [],
  onApproveCoach, onAssignCoach, onRemoveCoach, onUpdateVideoStatus, 
  onBulkUpdateVideoStatus, onForceRefundVideo, onApproveDeleteVideo, 
  onRejectDeleteVideo, onPermanentDeleteVideo, onReplyTicket, 
  onUpdateTicketStatus, onManualSync, seenAdminActionIds = new Set(),
  setSeenAdminActionIds, visitedAdminSubTabs = new Set(), setVisitedAdminSubTabs,
  isUsingCloud
}) => {
  const targetCloudUrl = 'https://acetrack-api-q39m.onrender.com';
  const activeApiUrl = isUsingCloud ? targetCloudUrl : config.API_BASE_URL;

  const [subTab, setSubTab] = useState('individuals');
  const [search, setSearch] = useState('');
  const [coachSubTab, setCoachSubTab] = useState('pending');
  const [rejectType, setRejectType] = useState(null); // 'rejected' | 'addendum'
  const [rejectingCoachId, setRejectingCoachId] = useState(null);
  const [rejectComment, setRejectComment] = useState('');
  const [selectedAcademy, setSelectedAcademy] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [viewingPlayersFor, setViewingPlayersFor] = useState(null);
  const [viewingAssignmentFor, setViewingAssignmentFor] = useState(null);
  const [viewingBreakdownFor, setViewingBreakdownFor] = useState(null);
  
  // Diagnostics Dashboard States
  const [diagUserSearch, setDiagUserSearch] = useState('');
  const handleDiagSearchChange = (txt) => {
    setDiagUserSearch(txt);
    if (selectedDiagUser) {
      setSelectedDiagUser(null);
      setUserDiagFiles([]);
      setDiagContent(null);
    }
  };
  const [selectedDiagUser, setSelectedDiagUser] = useState(null);
  const [userDiagFiles, setUserDiagFiles] = useState([]);
  const [selectedDiagFile, setSelectedDiagFile] = useState(null);
  const [diagContent, setDiagContent] = useState(null);
  const [isFetchingDiags, setIsFetchingDiags] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadDiagnostic = async () => {
    if (!diagContent || isDownloading) return;
    setIsDownloading(true);
    try {
      const safeName = (diagContent.username || 'User').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `Report_${safeName}_${Date.now()}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const content = JSON.stringify(diagContent, null, 2);
      
      // 1. Write to local cache
      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      
      // 2. Share the file URI
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Download Diagnostic Report',
          UTI: 'public.json'
        });
      } else {
        // Fallback to legacy Share if expo-sharing is unavailable (rare)
        await Share.share({
          title: fileName,
          message: content,
        });
      }
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Error", "Failed to prepare the report for download.");
    } finally {
      setIsDownloading(false);
    }
  };

  const filterData = (data, field = 'name') => {
    if (!search) return data;
    return data.filter(item => 
      (item[field] || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.id || '').toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredIndividuals = filterData(players.filter(p => !p.role || p.role === 'user'));
  const filteredAcademies = filterData(players.filter(p => p.role === 'academy'));
  const filteredCoaches = filterData(players.filter(p => p.role === 'coach'));
  const filteredTournaments = filterData(tournaments, 'title');

  const getAcademyStats = (academyId) => {
    const academyTs = tournaments.filter(t => t.creatorId === academyId);
    const hostedCount = academyTs.length;
    const liveCount = academyTs.filter(t => t.status !== 'completed').length;
    const cancellations = academyTs.filter(t => t.status === 'cancelled').length;
    
    // Simple tier logic
    let tier = 'Bronze';
    if (hostedCount > 10) tier = 'Gold';
    else if (hostedCount > 5) tier = 'Silver';

    const sportsBreakdown = {};
    academyTs.forEach(t => {
      sportsBreakdown[t.sport] = (sportsBreakdown[t.sport] || 0) + 1;
    });

    return { hostedCount, liveCount, cancellations, tier, sportsBreakdown };
  };

  const renderCoachList = () => {
    const list = filteredCoaches.filter(c => {
      const status = c.coachStatus || 'pending';
      if (coachSubTab === 'rejected_addendum') return status === 'rejected' || status === 'addendum';
      return status === coachSubTab;
    });

    if (list.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No coaches found</Text>
        </View>
      );
    }

    return list.map(c => {
      const isSelected = selectedCoachId === c.id;
      return (
        <TouchableOpacity 
          key={c.id} 
          activeOpacity={0.9}
          onPress={() => setSelectedCoachId(isSelected ? null : c.id)}
          style={[styles.adminCard, isSelected && styles.cardActive]}
        >
          <View style={styles.cardHeader}>
            <Image 
              source={{ uri: c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random` }} 
              style={styles.avatar} 
            />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <Text style={styles.cardSubtitle}>{c.phone}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: c.coachStatus === 'approved' ? '#DCFCE7' : c.coachStatus === 'revoked' || c.coachStatus === 'rejected' ? '#FEE2E2' : c.coachStatus === 'addendum' ? '#FEF9C3' : '#FFEDD5' }]}>
              <Text style={[styles.statusText, { color: c.coachStatus === 'approved' ? '#15803D' : c.coachStatus === 'revoked' || c.coachStatus === 'rejected' ? '#B91C1C' : c.coachStatus === 'addendum' ? '#A16207' : '#C2410C' }]}>
                {c.coachStatus || 'Pending'}
              </Text>
            </View>
          </View>

          {isSelected && (
            <View style={[styles.infoBlock, { backgroundColor: '#F0F9FF', borderLeftWidth: 4, borderLeftColor: '#0EA5E9' }]}>
              <Text style={styles.infoLabel}>Account Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>Username</Text>
                <Text style={styles.detailValue}>{c.id}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailTitle}>Email</Text>
                <Text style={styles.detailValue}>{c.email}</Text>
              </View>
            </View>
          )}

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Certified Sports: <Text style={styles.infoValue}>{c.certifiedSports?.join(', ')}</Text></Text>
            <TouchableOpacity 
              onPress={() => c.govIdUrl ? Linking.openURL(c.govIdUrl) : Alert.alert("Not Found", "Government ID document has not been uploaded.")} 
              style={[styles.linkBtn, !c.govIdUrl && { opacity: 0.5 }]}
            >
              <Ionicons name="documents" size={12} color={c.govIdUrl ? "#3B82F6" : "#94A3B8"} />
              <Text style={[styles.linkText, !c.govIdUrl && { color: "#94A3B8" }]}>Gov ID: {c.govIdUrl ? "Download Document" : "Not Provided"}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => c.certificationUrl ? Linking.openURL(c.certificationUrl) : Alert.alert("Not Found", "Certification document has not been uploaded.")} 
              style={[styles.linkBtn, !c.certificationUrl && { opacity: 0.5 }]}
            >
              <Ionicons name="ribbon" size={12} color={c.certificationUrl ? "#3B82F6" : "#94A3B8"} />
              <Text style={[styles.linkText, !c.certificationUrl && { color: "#94A3B8" }]}>Cert: {c.certificationUrl ? "Download Document" : "Not Provided"}</Text>
            </TouchableOpacity>
            {(c.coachStatus === 'rejected' || c.coachStatus === 'addendum') && c.coachRejectReason && (
              <View style={styles.reasonLine}>
                <Text style={styles.infoLabel}>Reason:</Text>
                <Text style={styles.reasonText}>{c.coachRejectReason}</Text>
              </View>
            )}
          </View>

          {coachSubTab === 'pending' && (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => onApproveCoach(c.id, 'approved')} style={[styles.actionBtn, styles.approveBtn]}>
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRejectType('rejected'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.rejectBtn]}>
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRejectType('addendum'); setRejectingCoachId(c.id); }} style={[styles.actionBtn, styles.addendumBtn]}>
                <Text style={[styles.actionBtnText, { color: '#CA8A04' }]}>Addendum</Text>
              </TouchableOpacity>
            </View>
          )}
          {coachSubTab === 'approved' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'revoked')} style={styles.fullActionBtn}>
              <Text style={styles.fullActionBtnText}>Revoke Access</Text>
            </TouchableOpacity>
          )}
          {coachSubTab === 'revoked' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'approved')} style={[styles.fullActionBtn, { backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.fullActionBtnText, { color: '#16A34A' }]}>Restore Access</Text>
            </TouchableOpacity>
          )}
          {coachSubTab === 'rejected_addendum' && c.coachStatus === 'addendum' && (
            <TouchableOpacity onPress={() => onApproveCoach(c.id, 'pending')} style={[styles.fullActionBtn, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.fullActionBtnText, { color: '#2563EB' }]}>Simulate User Response</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Hub</Text>
        <Text style={styles.subtitle}>System Overview & Management</Text>
      </View>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'individuals', label: 'Individuals' },
            { id: 'academies', label: 'Academies' },
            { id: 'coaches', label: 'Coaches', count: players.filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !seenAdminActionIds.has(p.id)).length },
            { id: 'security', label: 'Security' },
            { id: 'tournaments', label: 'Tournaments' },
            { id: 'coach_assignments', label: 'Coach Assignments', count: tournaments.filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && !seenAdminActionIds.has(t.id)).length },
            { id: 'recordings', label: 'Recordings', count: matchVideos.filter(v => v.adminStatus === 'Deletion Requested' && !seenAdminActionIds.has(v.id)).length },
            { id: 'grievances', label: 'Grievances', count: supportTickets.filter(t => t.status === 'Open').length },
            { id: 'audit', label: 'Audit Logs' },
            { id: 'diagnostics', label: 'Diagnostics' }
          ].map(tab => {
            const isVisited = visitedAdminSubTabs.has(tab.id);
            const showBadge = tab.count > 0 && (tab.id === 'grievances' ? true : !isVisited);

            return (
              <TouchableOpacity 
                key={tab.id} 
                onPress={() => { 
                  setSubTab(tab.id); 
                  setSearch(''); 
                  
                  // 1. Mark the tab as visited
                  if (tab.id !== 'grievances' && setVisitedAdminSubTabs) {
                    setVisitedAdminSubTabs(prev => new Set(prev).add(tab.id));
                  }

                  // 2. Mark the CURRENT items as seen so badges stay gone permanently (via storage)
                  if (setSeenAdminActionIds) {
                    const newSeenIds = new Set(seenAdminActionIds);
                    let added = false;
                    
                    if (tab.id === 'coaches') {
                      players.filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus)).forEach(p => {
                        if (!newSeenIds.has(p.id)) { newSeenIds.add(p.id); added = true; }
                      });
                    } else if (tab.id === 'recordings') {
                      matchVideos.filter(v => v.adminStatus === 'Deletion Requested').forEach(v => {
                        if (!newSeenIds.has(v.id)) { newSeenIds.add(v.id); added = true; }
                      });
                    } else if (tab.id === 'coach_assignments') {
                      tournaments.filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded).forEach(t => {
                        if (!newSeenIds.has(t.id)) { newSeenIds.add(t.id); added = true; }
                      });
                    } else if (tab.id === 'grievances') {
                      supportTickets.filter(t => t.status === 'Open' || t.status === 'Awaiting Response').forEach(t => {
                        if (!newSeenIds.has(t.id)) { newSeenIds.add(t.id); added = true; }
                      });
                    }
                    
                    if (added) setSeenAdminActionIds(newSeenIds);
                  }
                }}
                style={[styles.tab, subTab === tab.id && styles.tabActive]}
              >
                <Text style={[styles.tabText, subTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput 
          placeholder={`Search ${subTab}...`}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {subTab === 'individuals' && (
          <PlayerDashboardView players={filteredIndividuals} tournaments={tournaments} title="Individuals" />
        )}

        {subTab === 'coaches' && (
          <View>
            <View style={styles.coachSubTabs}>
              {['pending', 'approved', 'revoked', 'rejected_addendum'].map(t => (
                <TouchableOpacity 
                  key={t} 
                  onPress={() => setCoachSubTab(t)}
                  style={[styles.coachSubTab, coachSubTab === t && styles.coachSubTabActive]}
                >
                  <Text style={[styles.coachSubTabText, coachSubTab === t && styles.coachSubTabTextActive]}>
                    {t === 'rejected_addendum' ? 'Rejected/Addendum' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderCoachList()}
          </View>
        )}

        {subTab === 'academies' && filteredAcademies.map(a => {
          const stats = getAcademyStats(a.id);
          const isSelected = selectedAcademy === a.id;
          return (
            <TouchableOpacity 
              key={a.id} 
              activeOpacity={0.9}
              onPress={() => setSelectedAcademy(isSelected ? null : a.id)}
              style={[styles.adminCard, isSelected && styles.cardActive]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, styles.initialsBox]}>
                  <Text style={styles.initialsText}>{a.name[0]}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{a.name}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: stats.tier === 'Gold' ? '#FEF9C3' : stats.tier === 'Silver' ? '#F1F5F9' : '#FFEDD5' }]}>
                    <Text style={[styles.tierText, { color: stats.tier === 'Gold' ? '#A16207' : stats.tier === 'Silver' ? '#475569' : '#C2410C' }]}>
                      {stats.tier} Tier
                    </Text>
                  </View>
                </View>
                <View style={styles.statsInline}>
                  <View style={styles.inlineStat}>
                    <Text style={styles.inlineValue}>{stats.liveCount}</Text>
                    <Text style={styles.inlineLabel}>Live</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); setViewingBreakdownFor({ academy: a, stats }); }}
                    style={styles.inlineStatBtn}
                  >
                    <Text style={styles.inlineValue}>{stats.hostedCount}</Text>
                    <Text style={styles.inlineLabel}>Total</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isSelected && (
                <View style={styles.expandedContent}>
                  <View style={styles.detailsBlock}>
                    <Text style={styles.blockLabel}>Registration Details</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Username</Text>
                      <Text style={styles.detailValue}>{a.id}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Email</Text>
                      <Text style={styles.detailValue}>{a.email}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Phone</Text>
                      <Text style={styles.detailValue}>{a.phone}</Text>
                    </View>
                  </View>

                  <View style={styles.gridStats}>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Sports Coverage</Text>
                      <Text style={styles.gridStatValue}>{Object.keys(stats.sportsBreakdown).join(', ') || 'None'}</Text>
                    </View>
                    <View style={styles.gridStatBox}>
                      <Text style={styles.gridStatLabel}>Reliability</Text>
                      <Text style={[styles.gridStatValue, { color: '#EF4444' }]}>{stats.cancellations} Cancellations</Text>
                    </View>
                  </View>

                  <View style={styles.tournamentList}>
                    <Text style={styles.blockLabel}>Hosted Tournaments</Text>
                    {tournaments.filter(t => t.creatorId === a.id).map(t => (
                      <TouchableOpacity 
                        key={t.id} 
                        onPress={() => setViewingPlayersFor(t)}
                        style={styles.hostedTItem}
                      >
                        <Text style={styles.hostedTTitle}>{t.title}</Text>
                        <Text style={styles.hostedTSport}>{t.sport}</Text>
                      </TouchableOpacity>
                    ))}
                    {stats.hostedCount === 0 && <Text style={styles.emptyNote}>No events hosted</Text>}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {subTab === 'tournaments' && filteredTournaments.map(t => (
          <TouchableOpacity 
            key={t.id} 
            onPress={() => setViewingPlayersFor(t)}
            style={styles.adminCard}
          >
            <View style={styles.cardHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.cardSubtitle}>{t.sport} • {t.date}</Text>
              </View>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingValue}>{t.registeredPlayerIds.length}/{t.maxPlayers}</Text>
                <Text style={styles.ratingLabel}>Slots</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {subTab === 'coach_assignments' && tournaments.filter(t => 
          (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && 
          !t.assignedCoachId && 
          t.status !== 'completed' && 
          !t.tournamentConcluded
        ).map(t => (
          <View key={t.id} style={styles.adminCard}>
            <View style={styles.cardHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.cardSubtitle}>{t.sport} • {t.date}</Text>
              </View>
              <View style={[styles.statusBadge, styles.wideBadge, { backgroundColor: t.coachStatus?.includes('Assigned') ? '#DCFCE7' : t.coachStatus?.includes('Confirmed') ? '#FEF9C3' : '#F1F5F9' }]}>
                <Text style={[styles.statusText, { color: t.coachStatus?.includes('Assigned') ? '#15803D' : t.coachStatus?.includes('Confirmed') ? '#A16207' : '#64748B' }]}>{t.coachStatus}</Text>
              </View>
            </View>

            {t.coachStatus === 'Pending Coach Registration' && t.invitedCoachDetails && (
              <View style={[styles.infoBlock, { backgroundColor: '#FFF7ED' }]}>
                <Text style={styles.infoLabel}>Invited Coach Details</Text>
                <Text style={styles.coachDetailName}>{t.invitedCoachDetails.name}</Text>
                <Text style={styles.coachDetailText}>{t.invitedCoachDetails.email}</Text>
              </View>
            )}

            {t.coachStatus === 'Coach Confirmed - Awaiting Assignment' && t.confirmedCoachId && (
              <View style={[styles.infoBlock, { backgroundColor: '#FEF9C3' }]}>
                <Text style={styles.infoLabel}>Confirmed Coach</Text>
                <View style={styles.assignRow}>
                  <Text style={styles.coachDetailName}>{players.find(p => p.id === t.confirmedCoachId)?.name}</Text>
                  <TouchableOpacity onPress={() => onAssignCoach(t.id, t.confirmedCoachId)} style={styles.miniAssignBtn}>
                    <Text style={styles.miniAssignText}>Assign</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {t.coachAssignmentType === 'platform' && !t.assignedCoachId && t.assignedCoachIds?.length > 0 && (
              <View style={[styles.infoBlock, { backgroundColor: '#EFF6FF' }]}>
                <Text style={styles.infoLabel}>Opted-in Coaches</Text>
                {t.assignedCoachIds.map(cid => (
                  <View key={cid} style={styles.optedInRow}>
                    <Text style={styles.coachDetailName}>{players.find(p => p.id === cid)?.name}</Text>
                    <TouchableOpacity onPress={() => onAssignCoach(t.id, cid)} style={styles.miniAssignBtnBlue}>
                      <Text style={styles.miniAssignText}>Assign</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {(t.coachStatus === 'Coach Assigned' || t.coachStatus === 'Coach Assigned - Academy') && t.assignedCoachId && (
              <View style={[styles.infoBlock, { backgroundColor: '#F0FDF4' }]}>
                <Text style={styles.infoLabel}>Assigned Coach</Text>
                <View style={styles.assignRow}>
                  <Text style={styles.coachDetailName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                  <TouchableOpacity onPress={() => onRemoveCoach(t.id)} style={styles.miniRemoveBtn}>
                    <Text style={styles.miniRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity onPress={() => setViewingAssignmentFor(t)} style={styles.detailsBtn}>
              <Text style={styles.detailsBtnText}>View Details</Text>
            </TouchableOpacity>
          </View>
        ))}

        {subTab === 'security' && (
          <View>
            <Text style={styles.sectionTitle}>Failed OTP Attempts</Text>
            {tournaments.flatMap(t => 
              (t.failedOtpAttempts || []).map((attempt, idx) => {
                const coach = players.find(p => p.id === attempt.coachId);
                return (
                  <View key={`${t.id}-${idx}`} style={[styles.adminCard, { borderColor: '#FEE2E2' }]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.flex}>
                        <Text style={[styles.cardTitle, { color: '#EF4444' }]}>Failed Access Attempt</Text>
                        <Text style={styles.cardSubtitle}>{new Date(attempt.timestamp).toLocaleString()}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
                        <Text style={[styles.statusText, { color: '#EF4444' }]}>Alert</Text>
                      </View>
                    </View>
                    <View style={styles.alertContent}>
                        <Text style={styles.alertLabel}>Tournament: <Text style={styles.alertValue}>{t.title}</Text></Text>
                        <Text style={styles.alertLabel}>Coach: <Text style={styles.alertValue}>{coach ? coach.name : attempt.coachId}</Text></Text>
                        <Text style={styles.alertLabel}>OTP Used: <Text style={styles.alertOtp}>{attempt.otp}</Text></Text>
                    </View>
                  </View>
                );
              })
            )}
            {tournaments.every(t => !t.failedOtpAttempts?.length) && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No failed attempts logged</Text>
              </View>
            )}
          </View>
        )}

        {subTab === 'recordings' && (
          <AdminRecordingsDashboard 
            matchVideos={matchVideos}
            tournaments={tournaments}
            players={players}
            onUpdateVideoStatus={onUpdateVideoStatus}
            onBulkUpdateStatus={onBulkUpdateVideoStatus}
            onForceRefund={onForceRefundVideo}
            onApproveDeleteVideo={onApproveDeleteVideo}
            onRejectDeleteVideo={onRejectDeleteVideo}
            onPermanentDeleteVideo={onPermanentDeleteVideo}
          />
        )}

        {subTab === 'grievances' && (
          <AdminGrievancesPanel 
            tickets={supportTickets}
            players={players}
            onReply={onReplyTicket}
            onUpdateStatus={onUpdateTicketStatus}
          />
        )}

        {subTab === 'audit' && (
          <AdminAuditLogsPanel auditLogs={auditLogs} players={players} search={search} />
        )}

        {subTab === 'diagnostics' && (
          <View style={styles.diagnosticsContainer}>
            <View style={styles.diagHeaderRow}>
               <Text style={[styles.sectionTitle, { flex: 1, marginRight: 12 }]}>System Diagnostics Management</Text>
               <TouchableOpacity 
                 onPress={() => {
                   logger.logAction('ADMIN_MANUAL_SYNC_TRIGGER');
                   onManualSync?.();
                 }}
                 style={styles.diagSyncBtn}
               >
                 <Ionicons name="refresh-circle" size={16} color="#FFFFFF" />
                 <Text style={styles.diagSyncBtnText}>Force Sync Cloud</Text>
               </TouchableOpacity>
            </View>
            
            <View style={styles.diagSearchBox}>
              <Ionicons name="people-outline" size={16} color="#64748B" />
              <TextInput 
                 placeholder="Search user (shashank, saumya, etc.)..."
                 value={diagUserSearch}
                 onChangeText={handleDiagSearchChange}
                 style={styles.diagSearchInput}
              />
            </View>

            <View style={styles.userListScroll}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {players
                  .filter(p => {
                    const name = (p.name || '').toLowerCase();
                    const id = String(p.id || '').toLowerCase();
                    const email = (p.email || '').toLowerCase();
                    const s = diagUserSearch.toLowerCase().trim();
                    if (s) return name.includes(s) || id.includes(s) || email.includes(s);
                    const mocks = ['shashank', 'pranshu', 'academy', 'coach'];
                    return mocks.some(m => name.includes(m) || id.includes(m) || email.includes(m)) || 
                           name.includes('riya') || name.includes('saumya') || email.includes('riya') || email.includes('saumya');
                  })
                  .map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      onPress={async () => {
                        setSelectedDiagUser(p);
                        setUserDiagFiles([]); // Clear immediately to avoid stale data UI
                        setSelectedDiagFile(null);
                        setDiagContent(null);
                        setIsFetchingDiags(true);
                        const url = `${activeApiUrl}/api/diagnostics`;
                        try {
                          const res = await fetch(url, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
                          if (res.ok) {
                            const data = await res.json();
                            const pName = (p.name || '').toLowerCase();
                            const pId = String(p.id || '').toLowerCase();
                            const pEmail = (p.email || '').toLowerCase();
                            const firstName = pName.split(' ')[0];

                            const safeName = pName.replace(/[^a-z0-9]/gi, '_');
                            const safeId = pId.replace(/[^a-z0-9]/gi, '_');
                            const safeEmail = pEmail.replace(/[^a-z0-9]/gi, '_');
                            
                            // Check for files matching name, id, email or even parts
                            const fs = data.files.filter(f => {
                              const low = f.toLowerCase();
                              return low.startsWith(safeName + '_') || 
                                     low.startsWith(safeId + '_') ||
                                     low.startsWith(safeEmail + '_') ||
                                     low.includes(`_${safeName}_`) ||
                                     (firstName.length > 3 && low.includes(firstName));
                            });
                            setUserDiagFiles(fs.reverse());
                            logger.logAction('DIAGNOSTICS_FETCH_SUCCESS', { user: p.name, fileCount: fs.length });
                          }
                        } catch (e) {
                          setUserDiagFiles([]);
                          logger.logAction('DIAGNOSTICS_FETCH_ERROR', { error: e.message });
                          if (String(p.id).length >= 20) Alert.alert("Error", "Failed to fetch files.");
                        } finally {
                          setIsFetchingDiags(false);
                        }
                      }}
                      style={[styles.miniUserCard, selectedDiagUser?.id === p.id && styles.miniUserCardActive]}
                    >
                      <Image 
                        source={{ uri: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random` }} 
                        style={styles.miniAvatar} 
                      />
                      <Text style={[styles.miniUserName, selectedDiagUser?.id === p.id && styles.miniUserNameActive]}>
                        {p.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {players
                  .filter(p => {
                    const name = (p.name || '').toLowerCase();
                    const id = String(p.id || '').toLowerCase();
                    const email = (p.email || '').toLowerCase();
                    const s = diagUserSearch.toLowerCase().trim();
                    if (s) return name.includes(s) || id.includes(s) || email.includes(s);
                    const mocks = ['shashank', 'pranshu', 'academy', 'coach'];
                    return mocks.some(m => name.includes(m) || id.includes(m) || email.includes(m)) || 
                           name.includes('riya') || name.includes('saumya') || email.includes('riya') || email.includes('saumya');
                  }).length === 0 && (
                    <View style={{ padding: 20 }}>
                      <Text style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                        No user matching "{diagUserSearch}" found.
                      </Text>
                      <Text style={{ color: '#64748B', fontSize: 10, marginTop: 4 }}>
                        Players in list: {players.length}. (Check "Refresh Cloud Data" if users are missing)
                      </Text>
                    </View>
                  )}
              </ScrollView>
            </View>

            {selectedDiagUser && (
              <View style={styles.diagFileSection}>
                <Text style={styles.diagLabel}>Reports for {selectedDiagUser.name}:</Text>
                {isFetchingDiags ? (
                  <Text style={styles.diagLoading}>Fetching files...</Text>
                ) : userDiagFiles.length === 0 ? (
                  <Text style={styles.diagEmpty}>No reports found for this user.</Text>
                ) : (
                  <View style={styles.diagFileGrid}>
                    {userDiagFiles.map(file => (
                      <TouchableOpacity 
                        key={file} 
                        onPress={async () => {
                          setSelectedDiagFile(file);
                          setIsFetchingDiags(true);
                          try {
                            const res = await fetch(`${activeApiUrl}/api/diagnostics/${file}`, {
                              headers: { 'x-ace-api-key': config.ACE_API_KEY }
                            });
                            if (res.ok) setDiagContent(await res.json());
                          } catch (e) {
                            Alert.alert("Error", "Failed to fetch content.");
                          } finally {
                            setIsFetchingDiags(false);
                          }
                        }}
                        style={[styles.diagFileItem, selectedDiagFile === file && styles.diagFileItemActive]}
                      >
                        <Ionicons name="document-text" size={20} color={selectedDiagFile === file ? "#FFFFFF" : "#3B82F6"} />
                        <Text style={[styles.diagFileName, selectedDiagFile === file && styles.diagFileNameActive]}>
                          {file.split('_').slice(1).join('_').replace('.json', '')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {diagContent && (
              <View style={styles.diagViewPanel}>
                <View style={styles.diagViewHeader}>
                  <Text style={styles.diagViewTitle}>Report Details</Text>
                  <TouchableOpacity 
                    onPress={handleDownloadDiagnostic}
                    disabled={isDownloading}
                    style={[styles.diagDownloadBtn, { backgroundColor: isDownloading ? '#94A3B8' : '#16A34A' }]}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.diagDownloadText}>
                      {isDownloading ? 'Downloading...' : 'Download'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.diagScrollArea}>
                  <View style={styles.diagMetaRow}>
                    <Text style={styles.diagMetaLabel}>User: {diagContent.username}</Text>
                  </View>
                  <View style={styles.diagMetaRow}>
                    <Text style={styles.diagMetaLabel}>Date: {diagContent.uploadedAt}</Text>
                  </View>
                  <View style={styles.diagLogBox}>
                    {(diagContent.logs || []).map((log, idx) => (
                      <View key={idx} style={styles.diagLogLine}>
                        <Text style={styles.diagLogTime}>[{log.timestamp?.split(' ')[1] || '00:00'}]</Text>
                        <Text style={[styles.diagLogLevel, { color: log.level === 'error' ? '#EF4444' : log.level === 'warn' ? '#EAB308' : '#3B82F6' }]}>{log.level?.toUpperCase()}</Text>
                        <Text style={styles.diagLogMsg}>{log.message}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rejection Modal */}
      <Modal visible={!!rejectingCoachId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{rejectType === 'addendum' ? 'Request Addendum' : 'Reject Coach'}</Text>
                <Text style={styles.modalSubtitle}>
                  {rejectType === 'addendum' 
                    ? 'Specify details or documents required.' 
                    : 'Provide rejection reason.'}
                </Text>
                <TextInput 
                    multiline
                    numberOfLines={4}
                    value={rejectComment}
                    onChangeText={setRejectComment}
                    placeholder="Enter reason..."
                    style={styles.modalInput}
                />
                <View style={styles.modalActions}>
                    <TouchableOpacity 
                        onPress={() => { setRejectingCoachId(null); setRejectComment(''); }}
                        style={styles.modalCancel}
                    >
                        <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => {
                          onApproveCoach(rejectingCoachId, rejectType, rejectComment);
                          setRejectingCoachId(null);
                          setRejectComment('');
                        }}
                        style={[styles.modalSubmit, { backgroundColor: rejectType === 'addendum' ? '#EAB308' : '#EF4444' }]}
                    >
                        <Text style={styles.modalSubmitText}>Submit</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* Breakdown Modal */}
      <Modal visible={!!viewingBreakdownFor} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.sheetContent}>
                <View style={styles.sheetHeader}>
                    <View>
                        <Text style={styles.sheetTitle}>Sports Insights</Text>
                        <Text style={styles.sheetSubtitle}>{viewingBreakdownFor?.academy.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setViewingBreakdownFor(null)}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>
                <ScrollView style={styles.sheetScroll}>
                    {viewingBreakdownFor && Object.entries(viewingBreakdownFor.stats.sportsBreakdown).map(([sport, count]) => (
                        <View key={sport} style={styles.insightRow}>
                            <Text style={styles.insightLabel}>{sport}</Text>
                            <Text style={styles.insightCount}>{count}</Text>
                        </View>
                    ))}
                    {(!viewingBreakdownFor || Object.keys(viewingBreakdownFor.stats.sportsBreakdown).length === 0) && (
                        <Text style={styles.emptyNote}>No tournament data</Text>
                    )}
                </ScrollView>
                <View style={styles.sheetFooter}>
                    <Text style={styles.footerLabel}>Total Hosted</Text>
                    <Text style={styles.footerValue}>{viewingBreakdownFor?.stats.hostedCount}</Text>
                </View>
            </View>
        </View>
      </Modal>

      <ParticipantsModal 
        tournament={viewingPlayersFor} 
        players={players} 
        onClose={() => setViewingPlayersFor(null)} 
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  tabContainer: {
    paddingBottom: 4,
  },
  tabScroll: {
    paddingHorizontal: 24,
    gap: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    gap: 8,
  },
  tabActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    margin: 24,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    marginLeft: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  coachSubTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  coachSubTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  coachSubTabActive: {
    backgroundColor: '#FFFFFF',
  },
  coachSubTabText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  coachSubTabTextActive: {
    color: '#0F172A',
  },
  adminCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardActive: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  initialsBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#94A3B8',
  },
  flex: { flex: 1 },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  wideBadge: {
    minWidth: 80,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  infoBlock: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: '#64748B',
    fontWeight: '500',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 11,
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  reasonLine: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  reasonText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: '#22C55E' },
  rejectBtn: { backgroundColor: '#FEF2F2' },
  addendumBtn: { backgroundColor: '#FEF9C3' },
  actionBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  fullActionBtn: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  fullActionBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  tierText: {
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statsInline: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineStat: {
    alignItems: 'center',
  },
  inlineStatBtn: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  inlineValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  inlineLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  expandedContent: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 24,
  },
  detailsBlock: {
    backgroundColor: '#F8FAFC',
    padding: 20,
    borderRadius: 24,
    gap: 12,
  },
  blockLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  detailTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
  },
  gridStats: {
    flexDirection: 'row',
    gap: 12,
  },
  gridStatBox: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 20,
    borderRadius: 24,
  },
  gridStatLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  gridStatValue: {
    fontSize: 10,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
  },
  tournamentList: {
    gap: 12,
  },
  hostedTItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
  },
  hostedTTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
  },
  hostedTSport: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  ratingBox: {
    alignItems: 'flex-end',
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  ratingLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  assignRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  coachDetailName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  coachDetailText: {
    fontSize: 12,
    color: '#475569',
  },
  miniAssignBtn: {
    backgroundColor: '#EAB308',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  miniAssignBtnBlue: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  miniAssignText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  miniRemoveBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  miniRemoveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  optedInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  detailsBtn: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    alignItems: 'center',
  },
  detailsBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  alertContent: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginTop: 12,
    gap: 4,
  },
  alertLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  alertValue: {
    color: '#64748B',
    fontWeight: '500',
    textTransform: 'none',
  },
  alertOtp: {
    color: '#EF4444',
    fontWeight: '900',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  emptyNote: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94A3B8',
    paddingVertical: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    padding: 32,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    height: 120,
    textAlignVertical: 'top',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontWeight: 'bold',
    color: '#64748B',
  },
  modalSubmit: {
    flex: 1.5,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    maxHeight: '70%',
    width: '100%',
    marginTop: 'auto',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 32,
    paddingBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  sheetSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  sheetScroll: {
    paddingHorizontal: 32,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  insightLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  insightCount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#EF4444',
  },
  sheetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 32,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  footerValue: {
    fontSize: 18,
    color: '#0F172A',
  },
  diagnosticsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  diagHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  diagSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  diagSyncBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  diagSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  diagSearchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  userListScroll: {
    marginBottom: 24,
  },
  miniUserCard: {
    alignItems: 'center',
    padding: 12,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    width: 80,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniUserCardActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  miniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  miniUserName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  miniUserNameActive: {
    color: '#FFFFFF',
  },
  diagFileSection: {
    marginTop: 8,
  },
  diagLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  diagLoading: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  diagEmpty: { fontSize: 12, color: '#94A3B8' },
  diagEmptyUserText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    padding: 12,
    textAlign: 'center',
    width: '100%',
  },
  diagFileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  diagFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 8,
    minWidth: '45%',
  },
  diagFileItemActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  diagFileName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  diagFileNameActive: {
    color: '#FFFFFF',
  },
  diagViewPanel: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  diagViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  diagViewTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  diagDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  diagDownloadText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  diagScrollArea: {
    maxHeight: 400,
    padding: 16,
  },
  diagMetaRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  diagMetaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  diagMetaValue: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '600',
  },
  diagLogBox: {
    marginTop: 16,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
  },
  diagLogLine: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 4,
  },
  diagLogTime: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#94A3B8',
  },
  diagLogLevel: {
    fontSize: 9,
    fontWeight: '900',
    width: 45,
  },
  diagLogMsg: {
    flex: 1,
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#E2E8F0',
  },
});

export default AdminHubScreen;
