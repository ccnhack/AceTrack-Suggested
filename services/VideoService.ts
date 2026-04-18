import logger from '../utils/logger';

class VideoService {
  /**
   * Registers a new video with initial processing status.
   */
  static async registerVideo(videoData, prevVideos) {
    logger.logAction('VIDEO_REGISTER_START', { videoId: videoData.id, matchId: videoData.matchId });
    const updatedVideos = [videoData, ...(prevVideos || [])];
    logger.logAction('VIDEO_REGISTER_SUCCESS', { videoId: videoData.id });
    return {
      success: true,
      videos: updatedVideos,
      code: 'SUCCESS',
      message: 'Video registered successfully'
    };
  }

  /**
   * Updates the administrative status of a video (e.g., Deletion Requested).
   */
  static async updateStatus(videoId, status, prevVideos, metadata = {}) {
    logger.logAction('VIDEO_STATUS_UPDATE_START', { videoId, status });
    const updatedVideos = (prevVideos || []).map(v => 
      v.id === videoId ? { ...v, adminStatus: status, ...metadata } : v
    );
    logger.logAction('VIDEO_STATUS_UPDATE_SUCCESS', { videoId, status });
    return {
      success: true,
      videos: updatedVideos,
      code: 'SUCCESS',
      type: 'success',
      message: `Video status updated to ${status}`
    };
  }

  /**
   * Handles the purchase of AI Highlights.
   */
  static async purchaseHighlights(videoId, price, method, currentUser) {
    logger.logAction('VIDEO_PURCHASE_HIGHLIGHTS_START', { videoId, price, method });
    
    if (method === 'wallet') {
      const currentCredits = currentUser.credits || 0;
      if (currentCredits < price) {
        return {
          success: false,
          code: 'INSUFFICIENT_FUNDS',
          type: 'error',
          error: 'Insufficient wallet balance.'
        };
      }

      const updatedUser = {
        ...currentUser,
        credits: currentCredits - price,
        purchasedHighlights: [...(currentUser.purchasedHighlights || []), videoId]
      };

      logger.logAction('VIDEO_PURCHASE_HIGHLIGHTS_SUCCESS', { videoId });
      return {
        success: true,
        currentUser: updatedUser,
        code: 'SUCCESS',
        type: 'success',
        message: 'Highlights purchased successfully!'
      };
    }

    // Default for UPI/Other (Simulated success)
    const updatedUser = {
      ...currentUser,
      purchasedHighlights: [...(currentUser.purchasedHighlights || []), videoId]
    };

    return {
      success: true,
      currentUser: updatedUser,
      code: 'SUCCESS',
      type: 'success',
      message: 'Highlights purchased successfully!'
    };
  }

  /**
   * Handles the unlocking of full videos.
   */
  static async unlockVideo(videoId, price, method, currentUser) {
    logger.logAction('VIDEO_UNLOCK_START', { videoId, price, method });

    if (method === 'wallet') {
      const currentCredits = currentUser.credits || 0;
      if (currentCredits < price) {
        return {
          success: false,
          code: 'INSUFFICIENT_FUNDS',
          type: 'error',
          error: 'Insufficient wallet balance.'
        };
      }

      const updatedUser = {
        ...currentUser,
        credits: currentCredits - price,
        purchasedVideos: [...(currentUser.purchasedVideos || []), videoId]
      };

      logger.logAction('VIDEO_UNLOCK_SUCCESS', { videoId });
      return {
        success: true,
        currentUser: updatedUser,
        code: 'SUCCESS',
        type: 'success',
        message: 'Video unlocked successfully!'
      };
    }

    // Default for UPI/Other (Simulated success)
    const updatedUser = {
      ...currentUser,
      purchasedVideos: [...(currentUser.purchasedVideos || []), videoId]
    };

    return {
      success: true,
      currentUser: updatedUser,
      code: 'SUCCESS',
      type: 'success',
      message: 'Video unlocked successfully!'
    };
  }

