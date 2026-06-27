import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  StyleSheet, Modal, TextInput, Alert, ActivityIndicator,
  FlatList, Dimensions, SafeAreaView, Platform
} from 'react-native';
import SafeAvatar from './SafeAvatar';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { FullscreenVideoPlayer } from './FullscreenVideoPlayer';
import config from '../config';
import VideoService from '../services/VideoService';
import TournamentService from '../services/TournamentService';
import notify from '../utils/notify';
import VideoHighlights from './VideoHighlights';

const { width } = Dimensions.get('window');

const ProcessingStatus = ({ status, onCancelVideo, videoId }) => {
  const stages = ['Uploading', 'Processing', 'Watermarking', 'Ready'];
  const currentIdx = status === 'processing' ? 1 : status === 'ready' ? 3 : 3;

  if (status !== 'processing') return null;

  return (
    <View style={styles.processingOverlay}>
      <ActivityIndicator size="large" color="#0F172A" />
      <Text style={styles.processingText}>Processing Watermark...</Text>
      <View style={styles.stagesContainer}>
        {stages.map((stage, idx) => (
          <View key={stage} style={styles.stageRow}>
            <View style={[
              styles.stageDot,
              idx < currentIdx ? styles.stageDone : idx === currentIdx ? styles.stageActive : styles.stagePending
            ]}>
              {idx < currentIdx && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
            </View>
            <Text style={[
              styles.stageLabel,
              idx <= currentIdx ? styles.stageLabelActive : styles.stageLabelPending
            ]}>{stage}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={() => onCancelVideo && onCancelVideo(videoId)}
        style={styles.cancelUploadBtn}
      >
        <Ionicons name="close-circle" size={14} color="#EF4444" />
        <Text style={styles.cancelUploadText}>Cancel Upload</Text>
      </TouchableOpacity>
    </View>
  );
};

const ReviewOverlay = ({ isPlayerMode, userRole }) => {
  if (userRole === 'academy' || userRole === 'admin') return null;
  
  return (
    <View style={styles.reviewOverlay}>
      <View style={styles.reviewContent}>
        <View style={styles.reviewIconCircle}>
          <Ionicons name="alert-circle" size={32} color="#F59E0B" />
        </View>
        <Text style={styles.reviewTitle}>Content Under Review</Text>
        <Text style={styles.reviewText}>
          This video has been requested for deletion by the academy and is currently being reviewed by AceTrack administration.
        </Text>
        <View style={styles.reviewBanner}>
          <Text style={styles.reviewBannerText}>TEMPORARILY UNAVAILABLE</Text>
        </View>
      </View>
    </View>
  );
};

const VideoStatusBadge = ({ video, isPlayerMode, user }) => {
  const isUnlocked = video.price === 0 || (user?.purchasedVideos && user.purchasedVideos.includes(video.id));
  const adminStatus = video.adminStatus || 'Active';
  const isUnderReview = adminStatus === 'Deletion Requested';
  
  // Player specific view: Prioritize Under Review, then Locked/Unlocked
  if (isPlayerMode) {
    if (isUnderReview) {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#FFEDD5' }]}>
          <Ionicons name="alert-circle" size={10} color="#9A3412" style={{ marginRight: 4 }} />
          <Text style={[styles.statusBadgeText, { color: '#9A3412' }]}>Inactive</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor: isUnlocked ? '#DCFCE7' : '#FEF9C3' }]}>
        <Ionicons 
          name={isUnlocked ? 'lock-open' : 'lock-closed'} 
          size={10} 
          color={isUnlocked ? '#166534' : '#854D0E'} 
          style={{ marginRight: 4 }} 
        />
        <Text style={[styles.statusBadgeText, { color: isUnlocked ? '#166534' : '#854D0E' }]}>
          {isUnlocked ? 'Unlocked' : 'Locked'}
        </Text>
      </View>
    );
  }

  const colors = {
    'Active': '#DCFCE7',
    'Locked': '#FEF9C3',
    'Deletion Requested': '#FFEDD5',
    'Under Review': '#DBEAFE',
    'Removed': '#FEE2E2',
    'Trash': '#F1F5F9',
  };
  const textColors = {
    'Active': '#166534',
    'Locked': '#854D0E',
    'Deletion Requested': '#9A3412',
    'Under Review': '#1E40AF',
    'Removed': '#991B1B',
    'Trash': '#64748B',
  };

  const getIcon = () => {
    switch (adminStatus) {
      case 'Active': return 'checkmark-circle';
      case 'Locked': return 'lock-closed';
      case 'Deletion Requested': return 'alert-circle';
      case 'Under Review': return 'search';
      case 'Removed': return 'close-circle';
      default: return 'videocam';
    }
  };

  return (
    <View style={[styles.statusBadge, { backgroundColor: colors[adminStatus] || '#F1F5F9' }]}>
      <Ionicons name={getIcon()} size={10} color={textColors[adminStatus] || '#64748B'} style={{ marginRight: 4 }} />
      <Text style={[styles.statusBadgeText, { color: textColors[adminStatus] || '#64748B' }]}>
        {adminStatus}
      </Text>
    </View>
  );
};

export const VideoManagement = ({
  academyId, tournaments = [], players = [], matchVideos = [], matches = [], onSaveVideo, onCancelVideo, onRequestDeletion, onLogTrace,
  onUnlockVideo, onPurchaseAiHighlights, onTopUp, onVideoPlay, onToggleFavourite,
  isPlayerMode = false, user = null, hideSelector = false, serverClockOffset = 0
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [fullscreenVideo, setFullscreenVideo] = useState(null);
  const [editingVideo, setEditingVideo] = useState(null);
  const [miniStatus, setMiniStatus] = useState({});
  const [deletionVideoId, setDeletionVideoId] = useState(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionComment, setDeletionComment] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tournamentId') || '';
    }
    return '';
  });
  const [cameraType, setCameraType] = useState('Single');
  const [price, setPrice] = useState('49');
  const [videoFile, setVideoFile] = useState(null);
  const [expandedVideoPurchasers, setExpandedVideoPurchasers] = useState(new Set());
  const [selectedMatchId, setSelectedMatchId] = useState(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      return params.get('matchId') || '';
    }
    return '';
  });

  // 🛡️ [URL_PERSISTENCE] (v2.6.652)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      let changed = false;
      
      if (selectedTournamentId) {
        if (currentUrl.searchParams.get('tournamentId') !== selectedTournamentId) {
          currentUrl.searchParams.set('tournamentId', selectedTournamentId);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('tournamentId')) {
        currentUrl.searchParams.delete('tournamentId');
        changed = true;
      }

      if (selectedMatchId) {
        if (currentUrl.searchParams.get('matchId') !== selectedMatchId) {
          currentUrl.searchParams.set('matchId', selectedMatchId);
          changed = true;
        }
      } else if (currentUrl.searchParams.has('matchId')) {
        currentUrl.searchParams.delete('matchId');
        changed = true;
      }

      if (changed) {
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [selectedTournamentId, selectedMatchId]);

  const [showPurchasePrompt, setShowPurchasePrompt] = useState(null);
  const [playingPreview, setPlayingPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [generatedHighlights, setGeneratedHighlights] = useState({});
  const [isGeneratingHighlights, setIsGeneratingHighlights] = useState({});

  const handleGenerateHighlights = async (videoId, videoUrl) => {
    setIsGeneratingHighlights(prev => ({ ...prev, [videoId]: true }));
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/v1/videos/${videoId}/highlights`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID
        },
        credentials: 'omit',
        body: JSON.stringify({ videoUrl })
      });
      const data = await response.json();
      if (data.success) {
        setGeneratedHighlights(prev => ({ ...prev, [videoId]: data.highlights }));
      } else {
        Alert.alert('Error', data.error || 'Failed to generate highlights');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Network error generating highlights');
    } finally {
      setIsGeneratingHighlights(prev => ({ ...prev, [videoId]: false }));
    }
  };


  const myTournaments = (academyId === 'all') 
    ? (tournaments || [])
    : (tournaments || []).filter(t => t && TournamentService.normalizeId(t.creatorId) === TournamentService.normalizeId(academyId));

  const closedTournaments = isPlayerMode 
    ? (tournaments || [])
    : (myTournaments || []).filter(t => {
        if (!t) return false;
        const todayStr = new Date(Date.now() + (serverClockOffset || 0)).toISOString().split('T')[0];
        const isPast = t.date < todayStr;
        return t.status === 'completed' || t.tournamentConcluded || (isPast && !t.tournamentStarted);
      });
  
  const myTournamentIds = new Set((myTournaments || []).map(t => t.id));
  const myVideos = isPlayerMode ? (matchVideos || []) : (matchVideos || []).filter(v => v && myTournamentIds.has(v.tournamentId));

  const [showTournamentPicker, setShowTournamentPicker] = useState(false);

  useEffect(() => {
    if (selectedMatchId) {
      const match = matches.find(m => m.id === selectedMatchId);
      const tournament = tournaments.find(t => t.id === selectedTournamentId);
      if (match && tournament) {
        onLogTrace && onLogTrace('Match Selection', 'video-upload', academyId, { matchId: selectedMatchId, tournamentId: selectedTournamentId });
      }
    }
  }, [selectedMatchId, selectedTournamentId, matches, tournaments]);

  useEffect(() => {
    onLogTrace && onLogTrace('Video Dashboard Access', 'academy-video', academyId, {
      totalTournaments: tournaments?.length,
      myTournaments: myTournaments.length,
      completedTournaments: closedTournaments.length,
      myVideos: myVideos.length
    });
  }, [academyId]);

  const getVideoCountForTournament = (tId) => (matchVideos || []).filter(v => v && v.tournamentId === tId).length;
  const getPurchasers = (vId) => (players || []).filter(p => (p.purchasedVideos || []).includes(vId));

  const handlePickVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setVideoFile(result.assets[0]);
      }
    } catch (err) {
      console.error("Error picking video:", err);
    }
  };

  const handleFormSubmit = async () => {
    if (!selectedTournamentId) {
      Alert.alert("Error", "Please select a tournament.");
      return;
    }

    if (!editingVideo && !videoFile) {
        Alert.alert("Error", "Please pick a video file.");
        return;
    }

    let cloudUrl = editingVideo?.videoUrl;
    let cloudFilename = editingVideo?.filename || 'video.mp4';

    // Cloud Upload Logic
    if (videoFile) {
      setIsUploading(true);
      setUploadProgress(0.1);
      onLogTrace && onLogTrace('Video Cloud Upload Start', 'upload', academyId, { filename: videoFile.name });

      try {
        const formData = new FormData();
        formData.append('video', {
          uri: videoFile.uri,
          name: videoFile.name,
          type: 'video/mp4' // Multer on server expects this
        });

        const uploadApiUrl = 'https://acetrack-suggested.onrender.com';
        const response = await fetch(`${uploadApiUrl}/api/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
            'x-ace-api-key': config.PUBLIC_APP_ID
          },
        });

        if (response.ok) {
          const data = await response.json();
          cloudUrl = data.url;
          cloudFilename = data.filename;
          setUploadProgress(1);
          onLogTrace && onLogTrace('Video Cloud Upload Success', 'upload', academyId, { url: cloudUrl });
        } else {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${errorText}`);
        }
      } catch (err) {
        console.error("Cloud upload error:", err);
        onLogTrace && onLogTrace('Video Cloud Upload Error', 'upload', academyId, { error: err.message });
        Alert.alert("Upload Failed", "Could not upload video to the cloud. Please check your connection.");
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    const match = matches.find(m => m.id === selectedMatchId);

    const newVideo = {
      id: editingVideo?.id || `v${Date.now()}`,
      tournamentId: selectedTournamentId,
      matchId: selectedMatchId,
      sport: tournament?.sport || 'Badminton',
      date: tournament?.date || new Date().toISOString().split('T')[0],
      playerIds: match ? [match.player1Id, match.player2Id].filter(id => !!id) : (tournament?.registeredPlayerIds || []),
      cameraType: cameraType,
      videoUrl: cloudUrl,
      previewUrl: cloudUrl, // For now, use same URL as preview
      price: Number(price),
      isPurchasable: true,
      filename: cloudFilename,
      uploadDate: editingVideo?.uploadDate || new Date().toISOString(),
      adminStatus: editingVideo?.adminStatus || 'Active',
      status: videoFile ? 'processing' : editingVideo?.status,
    };

    onSaveVideo(newVideo);
    setIsFormOpen(false);
    setEditingVideo(null);
    setVideoFile(null);
    setSelectedMatchId('');
  };

  const handleDeletionSubmit = async () => {
    if (!deletionReason.trim()) {
      notify({ success: false, code: 'ERROR', type: 'error', error: "Please provide a reason for deletion." });
      return;
    }
    const response = await VideoService.updateStatus(deletionVideoId, 'Deletion Requested');
    notify(response);
    setDeletionVideoId(null);
    setDeletionReason('');
  };

  const selectedTournamentVideos = hideSelector    ? (myVideos || []).filter(v => v && v.matchId === selectedMatchId)
    : (myVideos || []).filter(v => v && v.tournamentId === selectedTournamentId);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!hideSelector && (
        <View style={styles.selectorCard}>
          <Text style={styles.cardSubLabel}>Select Tournament</Text>
          <TouchableOpacity
            onPress={() => setShowTournamentPicker(!showTournamentPicker)}
            style={[styles.selector, showTournamentPicker && styles.selectorActive]}
          >
            <Text style={styles.selectorText}>
              {selectedTournamentId ? closedTournaments.find(t => t.id === selectedTournamentId)?.title : '-- Select completed tournament --'}
            </Text>
            <Ionicons name={showTournamentPicker ? "chevron-up" : "chevron-down"} size={20} color="#94A3B8" />
          </TouchableOpacity>

          {showTournamentPicker && (
            <View style={styles.dropdown}>
              <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                {closedTournaments.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => { setSelectedTournamentId(t.id); setShowTournamentPicker(false); }}
                    style={styles.dropdownItem}
                  >
                    <Text style={[styles.dropdownItemText, selectedTournamentId === t.id && styles.dropdownItemTextActive]}>{t.title}</Text>
                    {selectedTournamentId === t.id && <Ionicons name="checkmark" size={16} color="#3B82F6" />}
                  </TouchableOpacity>
                ))}
                {closedTournaments.length === 0 && (
                  <Text style={styles.noTournamentsText}>No completed tournaments found.</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {(selectedTournamentId || hideSelector) && (
        <View style={styles.content}>
          {!isPlayerMode && (
            <View style={styles.limitsCard}>
              <View style={styles.limitsHeader}>
                <Text style={styles.limitsLabel}>Upload Limits</Text>
                <Text style={styles.limitsValue}>{getVideoCountForTournament(selectedTournamentId)} / 20 videos</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(getVideoCountForTournament(selectedTournamentId) / 20) * 100}%` }]} />
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionCount}>{isPlayerMode ? 'Recordings' : 'Uploaded Videos'} ({selectedTournamentVideos.length})</Text>
            {!isPlayerMode && (
              <TouchableOpacity
                onPress={() => { setEditingVideo(null); setVideoFile(null); setIsFormOpen(true); }}
                style={styles.addButton}
                disabled={getVideoCountForTournament(selectedTournamentId) >= 20}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Video</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.videoGrid}>
            {selectedTournamentVideos.map(v => {
              const purchasers = (players || []).filter(p => (p.purchasedVideos || []).includes(v.id));
              const isExpanded = expandedVideoPurchasers.has(v.id);

              return (
                <View key={v.id} style={styles.videoCard}>
                  <View style={styles.videoHeader}>
                    <View style={styles.videoPlayerContainer}>
                      <VideoStatusBadge video={v} isPlayerMode={isPlayerMode} user={user} />
                      {playingPreview === v.id ? (
                        <Video
                          style={styles.videoPlayerUI}
                          source={{ uri: config.sanitizeUrl(v.watermarkedUrl || v.videoUrl) }}
                          useNativeControls
                          resizeMode={ResizeMode.CONTAIN}
                          onPlaybackStatusUpdate={(status) => {
                            if (status.isLoaded && status.isPlaying && status.positionMillis < 1000) {
                              onVideoPlay && onVideoPlay(v.id, user?.id);
                            }
                            
                            const isUnlocked = v.price === 0 || (user?.purchasedVideos && user.purchasedVideos.includes(v.id));
                            if (isPlayerMode && !isUnlocked && status.positionMillis >= 30000) {
                              // Pause and show purchase prompt
                              setPlayingPreview(null);
                              setShowPurchasePrompt({ videoId: v.id, price: v.price, type: 'video' });
                            }
                          }}
                          shouldPlay={true}
                        />
                      ) : (
                        <TouchableOpacity 
                          onPress={() => {
                            if (v.adminStatus === 'Deletion Requested' && isPlayerMode) {
                              Alert.alert("Video Under Review", "This video has been requested for deletion and is temporarily unavailable for playback.");
                              return;
                            }
                            setPlayingPreview(v.id);
                          }}
                          style={styles.videoPlayerUI}
                        >
                          <Image 
                            source={{ uri: config.sanitizeUrl(v.watermarkedUrl || v.previewUrl || v.videoUrl) }} 
                            style={styles.posterImage} 
                          />
                          {v.adminStatus === 'Deletion Requested' && isPlayerMode ? (
                            <ReviewOverlay isPlayerMode={isPlayerMode} userRole={user?.role} />
                          ) : (
                            <View style={styles.playOverlay}>
                              <Ionicons name="play" size={40} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      )}
                        {isPlayerMode && (
                          <TouchableOpacity 
                            style={styles.favouriteBtn}
                            onPress={() => onToggleFavourite && onToggleFavourite(v.id)}
                          >
                            <Ionicons 
                              name={user?.favouritedVideos?.includes(v.id) ? "heart" : "heart-outline"} 
                              size={20} 
                              color={user?.favouritedVideos?.includes(v.id) ? "#EF4444" : "#FFFFFF"} 
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity 
                          style={styles.expandTrigger}
                          onPress={() => {
                            if (v.adminStatus === 'Deletion Requested' && isPlayerMode) {
                              Alert.alert("Video Under Review", "This video has been requested for deletion and is temporarily unavailable for fullscreen playback.");
                              return;
                            }
                            setFullscreenVideo(v);
                          }}
                        >
                          <Ionicons name="expand" size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                        <ProcessingStatus status={v.status} onCancelVideo={onCancelVideo} videoId={v.id} />
                        <View style={styles.badgeOverlay}>
                          <VideoStatusBadge video={v} />
                        </View>
                        <Text style={styles.filenameOverlay}>{v.filename}</Text>
                        <Text style={styles.watermarkOverlay}>@AceTrack</Text>
                    </View>
                  </View>

                  <View style={styles.videoInfo}>
                    <View style={styles.infoRow}>
                      <View>
                        <Text style={styles.infoMeta}>{v.date} • {v.cameraType}</Text>
                        {!isPlayerMode && <Text style={styles.infoUploadDate}>Uploaded: {new Date(v.uploadDate).toLocaleDateString()}</Text>}
                      </View>
                      {!isPlayerMode && (
                        <TouchableOpacity
                          onPress={() => { setEditingVideo(v); setVideoFile(null); setIsFormOpen(true); }}
                          style={styles.editIcon}
                        >
                          <Ionicons name="pencil" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {!isPlayerMode && (
                      <View style={styles.analyticsGrid}>
                        <View style={styles.analyticBox}>
                          <Text style={styles.analyticValue}>{(v.viewerIds || []).length}</Text>
                          <Text style={styles.analyticLabel}>Views</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            const next = new Set(expandedVideoPurchasers);
                            if (next.has(v.id)) next.delete(v.id);
                            else next.add(v.id);
                            setExpandedVideoPurchasers(next);
                          }}
                          style={[styles.analyticBox, isExpanded && styles.analyticBoxActive]}
                        >
                          <Text style={[styles.analyticValue, isExpanded && { color: '#6366F1' }]}>{v.purchases || 0}</Text>
                          <Text style={[styles.analyticLabel, isExpanded && { color: '#818CF8' }]}>Purchased</Text>
                        </TouchableOpacity>
                        <View style={[styles.analyticBox, { backgroundColor: '#F0FDF4' }]}>
                          <Text style={[styles.analyticValue, { color: '#16A34A' }]}>₹{v.revenue || 0}</Text>
                          <Text style={[styles.analyticLabel, { color: '#4ADE80' }]}>Earned</Text>
                        </View>
                      </View>
                    )}

                    {!isPlayerMode && isExpanded && (
                      <View style={styles.purchasersPanel}>
                        <Text style={styles.purchasersLabel}>Purchased By:</Text>
                        <View style={styles.purchaserList}>
                          {purchasers.map(p => (
                            <View key={p.id} style={styles.purchaserChip}>
                              <SafeAvatar 
                                uri={p.avatar} 
                                name={p.name} 
                                size={24} 
                                borderRadius={12} 
                                style={styles.chipAvatar} 
                              />
                              <Text style={styles.chipText}>{p.name}</Text>
                            </View>
                          ))}
                          {purchasers.length === 0 && <Text style={styles.noPurchasers}>No purchases yet</Text>}
                        </View>
                      </View>
                    )}

                    <View style={styles.videoFooter}>
                      <View style={styles.purchasableRow}>
                        <View style={[styles.indicator, { backgroundColor: (v.isPurchasable && v.adminStatus !== 'Deletion Requested') ? '#22C55E' : '#CBD5E1' }]} />
                        <Text style={styles.indicatorText}>{(v.isPurchasable && v.adminStatus !== 'Deletion Requested') ? 'Active' : 'Inactive'}</Text>
                      </View>
                      <Text style={styles.priceText}>
                        {v.adminStatus === 'Deletion Requested' ? 'N/A' : (isPlayerMode ? (user.purchasedVideos?.includes(v.id) ? 'UNLOCKED' : `₹${v.price}`) : `₹${v.price}`)}
                      </Text>
                    </View>

                    {!isPlayerMode && v.adminStatus !== 'Removed' && (
                      <TouchableOpacity
                        onPress={() => setDeletionVideoId(v.id)}
                        style={[
                          styles.requestDeleteBtn,
                          v.adminStatus === 'Deletion Requested' && styles.requestDeleteBtnDisabled
                        ]}
                        disabled={v.adminStatus === 'Deletion Requested'}
                      >
                        <Text style={[
                          styles.requestDeleteText,
                          v.adminStatus === 'Deletion Requested' && styles.requestDeleteTextDisabled
                        ]}>
                          {v.adminStatus === 'Deletion Requested' ? 'Deletion Requested' : 'Request Deletion'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isPlayerMode && v.adminStatus !== 'Deletion Requested' && (
                      <View style={{ marginTop: 8 }}>
                        {(() => {
                          const isUnlocked = v.price === 0 || (user?.purchasedVideos && user.purchasedVideos.includes(v.id));
                          const hasHighlights = user?.purchasedHighlights && user.purchasedHighlights.includes(v.id);
                          
                          if (!isUnlocked) {
                            return (
                              <TouchableOpacity 
                                onPress={() => setShowPurchasePrompt({ videoId: v.id, price: v.price, type: 'video' })}
                                style={styles.unlockBtn}
                              >
                                <Ionicons name="lock-open" size={14} color="#FFFFFF" />
                                <Text style={styles.unlockBtnText}>Unlock Full Match (₹{v.price})</Text>
                              </TouchableOpacity>
                            );
                          }

                          if (hasHighlights) {
                            return (
                              <View>
                                <TouchableOpacity 
                                  style={[styles.highlightsBtn, generatedHighlights[v.id] && { backgroundColor: '#4F46E5' }]}
                                  onPress={() => {
                                    if (!generatedHighlights[v.id]) {
                                      handleGenerateHighlights(v.id, config.sanitizeUrl(v.watermarkedUrl || v.videoUrl));
                                    }
                                  }}
                                  disabled={isGeneratingHighlights[v.id]}
                                >
                                  {isGeneratingHighlights[v.id] ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4 }} />
                                  ) : (
                                    <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                                  )}
                                  <Text style={styles.highlightsBtnText}>
                                    {isGeneratingHighlights[v.id] ? 'Generating...' : (generatedHighlights[v.id] ? 'Highlights Ready' : 'Watch AI Highlights')}
                                  </Text>
                                </TouchableOpacity>
                                
                                {generatedHighlights[v.id] && (
                                  <VideoHighlights 
                                    highlights={generatedHighlights[v.id]} 
                                    onSeekTo={(time) => {
                                      // Optional: Set full screen video and seek to time
                                      setFullscreenVideo(v);
                                      // Seeking would ideally require a ref or an initialTime prop to FullscreenVideoPlayer
                                      // We pass the start time to miniStatus to be used by FullscreenVideoPlayer
                                      setMiniStatus(prev => ({ 
                                        ...prev, 
                                        [v.id]: { positionMillis: time * 1000, shouldPlay: true } 
                                      }));
                                    }} 
                                  />
                                )}
                              </View>
                            );
                          }

                          return (
                            <TouchableOpacity 
                              onPress={() => setShowPurchasePrompt({ videoId: v.id, price: 20, type: 'highlights' })}
                              style={styles.getHighlightsBtn}
                            >
                              <Ionicons name="sparkles-outline" size={14} color="#6366F1" />
                              <Text style={styles.getHighlightsBtnText}>Get AI Highlights (₹20)</Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {fullscreenVideo && (
        <FullscreenVideoPlayer
          visible={!!fullscreenVideo}
          videoUrl={config.sanitizeUrl(fullscreenVideo.watermarkedUrl || fullscreenVideo.videoUrl)}
          onClose={() => setFullscreenVideo(null)}
          initialStatus={miniStatus[fullscreenVideo.id] || {}}
          onPlaybackStatusUpdate={(status) => {
            setMiniStatus(prev => ({ ...prev, [fullscreenVideo.id]: status }));
            
            const isUnlocked = fullscreenVideo.price === 0 || (user?.purchasedVideos && user.purchasedVideos.includes(fullscreenVideo.id));
            if (isPlayerMode && !isUnlocked && status.positionMillis >= 30000) {
              setFullscreenVideo(null); // Close fullscreen
              setShowPurchasePrompt({ videoId: fullscreenVideo.id, price: fullscreenVideo.price, type: 'video' });
            }
          }}
        />
      )}

      {/* Upload/Edit Modal */}
      <Modal visible={isFormOpen} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingVideo ? 'Edit Video' : 'Add Video'}</Text>
            <TouchableOpacity onPress={() => setIsFormOpen(false)}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tournament</Text>
              <View style={styles.dummyInput}>
                <Text style={styles.dummyInputText}>{closedTournaments.find(t => t.id === selectedTournamentId)?.title}</Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Match</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchPickerScroll}>
                {matches.filter(m => m.tournamentId === selectedTournamentId).map(m => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelectedMatchId(m.id)}
                    style={[styles.matchChip, selectedMatchId === m.id && styles.matchChipActive]}
                  >
                    <Text style={[styles.matchChipText, selectedMatchId === m.id && styles.matchChipTextActive]}>
                      {players.find(p => p.id === m.player1Id)?.name || 'P1'} vs {players.find(p => p.id === m.player2Id)?.name || 'P2'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Camera Type</Text>
              <View style={styles.cameraTypeContainer}>
                {['Single', 'Multi'].map(type => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setCameraType(type)}
                    style={[styles.typeBtn, cameraType === type && styles.typeBtnActive]}
                  >
                    <Text style={[styles.typeBtnText, cameraType === type && styles.typeBtnTextActive]}>{type} Camera</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price (₹)</Text>
              <TextInput
                style={styles.priceInput}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="49"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Pick Video File</Text>
              <TouchableOpacity onPress={handlePickVideo} style={styles.filePicker}>
                <Ionicons name="cloud-upload" size={24} color="#3B82F6" />
                <Text style={styles.filePickerText}>
                  {videoFile ? videoFile.name : editingVideo?.filename || 'Select Video'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={handleFormSubmit} 
              style={[styles.saveButton, isUploading && styles.saveButtonDisabled]}
              disabled={isUploading}
            >
              {isUploading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>Uploading Video ({Math.round(uploadProgress * 100)}%)...</Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>Save Video</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Deletion Request Modal */}
      <Modal visible={!!deletionVideoId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <Text style={styles.deleteTitle}>Request Deletion</Text>
            <TextInput
              placeholder="Reason for deletion..."
              value={deletionReason}
              onChangeText={setDeletionReason}
              style={styles.deleteInput}
              multiline
            />
            <View style={styles.deleteActions}>
              <TouchableOpacity onPress={handleDeletionSubmit} style={[styles.deleteBtn, styles.deleteConfirm]}>
                <Text style={styles.deleteBtnText}>Submit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDeletionVideoId(null)} style={[styles.deleteBtn, styles.deleteCancel]}>
                <Text style={[styles.deleteBtnText, { color: '#64748B' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modernized Purchase Modal for Video Management */}
      <Modal visible={!!showPurchasePrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.purchaseModal}>
            <View style={styles.purchaseIconContainer}>
              <Ionicons 
                name={showPurchasePrompt?.type === 'highlights' ? 'sparkles' : 'lock-open'} 
                size={32} 
                color={showPurchasePrompt?.type === 'highlights' ? '#6366F1' : '#EF4444'} 
              />
            </View>
            <Text style={styles.purchaseTitle}>
              {showPurchasePrompt?.type === 'highlights' ? 'Unlock AI Highlights' : 'Unlock Video'}
            </Text>
            <Text style={styles.purchaseSubtitle}>
              {showPurchasePrompt?.type === 'highlights' 
                ? `Analyze match data to extract best smashes, rallies & momentum shifts for ₹${showPurchasePrompt?.price}.`
                : `Choose a payment method to unlock the full match recording for ₹${showPurchasePrompt?.price}.`}
            </Text>

            <View style={styles.purchaseActions}>
              <TouchableOpacity 
                onPress={async () => {
                  let response;
                  if (showPurchasePrompt?.type === 'highlights') {
                    response = await VideoService.purchaseHighlights(showPurchasePrompt.videoId, 20, 'wallet', user);
                  } else {
                    response = await VideoService.unlockVideo(showPurchasePrompt.videoId, showPurchasePrompt.price, 'wallet', user);
                  }
                  
                  if (response.code === 'INSUFFICIENT_BALANCE') {
                    Alert.alert(
                      "Insufficient Balance",
                      `Your wallet balance (₹${user?.credits || 0}) is too low. Please top up or use UPI.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Top Up", onPress: () => {
                          setShowPurchasePrompt(null);
                          onTopUp && onTopUp(100);
                        }}
                      ]
                    );
                  } else {
                    notify(response);
                    setShowPurchasePrompt(null);
                  }
                }}
                style={styles.walletBtn}
              >
                <Ionicons name="wallet-outline" size={18} color="#FFFFFF" />
                <Text style={styles.walletBtnText}>Pay with Wallet (₹{showPurchasePrompt?.price})</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => {
                  Alert.alert("Redirecting to UPI...", "Connecting to payment gateway...");
                  setTimeout(async () => {
                    let response;
                    if (showPurchasePrompt?.type === 'highlights') {
                      response = await VideoService.purchaseHighlights(showPurchasePrompt.videoId, 20, 'upi', user);
                    } else {
                      response = await VideoService.unlockVideo(showPurchasePrompt.videoId, showPurchasePrompt.price, 'upi', user);
                    }
                    notify(response);
                    setShowPurchasePrompt(null);
                  }, 1500);
                }}
                style={styles.upiBtn}
              >
                <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                <Text style={styles.upiBtnText}>Pay with UPI</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowPurchasePrompt(null)} style={styles.purchaseCancelBtn}>
                <Text style={styles.purchaseCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

