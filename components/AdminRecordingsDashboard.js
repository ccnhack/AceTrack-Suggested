import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Modal, TextInput, Alert, Dimensions,
  SafeAreaView, FlatList, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import designSystem from '../theme/designSystem';
import { getSafeAvatar, getSafePreview } from '../utils/imageUtils';

const { width } = Dimensions.get('window');

const statusColors = {
  'Active': { bg: '#DCFCE7', text: '#166534' },
  'Locked': { bg: '#FEF9C3', text: '#854D0E' },
  'Deletion Requested': { bg: '#FFEDD5', text: '#9A3412' },
  'Under Review': { bg: '#DBEAFE', text: '#1E40AF' },
  'Removed': { bg: '#FEE2E2', text: '#991B1B' },
};

const AdminRecordingsDashboard = ({
  matchVideos,
  tournaments,
  players,
  onUpdateVideoStatus,
  onBulkUpdateStatus,
  onForceRefund,
  onApproveDeleteVideo,
  onRejectDeleteVideo,
  onPermanentDeleteVideo,
  onBulkPermanentDeleteVideos,
}) => {
  const [selectedAcademyId, setSelectedAcademyId] = useState(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSport, setFilterSport] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showTrashPopup, setShowTrashPopup] = useState(false);
  const [showDeletionPopup, setShowDeletionPopup] = useState(false);
  const [showAllVideosPopup, setShowAllVideosPopup] = useState(false);
  const [showTodayVideosPopup, setShowTodayVideosPopup] = useState(false);
  const [expandedPurchaserId, setExpandedPurchaserId] = useState(null);
  const [expandedRefundId, setExpandedRefundId] = useState(null);
  const [showTrashOnly, setShowTrashOnly] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);

  useEffect(() => {
    if (pendingDeletions === 0 && showDeletionPopup) {
      setShowDeletionPopup(false);
    }
  }, [pendingDeletions, showDeletionPopup]);

  const academies = useMemo(() => (players || []).filter(p => p && (p.role === 'academy' || p.id?.includes('academy'))), [players]);

  const activeVideos = useMemo(() => (matchVideos || []).filter(v => v && v.adminStatus !== 'Removed' && v.adminStatus !== 'Trash'), [matchVideos]);
  const trashVideos = useMemo(() => (matchVideos || []).filter(v => v && (v.adminStatus === 'Removed' || v.adminStatus === 'Trash')), [matchVideos]);

  const totalVideos = (activeVideos || []).length;
  const videosToday = (matchVideos || []).filter(v => {
    if (!v) return false;
    const d = v.uploadDate ? new Date(v.uploadDate) : new Date(v.date);
    return d.toDateString() === new Date().toDateString();
  }).length;
  const pendingDeletions = (matchVideos || []).filter(v => v && v.adminStatus === 'Deletion Requested').length;
  const trashVideosCount = (trashVideos || []).length;
  const totalRevenue = (activeVideos || []).reduce((sum, v) => sum + (v.revenue || 0), 0);

  const filteredVideos = useMemo(() => {
    let videos = showTrashOnly ? trashVideos : activeVideos;
    if (selectedAcademyId) {
      const hostedTournamentIds = (tournaments || []).filter(t => t.creatorId === selectedAcademyId).map(t => t.id);
      videos = videos.filter(v => hostedTournamentIds.includes(v.tournamentId));
    }
    if (selectedTournamentId) videos = videos.filter(v => v.tournamentId === selectedTournamentId);
    if (filterSport !== 'All') videos = videos.filter(v => v.sport === filterSport);
    if (!showTrashOnly && filterStatus !== 'All') {
      videos = videos.filter(v => (v.adminStatus || 'Active') === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      videos = videos.filter(v => 
        (v.matchId || '').toLowerCase().includes(q) || 
        (v.playerIds || []).some(pid => (players || []).find(p => p.id === pid)?.name.toLowerCase().includes(q))
      );
    }
    return videos;
  }, [activeVideos, trashVideos, showTrashOnly, selectedAcademyId, selectedTournamentId, filterSport, filterStatus, searchQuery, tournaments, players]);

  const toggleSelectVideo = (id) => {
    setSelectedVideoIds(prev => prev.includes(id) ? prev.filter(vid => vid !== id) : [...prev, id]);
  };

  const getPlayerNames = (pids) => (pids || []).map(id => (players || []).find(p => p.id === id)?.name || id).join(' vs ');
  const getTournamentName = (tid) => (tournaments || []).find(t => t.id === tid)?.title || tid;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Overview Cards */}
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.premiumOverview}>
        <Text style={styles.premiumLabel}>Video Infrastructure & Analytics</Text>
        <View style={styles.statsGrid}>
          <TouchableOpacity 
            onPress={() => {
              setSelectedAcademyId(null);
              setSelectedTournamentId(null);
              setFilterStatus('All');
              setShowTrashOnly(false);
            }} 
            style={[styles.glassStat, !showTrashOnly && styles.glassStatActive]}
          >
            <Ionicons name="videocam" size={20} color="#FFF" style={{ marginBottom: 8 }} />
            <Text style={styles.premiumStatValue}>{totalVideos}</Text>
            <Text style={styles.premiumStatLabel}>Total Videos</Text>
          </TouchableOpacity>
          <View style={styles.glassStat}>
            <Ionicons name="server-outline" size={20} color="#FFF" style={{ marginBottom: 8 }} />
            <Text style={styles.premiumStatValue}>{(totalVideos * 1.8).toFixed(1)} <Text style={styles.premiumUnit}>GB</Text></Text>
            <Text style={styles.premiumStatLabel}>Storage Used</Text>
          </View>
          <TouchableOpacity onPress={() => setShowTodayVideosPopup(true)} style={styles.glassStat}>
            <Ionicons name="today" size={20} color="#FFF" style={{ marginBottom: 8 }} />
            <Text style={styles.premiumStatValue}>{videosToday}</Text>
            <Text style={styles.premiumStatLabel}>Uploaded Today</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsGrid}>
          <TouchableOpacity 
            onPress={() => {
              if (pendingDeletions > 0) {
                setShowDeletionPopup(true);
              } else {
                Alert.alert("Admin Feedback", "No Review required. All deletion requests have been actioned.");
              }
            }} 
            style={[styles.glassStat, styles.glassStatWarning]}
          >
            <Text style={styles.premiumStatValue}>{pendingDeletions}</Text>
            <Text style={styles.premiumStatLabel}>Requested Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              setSelectedTrashIds([]);
              setShowTrashPopup(true);
            }} 
            style={[styles.glassStat, showTrashPopup && styles.glassStatActive]}
          >
            <Text style={styles.premiumStatValue}>{trashVideosCount}</Text>
            <Text style={styles.premiumStatLabel}>Trash Bin</Text>
          </TouchableOpacity>
          <View style={[styles.glassStat, styles.glassStatSuccess]}>
            <Text style={styles.premiumStatValue}>₹{(totalRevenue/1000).toFixed(1)}k</Text>
            <Text style={styles.premiumStatLabel}>Est. Revenue</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Search & Filter */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          placeholder="Search by player, tournament..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterToggle}>
        <Text style={styles.filterToggleText}>Filters {filterSport !== 'All' || filterStatus !== 'All' ? '(Active)' : ''}</Text>
        <Ionicons name={showFilters ? "chevron-up" : "chevron-down"} size={16} color="#64748B" />
      </TouchableOpacity>

      {showFilters && (
        <View style={styles.filterPanel}>
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Sport</Text>
              <View style={styles.chipRow}>
                {['All', 'Tennis', 'Badminton', 'Pickleball'].map(s => (
                  <TouchableOpacity 
                    key={s} 
                    onPress={() => setFilterSport(s)}
                    style={[styles.filterChip, filterSport === s && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, filterSport === s && styles.filterChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Status</Text>
              <View style={styles.chipRow}>
                {['All', 'Active', 'Locked', 'Deletion Requested', 'Under Review'].map(s => (
                  <TouchableOpacity 
                    key={s} 
                    onPress={() => setFilterStatus(s)}
                    style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
        </View>
      )}

      {/* Selectors */}
      <View style={styles.selectorsRow}>
        <View style={styles.selectorCol}>
          <Text style={styles.selectorLabel}>Academy</Text>
          <TouchableOpacity 
            onPress={() => {
                const nextIdx = (academies.findIndex(a => a.id === selectedAcademyId) + 1) % (academies.length + 1);
                setSelectedAcademyId(nextIdx === 0 ? null : academies[nextIdx - 1].id);
                setSelectedTournamentId(null);
            }}
            style={styles.selector}
          >
            <Text style={styles.selectorText}>{selectedAcademyId ? players.find(p => p.id === selectedAcademyId)?.name : 'All Academies'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.selectorCol}>
          <Text style={styles.selectorLabel}>Tournament</Text>
          <TouchableOpacity 
            disabled={!selectedAcademyId}
            onPress={() => {
                const tourns = (tournaments || []).filter(t => t.creatorId === selectedAcademyId);
                const nextIdx = (tourns.findIndex(t => t.id === selectedTournamentId) + 1) % (tourns.length + 1);
                setSelectedTournamentId(nextIdx === 0 ? null : tourns[nextIdx - 1].id);
            }}
            style={[styles.selector, !selectedAcademyId && styles.selectorDisabled]}
          >
            <Text style={styles.selectorText}>{selectedTournamentId ? (tournaments || []).find(t => t.id === selectedTournamentId)?.title : 'All'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Video Cards */}
      <View style={styles.videosList}>
        {(filteredVideos || []).map(video => {
          const st = statusColors[video.adminStatus || 'Active'] || statusColors['Active'];
          const isSelected = selectedVideoIds.includes(video.id);

          return (
            <View key={video.id} style={styles.videoCard}>
              <View style={styles.videoPlayerPlaceholder}>
                <TouchableOpacity 
                  onPress={() => toggleSelectVideo(video.id)}
                  style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                >
                  {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                </TouchableOpacity>
                <Image 
                  source={getSafePreview(video.previewUrl)} 
                  style={styles.previewImage} 
                />
                <View style={styles.playOverlay}>
                  <Ionicons name="play-circle" size={48} color="#FFFFFF" />
                </View>
                <View style={[styles.statusTag, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusTagText, { color: st.text }]}>{video.adminStatus || 'Active'}</Text>
                </View>
              </View>

              <View style={styles.videoContent}>
                <Text style={styles.matchTitle}>{getPlayerNames(video.playerIds)}</Text>
                <Text style={styles.matchSub}>{getTournamentName(video.tournamentId)} • {video.sport}</Text>
                
                <View style={styles.miniStats}>
                    <View style={styles.miniStat}>
                        <Text style={styles.miniStatValue}>{(video.viewerIds || []).length}</Text>
                        <Text style={styles.miniStatLabel}>Views</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setExpandedPurchaserId(expandedPurchaserId === video.id ? null : video.id)}
                      style={[styles.miniStat, expandedPurchaserId === video.id && styles.miniStatActive]}
                    >
                        <Text style={styles.miniStatValue}>{video.purchases || 0}</Text>
                        <Text style={styles.miniStatLabel}>Sales</Text>
                    </TouchableOpacity>
                    <View style={[styles.miniStat, { backgroundColor: '#F0FDF4' }]}>
                        <Text style={[styles.miniStatValue, { color: '#16A34A' }]}>₹{video.revenue || 0}</Text>
                        <Text style={styles.miniStatLabel}>Revenue</Text>
                    </View>
                </View>

                {expandedPurchaserId === video.id && (
                    <View style={styles.purchaserPanel}>
                        <Text style={styles.panelTitle}>Purchased By</Text>
                        {(players || []).filter(p => (p.purchasedVideos || []).includes(video.id)).map(p => {
                            const displayName = p.name || p.username || p.id;
                            return (
                                <View key={p.id} style={styles.purchaserChip}>
                                    <Image 
                                      source={getSafeAvatar(p.avatar, displayName, 'random')} 
                                      style={styles.chipAvatar} 
                                    />
                                    <Text style={styles.chipName}>{displayName}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                <View style={styles.actionGrid}>
                    {!showTrashOnly ? (
                      <>
                        <TouchableOpacity 
                            onPress={() => onUpdateVideoStatus(video.id, video.adminStatus === 'Locked' ? 'Active' : 'Locked')}
                            style={styles.actionBtn}
                        >
                            <Text style={styles.actionBtnText}>{video.adminStatus === 'Locked' ? 'Unlock' : 'Lock'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => onUpdateVideoStatus(video.id, 'Removed')}
                            style={[styles.actionBtn, styles.actionBtnDanger]}
                        >
                            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Remove</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity 
                            onPress={() => onUpdateVideoStatus(video.id, 'Active')}
                            style={[styles.actionBtn, styles.actionBtnSuccess]}
                        >
                            <Text style={[styles.actionBtnText, { color: '#16A34A' }]}>Retrieve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                if (window.confirm("Permanent Delete\nAre you sure you want to delete this video permanently? This action cannot be undone.")) {
                                  onPermanentDeleteVideo(video.id);
                                }
                              } else {
                                Alert.alert(
                                  "Permanent Delete",
                                  "Are you sure you want to delete this video permanently? This action cannot be undone.",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Delete", style: "destructive", onPress: () => onPermanentDeleteVideo(video.id) }
                                  ]
                                );
                              }
                            }}
                            style={[styles.actionBtn, styles.actionBtnDanger]}
                        >
                            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Delete Immediately</Text>
                        </TouchableOpacity>
                      </>
                    )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Popups (Simplified with Modals) */}
      {/* Trash Bin Modal */}
      <Modal visible={showTrashPopup} transparent animationType="slide">
        <SafeAreaView style={styles.modalBg}>
            <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Trash Bin</Text>
                  <Text style={styles.modalSubtitle}>{trashVideosCount} videos scheduled for deletion</Text>
                </View>
                <TouchableOpacity onPress={() => setShowTrashPopup(false)}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <View style={styles.bulkActionRow}>
              <TouchableOpacity 
                onPress={() => {
                  if (selectedTrashIds.length === trashVideosCount) setSelectedTrashIds([]);
                  else setSelectedTrashIds(trashVideos.map(v => v.id));
                }}
                style={styles.bulkSelectBtn}
              >
                <Ionicons name={selectedTrashIds.length === trashVideosCount ? "checkbox" : "square-outline"} size={16} color="#6366F1" />
                <Text style={styles.bulkSelectText}>Select All</Text>
              </TouchableOpacity>

              <View style={styles.flex} />

              {selectedTrashIds.length > 0 && (
                <>
                  <TouchableOpacity 
                    onPress={() => {
                      onBulkUpdateStatus(selectedTrashIds, 'Active');
                      setSelectedTrashIds([]);
                    }}
                    style={[styles.miniActionBtn, styles.restoreBtn]}
                  >
                    <Text style={styles.miniActionBtnText}>Restore ({selectedTrashIds.length})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm(`Permanent Delete\nDelete ${selectedTrashIds.length} videos permanently?`)) {
                          onBulkPermanentDeleteVideos(selectedTrashIds);
                          setSelectedTrashIds([]);
                        }
                      } else {
                        Alert.alert(
                          "Permanent Delete",
                          `Delete ${selectedTrashIds.length} videos permanently?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => {
                                onBulkPermanentDeleteVideos(selectedTrashIds);
                                setSelectedTrashIds([]);
                            }}
                          ]
                        );
                      }
                    }}
                    style={[styles.miniActionBtn, styles.purgeBtn]}
                  >
                    <Text style={styles.miniActionBtnText}>Purge</Text>
                  </TouchableOpacity>
                </>
              )}

              {trashVideosCount > 0 && selectedTrashIds.length === 0 && (
                <TouchableOpacity 
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      if (window.confirm("Empty Trash\nAre you sure you want to permanently delete ALL videos in the trash?")) {
                        onBulkPermanentDeleteVideos(trashVideos.map(v => v.id));
                      }
                    } else {
                      Alert.alert(
                        "Empty Trash",
                        "Are you sure you want to permanently delete ALL videos in the trash?",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete All", style: "destructive", onPress: () => onBulkPermanentDeleteVideos(trashVideos.map(v => v.id)) }
                        ]
                      );
                    }
                  }}
                  style={styles.emptyTrashBtn}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={styles.emptyTrashText}>Empty Trash</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={trashVideos}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.modalScrollContent}
              renderItem={({ item }) => {
                const isSelected = selectedTrashIds.includes(item.id);
                return (
                  <View style={styles.trashCard}>
                    <TouchableOpacity 
                      onPress={() => setSelectedTrashIds(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                      style={[styles.trashCheckbox, isSelected && styles.trashCheckboxSelected]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                    </TouchableOpacity>
                    <Image source={getSafePreview(item.previewUrl)} style={styles.trashThumbnail} />
                    <View style={styles.flex}>
                      <Text style={styles.trashTitle} numberOfLines={1}>{getPlayerNames(item.playerIds)}</Text>
                      <Text style={styles.trashMeta}>{getTournamentName(item.tournamentId)} • {item.sport}</Text>
                    </View>
                    <View style={styles.trashActions}>
                      <TouchableOpacity onPress={() => onUpdateVideoStatus(item.id, 'Active')} style={styles.trashRestBtn}>
                        <Ionicons name="refresh" size={18} color="#6366F1" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={(
                <View style={styles.emptyTrashContainer}>
                  <Ionicons name="trash-bin-outline" size={64} color="#1E293B" />
                  <Text style={styles.emptyTrashTitle}>Trash is Empty</Text>
                  <Text style={styles.emptyTrashSub}>Deleted videos will appear here.</Text>
                </View>
              )}
            />
        </SafeAreaView>
      </Modal>

      <Modal visible={showDeletionPopup} transparent animationType="slide">
        <SafeAreaView style={styles.modalBg}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pending Deletions</Text>
                <TouchableOpacity onPress={() => setShowDeletionPopup(false)}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
                {(matchVideos || []).filter(v => v && v.adminStatus === 'Deletion Requested').map(v => (
                    <View key={v.id} style={styles.deletionCard}>
                        <View style={styles.deletionHeader}>
                          <Image 
                            source={getSafePreview(v.previewUrl)} 
                            style={styles.deletionThumbnail} 
                          />
                          <View style={styles.flex}>
                            <Text style={styles.deletionMatch}>{getPlayerNames(v.playerIds)}</Text>
                            <Text style={styles.deletionMeta}>{getTournamentName(v.tournamentId)}</Text>
                          </View>
                        </View>
                        <View style={styles.reasonBox}>
                          <Text style={styles.reasonLabel}>DELETION REASON:</Text>
                          <Text style={styles.deletionReason}>{v.deletionReason || 'No reason provided'}</Text>
                        </View>
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => onApproveDeleteVideo(v.id)} style={styles.approveBtn}>
                                <Text style={styles.btnText}>Approve Deletion</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onRejectDeleteVideo(v.id)} style={styles.rejectBtn}>
                                <Text style={[styles.btnText, { color: '#64748B' }]}>Reject</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: 16,
  },
  premiumOverview: {
    padding: 24,
    borderRadius: 32,
    marginHorizontal: 16,
    marginBottom: 24,
    ...designSystem.shadows.indigo,
  },
  premiumLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 20,
    textAlign: 'center',
  },
  glassStat: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
  },
  glassStatActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  glassStatWarning: {
    backgroundColor: 'rgba(254, 215, 170, 0.15)',
    borderColor: 'rgba(254, 215, 170, 0.25)',
  },
  glassStatSuccess: {
    backgroundColor: 'rgba(187, 247, 208, 0.15)',
    borderColor: 'rgba(187, 247, 208, 0.25)',
  },
  premiumStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  premiumUnit: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '700',
  },
  premiumStatLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statBoxActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  statValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
  },
  unit: {
    fontSize: 10,
    color: '#94A3B8',
  },
  statSubLabel: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 4,
    textAlign: 'center',
  },
  statBoxWarning: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  statBoxSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  textWarning: { color: '#C2410C' },
  textSuccess: { color: '#15803D' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  filterToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  filterToggleText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#6366F1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterPanel: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  selectorsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  selectorCol: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
  },
  selector: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  videosList: {
    padding: 16,
    gap: 20,
  },
  videoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  videoPlayerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0F172A',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  checkbox: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  playOverlay: {
    zIndex: 5,
  },
  statusTag: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
  },
  statusTagText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  videoContent: {
    padding: 20,
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  matchSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  miniStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  miniStat: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  miniStatActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  miniStatValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  miniStatLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  purchaserPanel: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
  },
  panelTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  purchaserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  chipName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  actionBtnDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  actionBtnSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalContent: {
    padding: 20,
  },
  deletionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  deletionHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  deletionThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  deletionMatch: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  deletionMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  reasonBox: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  reasonLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 1,
  },
  deletionReason: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingLeft: 4,
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  flex: { flex: 1 },
  approveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  bulkActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  bulkSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
  },
  bulkSelectText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyTrashBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  emptyTrashText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  trashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  trashCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  trashCheckboxSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  trashThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 12,
    marginRight: 16,
    backgroundColor: '#000',
  },
  trashTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  trashMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  trashRestBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  restoreBtn: {
    backgroundColor: '#6366F1',
  },
  purgeBtn: {
    backgroundColor: '#EF4444',
  },
  miniActionBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },
  emptyTrashContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTrashTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 24,
  },
  emptyTrashSub: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});

export default AdminRecordingsDashboard;