  /**
   * Upserts a video (updates if exists, unshifts if new) and handles notifications.
   */
  static async upsertVideo(videoData, prevVideos, prevPlayers, prevMatches, prevTournaments, currentUserId) {
    logger.logAction('VIDEO_UPSERT_START', { videoId: videoData.id, matchId: videoData.matchId });
    
    const isNew = !(prevVideos || []).find(item => item.id === videoData.id);
    const updatedVideos = (prevVideos || []).map(item => item.id === videoData.id ? videoData : item);
    if (isNew) updatedVideos.unshift(videoData);

    let updatedPlayers = prevPlayers || [];
    const recipientIds = new Set();

    if (isNew) {
      const match = (prevMatches || []).find(m => m.id === videoData.matchId);
      const tournament = (prevTournaments || []).find(t => t.id === videoData.tournamentId);
      
      [
        ...(match?.player1Id ? [match.player1Id] : []),
        ...(match?.player2Id ? [match.player2Id] : []),
        ...(tournament?.assignedCoachId ? [tournament.assignedCoachId] : [])
      ].forEach(id => { if (id) recipientIds.add(id); });

      updatedPlayers = updatedPlayers.map(p => {
        if (recipientIds.has(p.id)) {
          const notif = {
            id: `notif-${Date.now()}-${p.id}`,
            title: 'New Video Uploaded',
            message: `Recording for match ${videoData.matchId} is now available.`,
            date: new Date().toISOString(),
            read: false,
            type: 'video',
            tournamentId: videoData.tournamentId
          };
          return { ...p, notifications: [notif, ...(p.notifications || [])] };
        }
        return p;
      });
    }

    let updatedCurrentUser = null;
    if (isNew && currentUserId && recipientIds.has(currentUserId)) {
      updatedCurrentUser = updatedPlayers.find(p => p.id === currentUserId);
    }

    logger.logAction('VIDEO_UPSERT_SUCCESS', { videoId: videoData.id });
    
    return {
      success: true,
      videos: updatedVideos,
      players: updatedPlayers,
      currentUser: updatedCurrentUser,
      recipientIds: Array.from(recipientIds),
      isNew,
      code: 'SUCCESS',
      type: 'success'
    };
  }

  /**
   * Updates multiple videos status at once.
   */
  static bulkUpdateStatus(ids, status, prevVideos) {
    logger.logAction('VIDEO_BULK_STATUS_UPDATE', { count: ids.length, status });
    const updated = (prevVideos || []).map(v => v && ids.includes(v.id) ? { ...v, adminStatus: status } : v);
    return { success: true, videos: updated };
  }

  /**
   * Permanently removes multiple videos.
   */
  static bulkDelete(ids, prevVideos) {
    logger.logAction('VIDEO_BULK_DELETE', { count: ids.length });
    const updated = (prevVideos || []).filter(v => v && !ids.includes(v.id));
    return { success: true, videos: updated };
  }

  /**
   * Increments refund counter (soft refund).
   */
  static refundVideo(id, prevVideos) {
    logger.logAction('VIDEO_REFUND', { videoId: id });
    const updated = (prevVideos || []).map(v => v.id === id ? { ...v, refundsIssued: (v.refundsIssued || 0) + 1 } : v);
    return { success: true, videos: updated };
  }

  /**
   * Approves deletion and refunds ALL players who purchased the video.
   */
  static approveDeletion(id, prevVideos, prevPlayers) {
    logger.logAction('VIDEO_APPROVE_DELETION', { videoId: id });
    const video = (prevVideos || []).find(v => v.id === id);
    if (!video) return { success: false, message: 'Video not found' };

    const updatedVideos = (prevVideos || []).map(v => v.id === id ? { ...v, adminStatus: 'Removed' } : v);
    
    const updatedPlayers = (prevPlayers || []).map(player => {
      let credits = player.credits || 0;
      let pVideos = player.purchasedVideos || [];
      if (pVideos.includes(id)) { 
        credits += (video.price || 0); 
        pVideos = pVideos.filter(vid => vid !== id); 
      }
      return { ...player, credits, purchasedVideos: pVideos };
    });

    return { success: true, videos: updatedVideos, players: updatedPlayers };
  }

  /**
   * Toggles a video in the user's favorites list.
   */
  static toggleFavorite(videoId, currentUser, prevPlayers) {
    logger.logAction('VIDEO_TOGGLE_FAVORITE', { videoId });
    const isFav = (currentUser.favouritedVideos || []).includes(videoId);
    const updatedFavs = isFav 
      ? (currentUser.favouritedVideos || []).filter(id => id !== videoId) 
      : [...(currentUser.favouritedVideos || []), videoId];
    
    const updatedUser = { ...currentUser, favouritedVideos: updatedFavs };
    const updatedPlayers = (prevPlayers || []).map(p => 
      p && String(p.id).toLowerCase() === String(currentUser.id).toLowerCase() ? updatedUser : p
    );

    return { success: true, user: updatedUser, players: updatedPlayers };
  }

  /**
   * Adds a user to the video's viewer list.
   */
  static trackView(videoId, userId, prevVideos) {
    const updated = (prevVideos || []).map(v => {
      if (v && v.id === videoId) {
        const currentViewers = v.viewerIds || [];
        if (!userId || currentViewers.includes(userId)) return v;
        return { ...v, viewerIds: [...currentViewers, userId] };
      }
      return v;
    });
    return { success: true, videos: updated };
  }
}

export default VideoService;
