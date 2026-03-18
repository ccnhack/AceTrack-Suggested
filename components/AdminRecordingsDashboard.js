import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Modal, TextInput, Alert, Dimensions,
  SafeAreaView, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

  useEffect(() => {
    if (pendingDeletions === 0 && showDeletionPopup) {
      setShowDeletionPopup(false);
    }
  }, [pendingDeletions, showDeletionPopup]);

  const academies = useMemo(() => players.filter(p => p.role === 'academy' || p.id.includes('academy')), [players]);

  const activeVideos = useMemo(() => matchVideos.filter(v => v.adminStatus !== 'Removed' && v.adminStatus !== 'Trash'), [matchVideos]);
  const trashVideos = useMemo(() => matchVideos.filter(v => v.adminStatus === 'Removed' || v.adminStatus === 'Trash'), [matchVideos]);

  const totalVideos = activeVideos.length;
  const videosToday = matchVideos.filter(v => {
    const d = v.uploadDate ? new Date(v.uploadDate) : new Date(v.date);
    return d.toDateString() === new Date().toDateString();
  }).length;
  const pendingDeletions = matchVideos.filter(v => v.adminStatus === 'Deletion Requested').length;
  const trashVideosCount = trashVideos.length;
  const totalRevenue = activeVideos.reduce((sum, v) => sum + (v.revenue || 0), 0);

  const filteredVideos = useMemo(() => {
    let videos = showTrashOnly ? trashVideos : activeVideos;
    if (selectedAcademyId) {
      const hostedTournamentIds = tournaments.filter(t => t.creatorId === selectedAcademyId).map(t => t.id);
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
        v.matchId.toLowerCase().includes(q) || 
        v.playerIds.some(pid => players.find(p => p.id === pid)?.name.toLowerCase().includes(q))
      );
    }
    return videos;
  }, [activeVideos, trashVideos, showTrashOnly, selectedAcademyId, selectedTournamentId, filterSport, filterStatus, searchQuery, tournaments, players]);

  const toggleSelectVideo = (id) => {
    setSelectedVideoIds(prev => prev.includes(id) ? prev.filter(vid => vid !== id) : [...prev, id]);
  };

  const getPlayerNames = (pids) => pids.map(id => players.find(p => p.id === id)?.name || id).join(' vs ');
  const getTournamentName = (tid) => tournaments.find(t => t.id === tid)?.title || tid;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Overview Cards */}
      <View style={styles.overviewDashboard}>
        <Text style={styles.overviewLabel}>Video Overview</Text>
        <View style={styles.statsGrid}>
          <TouchableOpacity 
            onPress={() => {
              setSelectedAcademyId(null);
              setSelectedTournamentId(null);
              setFilterStatus('All');
              setShowTrashOnly(false);
            }} 
            style={[styles.statBox, !showTrashOnly && styles.statBoxActive]}
          >
            <Text style={styles.statValue}>{totalVideos}</Text>
            <Text style={styles.statSubLabel}>Total Videos</Text>
          </TouchableOpacity>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(totalVideos * 2.2).toFixed(1)} <Text style={styles.unit}>GB</Text></Text>
            <Text style={styles.statSubLabel}>Storage</Text>
          </View>
          <TouchableOpacity onPress={() => setShowTodayVideosPopup(true)} style={styles.statBox}>
            <Text style={styles.statValue}>{videosToday}</Text>
            <Text style={styles.statSubLabel}>Today</Text>
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
            style={[styles.statBox, styles.statBoxWarning]}
          >
            <Text style={[styles.statValue, styles.textWarning]}>{pendingDeletions}</Text>
            <Text style={[styles.statSubLabel, styles.textWarning]}>Pending Deletions</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              setFilterStatus('All');
              setShowTrashOnly(true);
            }} 
            style={[styles.statBox, showTrashOnly && styles.statBoxActive]}
          >
            <Text style={styles.statValue}>{trashVideosCount}</Text>
            <Text style={styles.statSubLabel}>Trash / Removed</Text>
          </TouchableOpacity>
          <View style={[styles.statBox, styles.statBoxSuccess]}>
            <Text style={[styles.statValue, styles.textSuccess]}>₹{totalRevenue.toLocaleString()}</Text>
            <Text style={[styles.statSubLabel, styles.textSuccess]}>Total Revenue</Text>
          </View>
        </View>
      </View>

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
                const tourns = tournaments.filter(t => t.creatorId === selectedAcademyId);
                const nextIdx = (tourns.findIndex(t => t.id === selectedTournamentId) + 1) % (tourns.length + 1);
                setSelectedTournamentId(nextIdx === 0 ? null : tourns[nextIdx - 1].id);
            }}
            style={[styles.selector, !selectedAcademyId && styles.selectorDisabled]}
          >
            <Text style={styles.selectorText}>{selectedTournamentId ? tournaments.find(t => t.id === selectedTournamentId)?.title : 'All'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Video Cards */}
      <View style={styles.videosList}>
        {filteredVideos.map(video => {
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
                  source={{ uri: video.previewUrl || `https://ui-avatars.com/api/?name=Match&background=000000&color=ffffff` }} 
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
                        {players.filter(p => p.purchasedVideos?.includes(video.id)).map(p => {
                            const displayName = p.name || p.username || p.id;
                            return (
                                <View key={p.id} style={styles.purchaserChip}>
                                    <Image 
                                      source={{ uri: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random` }} 
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
                              Alert.alert(
                                "Permanent Delete",
                                "Are you sure you want to delete this video permanently? This action cannot be undone.",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  { text: "Delete", style: "destructive", onPress: () => onPermanentDeleteVideo(video.id) }
                                ]
                              );
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
      <Modal visible={showDeletionPopup} transparent animationType="slide">
        <SafeAreaView style={styles.modalBg}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pending Deletions</Text>
                <TouchableOpacity onPress={() => setShowDeletionPopup(false)}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
                {matchVideos.filter(v => v.adminStatus === 'Deletion Requested').map(v => (
                    <View key={v.id} style={styles.deletionCard}>
                        <View style={styles.deletionHeader}>
                          <Image 
                            source={{ uri: v.previewUrl || `https://ui-avatars.com/api/?name=Match&background=000000&color=ffffff` }} 
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
  },
  overviewDashboard: {
    backgroundColor: '#0F172A',
    padding: 24,
    borderRadius: 32,
    margin: 16,
  },
  overviewLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statBoxActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  unit: {
    fontSize: 10,
    color: '#94A3B8',
  },
  statSubLabel: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
    textAlign: 'center',
  },
  statBoxWarning: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  statBoxSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  textWarning: { color: '#FDBA74' },
  textSuccess: { color: '#86EFAC' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  filterToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  filterToggleText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  filterPanel: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  filterDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
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
    marginBottom: 6,
    paddingLeft: 4,
  },
  selector: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  videosList: {
    padding: 16,
    gap: 16,
  },
  videoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  videoPlayerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  checkbox: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  playOverlay: {
    zIndex: 5,
  },
  statusTag: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 10,
  },
  statusTagText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  videoContent: {
    padding: 16,
  },
  matchTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  matchSub: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  miniStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  miniStat: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  miniStatActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  miniStatValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
  },
  miniStatLabel: {
    fontSize: 6,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  purchaserPanel: {
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: '#6366F1',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  purchaserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 10,
    marginBottom: 6,
  },
  chipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  chipName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
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
    fontSize: 10,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalContent: {
    padding: 16,
  },
  deletionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deletionHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  deletionThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  deletionMatch: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  deletionMeta: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  reasonBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  reasonLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  deletionReason: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#EF4444',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  flex: { flex: 1 },
  approveBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
});

export default AdminRecordingsDashboard;
