import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Modal, TextInput, Alert, Dimensions,
  SafeAreaView, FlatList, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '../theme/designSystem';
import { styles } from './admin/recordings/AdminRecordingsStyles';
import SafeAvatar from './SafeAvatar';
import { getSafePreview } from '../utils/imageUtils';

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
  const [selectedAcademyId, setSelectedAcademyId] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('academyId');
    }
    return null;
  });
  const [selectedTournamentId, setSelectedTournamentId] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tournamentId');
    }
    return null;
  });

  // 🛡️ [URL_PERSISTENCE] (v2.6.652)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      let changed = false;
      if (selectedAcademyId) {
        if (currentUrl.searchParams.get('academyId') !== selectedAcademyId) {
          currentUrl.searchParams.set('academyId', selectedAcademyId);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('academyId')) {
        currentUrl.searchParams.delete('academyId');
        changed = true;
      }
      
      if (selectedTournamentId) {
        if (currentUrl.searchParams.get('tournamentId') !== selectedTournamentId) {
          currentUrl.searchParams.set('tournamentId', selectedTournamentId);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('tournamentId')) {
        currentUrl.searchParams.delete('tournamentId');
        changed = true;
      }

      if (changed) {
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [selectedAcademyId, selectedTournamentId]);
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

  // 🛡️ Auto-close deletion popup when no pending deletions remain
  useEffect(() => {
    if (pendingDeletions === 0 && showDeletionPopup) {
      setShowDeletionPopup(false);
    }
  }, [pendingDeletions, showDeletionPopup]);

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
        (v.playerIds || []).some(pid => (players || []).find(p => p.id === pid)?.name?.toLowerCase().includes(q))
      );
    }
    return videos;
  }, [activeVideos, trashVideos, showTrashOnly, selectedAcademyId, selectedTournamentId, filterSport, filterStatus, searchQuery, tournaments, players]);

  const toggleSelectVideo = (id) => {
    setSelectedVideoIds(prev => prev.includes(id) ? prev.filter(vid => vid !== id) : [...prev, id]);
  };

  const getPlayerNames = (pids) => (pids || []).map(id => (players || []).find(p => p.id === id)?.name || id).join(' vs ');
  const getTournamentName = (tid) => (tournaments || []).find(t => t.id === tid)?.title || tid;

  const renderVideoItem = useCallback(({ item: video }) => {
    const st = statusColors[video.adminStatus || 'Active'] || statusColors['Active'];
    const isSelected = selectedVideoIds.includes(video.id);

    return (
      <View style={[styles.videoCard, { marginBottom: 20 }]}>
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
                              <SafeAvatar 
                                uri={p.avatar} 
                                name={displayName} 
                                role={p.role} 
                                size={24} 
                                borderRadius={12} 
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
                        // 🛡️ [WEB_COMPAT FIX] (v2.6.432): Unified to Alert.alert
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
  }, [statusColors, selectedVideoIds, expandedPurchaserId, showTrashOnly, toggleSelectVideo, getPlayerNames, getTournamentName, players, onUpdateVideoStatus, onPermanentDeleteVideo]);

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <FlatList
        data={filteredVideos || []}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        windowSize={5}
        maxToRenderPerBatch={5}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 100 }}
        renderItem={renderVideoItem}
        ListHeaderComponent={<>
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

        </>} // End Header
      />

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
                      // 🛡️ [WEB_COMPAT FIX] (v2.6.432): Unified to Alert.alert
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
                    // 🛡️ [WEB_COMPAT FIX] (v2.6.432): Unified to Alert.alert
                    Alert.alert(
                      "Empty Trash",
                      "Are you sure you want to permanently delete ALL videos in the trash?",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete All", style: "destructive", onPress: () => onBulkPermanentDeleteVideos(trashVideos.map(v => v.id)) }
                      ]
                    );
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

    </View>
  );
};


export default AdminRecordingsDashboard;
