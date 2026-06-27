import { styles } from './profile/ProfileStyles';
import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Dimensions, Modal, TextInput, Alert,
  Platform, KeyboardAvoidingView, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { FullscreenVideoPlayer } from './FullscreenVideoPlayer';
import ProGate from './ProGate';
import config from '../config';
import AIAnalysisCard from './AIAnalysisCard';

const { width } = Dimensions.get('window');

const ReviewOverlay = ({ isUnderReview }) => {
  if (!isUnderReview) return null;
  
  return (
    <View style={styles.reviewOverlay}>
      <View style={styles.reviewContent}>
        <View style={styles.reviewIconCircle}>
          <Ionicons name="alert-circle" size={24} color="#F59E0B" />
        </View>
        <Text style={styles.reviewTitle}>Under Review</Text>
        <Text style={styles.reviewText}>This content is temporarily unavailable.</Text>
      </View>
    </View>
  );
};

export const PlayerReferralDashboard = ({ user }) => {
  if (user.role !== 'user') return null;

  const handleShare = () => {
    const shareMessage = `Join me on AceTrack! Use my referral code ${user.referralCode} to get ₹100 credits when you register for your first tournament. Download now: https://acetrack.app/invite`;
    Alert.alert(
      "Referral Code Copied!",
      "Share this message with your friends:\n\n" + shareMessage
    );
  };

  return (
    <View style={styles.referCard}>
      <View style={styles.referHeader}>
        <View style={styles.referIconContainer}>
          <Ionicons name="gift-outline" size={22} color="#6366F1" />
        </View>
        <Text style={styles.referTitle}>Refer Friends, Play Along</Text>
      </View>
      <Text style={styles.referDesc}>
        Gift ₹100 to your friends! You both earn ₹100 credits when they register for their first tournament using your code.
      </Text>
      <View style={styles.codeBox}>
        <View style={styles.codeTextContainer}>
          <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
          <Text style={styles.codeText} numberOfLines={1} adjustsFontSizeToFit>{user.referralCode}</Text>
        </View>
        <TouchableOpacity style={styles.referShareBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
          <Text style={styles.referShareBtnText}>Invite</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const PlayerSkillDashboard = ({ user, latestEvaluation }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.cardSubLabel}>Skill Dashboard</Text>
      <View style={styles.row}>
        <View style={styles.skillBox}>
          <Text style={styles.skillLabel}>True Skill Rating</Text>
          <Text style={styles.skillValueBig}>{user.trueSkillRating || user.rating}</Text>
        </View>
        <View style={styles.skillBox}>
          <Text style={styles.skillLabel}>Skill Level</Text>
          <Text 
            style={[styles.skillValueBig, { color: '#EF4444' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {user.skillLevel}
          </Text>
        </View>
      </View>
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user.matchesPlayed}</Text>
          <Text style={styles.statLabel}>Matches</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#22C55E' }]}>{user.wins}</Text>
          <Text style={styles.statLabel}>Wins</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>{user.losses}</Text>
          <Text style={styles.statLabel}>Losses</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#3B82F6' }]}>
            {user.matchesPlayed > 0 ? Math.round((user.wins / user.matchesPlayed) * 100) : 0}%
          </Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
      </View>

      {user.trueSkillHistory && user.trueSkillHistory.length > 0 && (
        <View>
          <Text style={styles.progressionTitle}>Skill Progression</Text>
          <View style={styles.progressionList}>
            {user.trueSkillHistory.map((history, index) => (
              <View key={index} style={[styles.progressionItem, index === user.trueSkillHistory.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.progressionDate}>
                  {new Date(history.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
                <Text style={styles.progressionRating}>{history.rating}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <AIAnalysisCard 
        evaluationScores={latestEvaluation ? latestEvaluation.scores : null} 
        playerName={user.name} 
        playerSkillLevel={user.skillLevel} 
        isPro={user.isPro} 
        user={user}
      />
    </View>
  );
};

export const PlayerPerformanceAnalytics = ({ user }) => {
  if (!user.performanceAnalytics) return null;
  const { shotDistribution, rallyStats } = user.performanceAnalytics;

  return (
    <ProGate user={user} featureName="AI Analytics">
      <View style={styles.card}>
        <Text style={styles.cardSubLabel}>Performance Analytics</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shot Distribution</Text>
          <View style={styles.analyticsGrid}>
            <View style={styles.analyticItemRow}>
              <Text style={styles.analyticTextLabel}>Smashes</Text>
              <Text style={styles.analyticTextValue}>{shotDistribution.smashes}%</Text>
            </View>
            <View style={styles.analyticItemRow}>
              <Text style={styles.analyticTextLabel}>Drops</Text>
              <Text style={styles.analyticTextValue}>{shotDistribution.drops}%</Text>
            </View>
            <View style={styles.analyticItemRow}>
              <Text style={styles.analyticTextLabel}>Clears</Text>
              <Text style={styles.analyticTextValue}>{shotDistribution.clears}%</Text>
            </View>
            <View style={styles.analyticItemRow}>
              <Text style={styles.analyticTextLabel}>Net Shots</Text>
              <Text style={styles.analyticTextValue}>{shotDistribution.netShots}%</Text>
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Rally Statistics</Text>
          <View style={styles.analyticsGrid}>
            <View style={styles.analyticBox}>
              <Text style={styles.analyticBoxLabel}>Longest Rally</Text>
              <Text style={styles.analyticBoxValue}>{rallyStats.longestRally} shots</Text>
            </View>
            <View style={styles.analyticBox}>
              <Text style={styles.analyticBoxLabel}>Avg Rally</Text>
              <Text style={styles.analyticBoxValue}>{rallyStats.averageRallyLength} shots</Text>
            </View>
            <View style={styles.analyticBox}>
              <Text style={[styles.analyticBoxLabel, { color: '#22C55E' }]}>Winning Shots</Text>
              <Text style={[styles.analyticBoxValue, { color: '#22C55E' }]}>{rallyStats.winningShots}</Text>
            </View>
            <View style={styles.analyticBox}>
              <Text style={[styles.analyticBoxLabel, { color: '#EF4444' }]}>Unforced Errors</Text>
              <Text style={[styles.analyticBoxValue, { color: '#EF4444' }]}>{rallyStats.unforcedErrors}</Text>
            </View>
          </View>
        </View>
      </View>
    </ProGate>
  );
};

export const PlayerRecordings = ({ 
  user, matchVideos, tournaments, players, 
  onUnlockVideo, onPurchaseAiHighlights, onTopUp, onVideoPlay, 
  selectedTournamentId: externalSelectedTournamentId, onSelectTournament 
}) => {
  const [playingPreview, setPlayingPreview] = useState(null);
  const [isWatchingHighlights, setIsWatchingHighlights] = useState(false);
  const [showPurchasePrompt, setShowPurchasePrompt] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [miniStatus, setMiniStatus] = useState({});
  const [internalSelectedTournamentId, setInternalSelectedTournamentId] = useState('all');

  const selectedTournamentId = externalSelectedTournamentId !== undefined ? externalSelectedTournamentId : internalSelectedTournamentId;
  
  const handleSelectTournament = (id) => {
    if (onSelectTournament) onSelectTournament(id);
    else setInternalSelectedTournamentId(id);
  };

  const isCoach = user.role === 'coach';
  
  const myVideos = matchVideos.filter(v => {
    if (v.adminStatus === 'Removed' || v.adminStatus === 'Trash') return false;
    if (v.playerIds.includes(user.id)) return true;
    if (isCoach) {
      const tournament = tournaments.find(t => t.id === v.tournamentId);
      return tournament?.assignedCoachId === user.id;
    }
    return false;
  });

  const tournamentIdsWithVideos = Array.from(new Set(myVideos.map(v => v.tournamentId)));
  const availableTournaments = tournaments.filter(t => tournamentIdsWithVideos.includes(t.id));

  const filteredVideos = selectedTournamentId === 'all' 
    ? myVideos 
    : myVideos.filter(v => v.tournamentId === selectedTournamentId);

  if (myVideos.length === 0) {
    return (
      <View style={styles.darkCard}>
        <Text style={styles.darkCardSubLabel}>
          {isCoach ? 'Coached Match Recordings' : 'My Match Recordings'}
        </Text>
        <View style={styles.emptyDarkContent}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="videocam" size={24} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>No Recordings Yet</Text>
          <Text style={styles.emptyDesc}>Your match recordings will appear here once they are uploaded by tournament organizers.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.darkCard}>
      <View style={styles.darkCardHeader}>
        <Text style={styles.darkCardSubLabel}>
          {isCoach ? 'Coached Match Recordings' : 'My Match Recordings'}
        </Text>
        {availableTournaments.length > 0 && (
          <TouchableOpacity 
            onPress={() => {
              // In mobile, we might use a bottom sheet or modal for selection
              // For now, simpler selection logic
              const nextId = selectedTournamentId === 'all' ? availableTournaments[0].id : 'all';
              handleSelectTournament(nextId);
            }}
            style={styles.headerSelect}
          >
            <Text style={styles.headerSelectText}>
              {selectedTournamentId === 'all' ? 'All Tournaments' : tournaments.find(t => t.id === selectedTournamentId)?.title}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.videoList}>
        {filteredVideos.map(video => {
          const tournament = tournaments.find(t => t.id === video.tournamentId);
          const isUnlocked = video.price === 0 || (user.purchasedVideos && user.purchasedVideos.includes(video.id));
          const opponentId = video.playerIds.find(id => id !== user.id);
          const opponent = players.find(p => p.id === opponentId);

          return (
            <View key={video.id} style={styles.videoItem}>
              <View style={styles.videoItemHeader}>
                <View>
                  <Text style={styles.videoItemTitle}>{tournament?.title || 'Unknown'}</Text>
                  <Text style={styles.videoItemSubtitle}>Match #{video.matchId.split('-').pop()} • {video.date}</Text>
                  <Text style={styles.videoItemOpponent}>vs {opponent?.name || 'Unknown'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: video.adminStatus === 'Deletion Requested' ? '#FFEDD5' : (isUnlocked ? '#DCFCE7' : '#FEF9C3') }]}>
                  <Ionicons name={video.adminStatus === 'Deletion Requested' ? "alert-circle" : (isUnlocked ? "lock-open" : "lock-closed")} size={10} color={video.adminStatus === 'Deletion Requested' ? '#9A3412' : (isUnlocked ? '#166534' : '#854D0E')} />
                  <Text style={[styles.statusBadgeText, { color: video.adminStatus === 'Deletion Requested' ? '#9A3412' : (isUnlocked ? '#166534' : '#854D0E') }]}>{video.adminStatus === 'Deletion Requested' ? 'Inactive' : (isUnlocked ? 'Unlocked' : 'Locked')}</Text>
                </View>
              </View>
              
              <View style={styles.videoContent}>
                {playingPreview === video.id ? (
                  <View style={styles.videoPlayerContainer}>
                    <Video
                      style={styles.videoPlayer}
                      source={{ uri: config.sanitizeUrl(isWatchingHighlights ? (video.highlightsUrl || video.videoUrl) : (video.watermarkedUrl || video.videoUrl)) || "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" }}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={playingPreview === video.id}
                      onPlaybackStatusUpdate={(status) => {
                        setMiniStatus(prev => ({ ...prev, [video.id]: status }));
                        const isUnlocked = video.price === 0 || (user.purchasedVideos && user.purchasedVideos.includes(video.id));
                        if (!isUnlocked && status.positionMillis >= 30000) {
                          setPlayingPreview(null);
                          setShowPurchasePrompt({ videoId: video.id, price: video.price, type: 'video' });
                        }
                      }}
                    />
                    <TouchableOpacity 
                      style={styles.expandTrigger}
                      onPress={() => setIsFullscreen(video.id)}
                    >
                      <Ionicons name="expand" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setPlayingPreview(null)}
                      style={styles.closeVideo}
                    >
                      <Ionicons name="close-circle" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    onPress={() => {
                        if (video.adminStatus === 'Deletion Requested') {
                          Alert.alert("Video Under Review", "This video has been requested for deletion and is temporarily unavailable for playback.");
                          return;
                        }
                        setPlayingPreview(video.id);
                        onVideoPlay?.(video.id, user.id);
                    }}
                    style={styles.videoPlaceholder}
                  >
                    <Image 
                      source={{ uri: config.sanitizeUrl(video.previewUrl || video.watermarkedUrl) || "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80" }} 
                      style={styles.placeholderImage} 
                    />
                    {video.adminStatus === 'Deletion Requested' ? (
                      <ReviewOverlay isUnderReview={true} />
                    ) : (
                      <View style={styles.playOverlay}>
                        <Ionicons name="play" size={32} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.watermarkSmall}>
                      <Text style={styles.watermarkTextSmall}>@AceTrack</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {!isUnlocked && video.adminStatus !== 'Deletion Requested' && (
                <TouchableOpacity 
                  onPress={() => setShowPurchasePrompt({ videoId: video.id, price: video.price, type: 'video' })}
                  style={styles.unlockButton}
                >
                  <Text style={styles.unlockButtonText}>Unlock ₹{video.price}</Text>
                </TouchableOpacity>
              )}

              {isUnlocked && !isCoach && (
                <View style={styles.highlightsContainer}>
                  {(user.purchasedHighlights && user.purchasedHighlights.includes(video.id)) ? (
                    <TouchableOpacity 
                      onPress={() => {
                        setIsWatchingHighlights(true);
                        setPlayingPreview(video.id);
                      }}
                      style={styles.aiButton}
                    >
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                      <Text style={styles.aiButtonText}>Watch AI Highlights</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      onPress={() => setShowPurchasePrompt({ videoId: video.id, price: 20, type: 'highlights' })}
                      style={styles.aiButton}
                    >
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                      <Text style={styles.aiButtonText}>Get AI Highlights (₹20)</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.aiHint}>Includes: Smashes, Best Rallies & Winning Points</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Modernized Purchase Modal for Profile Features */}
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
                onPress={() => {
                  if ((user?.credits || 0) >= (showPurchasePrompt?.price || 0)) {
                    if (showPurchasePrompt?.type === 'highlights') {
                      onPurchaseAiHighlights && onPurchaseAiHighlights(showPurchasePrompt.videoId, user.id, 'wallet');
                    } else {
                      onUnlockVideo && onUnlockVideo(showPurchasePrompt.videoId, showPurchasePrompt.price, 'wallet');
                    }
                    setShowPurchasePrompt(null);
                  } else {
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
                  setTimeout(() => {
                    if (showPurchasePrompt?.type === 'highlights') {
                      onPurchaseAiHighlights && onPurchaseAiHighlights(showPurchasePrompt.videoId, user.id, 'upi');
                    } else {
                      onUnlockVideo && onUnlockVideo(showPurchasePrompt.videoId, showPurchasePrompt.price, 'upi');
                    }
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

      {isFullscreen && (
        (() => {
          const v = myVideos.find(vid => vid.id === isFullscreen);
          return (
            <FullscreenVideoPlayer
              visible={!!isFullscreen}
              videoUrl={config.sanitizeUrl((isWatchingHighlights ? (v?.highlightsUrl || v?.videoUrl) : (v?.watermarkedUrl || v?.videoUrl)) || "")}
              onClose={() => setIsFullscreen(false)}
              initialStatus={miniStatus[isFullscreen] || {}}
              onPlaybackStatusUpdate={(status) => {
                setMiniStatus(prev => ({ ...prev, [v.id]: status }));
                if (!isUnlocked && status.positionMillis >= 30000) {
                  setIsFullscreen(false);
                  setShowPurchasePrompt({ videoId: v.id, price: v.price, type: 'video' });
                }
              }}
            />
          );
        })()
      )}
    </View>
  );
};

export const PlayerWalletDashboard = ({ user, onTopUp, noCard }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('500');
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' or 'card'
  
  // Card States
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const handleFinalizeTopUp = () => {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount to top up.");
      return;
    }

    if (paymentMethod === 'card') {
      if (cardNumber.length < 16 || expiry.length < 4 || cvv.length < 3) {
        Alert.alert("Invalid Card Details", "Please enter complete card information.");
        return;
      }
    }

    onTopUp?.(amount);
    setShowTopUpModal(false);
    // Reset states
    setCardNumber('');
    setExpiry('');
    setCvv('');
  };

  return (
    <View style={noCard ? styles.noCardContainer : styles.card}>
      <View style={styles.walletHeader}>
        <View style={styles.walletHeaderLeft}>
          <View style={styles.walletIconContainer}>
            <Ionicons name="wallet" size={20} color="#EF4444" />
          </View>
          <View>
            <Text style={styles.cardSubLabel}>AceTrack Wallet</Text>
            <TouchableOpacity onPress={() => setShowHistory(!showHistory)}>
              <Text style={styles.passbookLink}>{showHistory ? 'Close History' : 'View Passbook'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceOverlay}>
          <Ionicons name="wallet" size={120} color="rgba(255, 255, 255, 0.1)" />
        </View>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>₹{user.credits || 0}</Text>
        <TouchableOpacity onPress={() => setShowTopUpModal(true)} style={styles.topUpButton}>
          <Text style={styles.topUpButtonText}>Top Up Credits</Text>
        </TouchableOpacity>
      </View>

      {/* Top Up Modal */}
      <Modal visible={showTopUpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalScrollContainer}>
            <View style={styles.topUpSheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Top Up Credits</Text>
                <TouchableOpacity onPress={() => setShowTopUpModal(false)}>
                  <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <View style={styles.amountSection}>
                <Text style={styles.inputLabel}>Enter Amount (₹)</Text>
                <TextInput 
                  style={styles.amountInput}
                  value={topUpAmount}
                  onChangeText={setTopUpAmount}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <Text style={styles.inputLabel}>Payment Method</Text>
              
              <TouchableOpacity 
                onPress={() => setPaymentMethod('upi')}
                style={[styles.methodItem, paymentMethod === 'upi' && styles.methodItemSelected]}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="phone-portrait-outline" size={20} color="#16A34A" />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>Pay with UPI</Text>
                  <Text style={styles.methodDesc}>PhonePe, Google Pay, BHIM</Text>
                </View>
                {paymentMethod === 'upi' && <Ionicons name="checkmark-circle" size={20} color="#16A34A" />}
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => setPaymentMethod('card')}
                style={[styles.methodItem, paymentMethod === 'card' && styles.methodItemSelected]}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="card-outline" size={20} color="#3B82F6" />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>Pay with Credit Card</Text>
                  <Text style={styles.methodDesc}>Visa, Mastercard, RuPay</Text>
                </View>
                {paymentMethod === 'card' && <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />}
              </TouchableOpacity>

              {paymentMethod === 'card' && (
                <View style={styles.cardForm}>
                  <TextInput 
                    style={styles.cardInput}
                    placeholder="Card Number"
                    value={cardNumber}
                    onChangeText={setCardNumber}
                    keyboardType="numeric"
                    maxLength={16}
                  />
                  <View style={styles.cardRow}>
                    <TextInput 
                      style={[styles.cardInput, { flex: 1.5 }]}
                      placeholder="MM/YY"
                      value={expiry}
                      onChangeText={setExpiry}
                      maxLength={5}
                    />
                    <TextInput 
                      style={[styles.cardInput, { flex: 1 }]}
                      placeholder="CVV"
                      value={cvv}
                      onChangeText={setCvv}
                      keyboardType="numeric"
                      secureTextEntry
                      maxLength={3}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity onPress={handleFinalizeTopUp} style={styles.finalizeBtn}>
                <Text style={styles.finalizeBtnText}>Top Up Now</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {showHistory && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyLabel}>Audit History</Text>
          {(user.walletHistory || []).length > 0 ? (
            <View style={styles.historyList}>
              {(user.walletHistory || []).map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyItemLeft}>
                    <View style={[styles.historyIcon, { backgroundColor: item.type === 'credit' ? '#DCFCE7' : '#FEE2E2' }]}>
                      <Ionicons 
                        name={item.type === 'credit' ? "arrow-down" : "arrow-up"} 
                        size={14} 
                        color={item.type === 'credit' ? "#16A34A" : "#DC2626"} 
                      />
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.historyDesc, { flexShrink: 1 }]}>{item.description}</Text>
                        {item.status === 'Pending' && (
                          <View style={[styles.pendingBadge, { marginTop: 2 }]}>
                            <Text style={styles.pendingBadgeText}>Pending</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.historyDate}>
                        {new Date(item.date).toLocaleDateString()} • {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.historyAmount, { color: item.type === 'credit' ? '#16A34A' : '#DC2626' }]}>
                    {item.type === 'credit' ? '+' : '-'}₹{Math.abs(item.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No transactions found</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

