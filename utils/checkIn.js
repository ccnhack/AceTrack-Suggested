/**
 * 📱 QR Check-In Module (v2.6.618)
 * 
 * Supports two flows:
 *   1. Admin/Coach QR Scan → POST /api/v1/tournaments/:id/check-in { playerId }
 *   2. Player Self Check-In → POST /api/v1/tournaments/:id/check-in (no body)
 * 
 * The local processCheckIn function is retained for optimistic UI updates.
 * processCheckInRemote handles the actual server call.
 */

import config from '../config';
import storage from './storage';

/**
 * Generate QR code data for a player-tournament pair
 * @param {string} playerId
 * @param {string} tournamentId
 * @returns {string} JSON string to encode as QR
 */
export const generateCheckInQRData = (playerId, tournamentId) => {
  const payload = {
    type: 'acetrack_checkin',
    playerId,
    tournamentId,
    generated: new Date().toISOString(),
    version: 1,
  };
  return JSON.stringify(payload);
};

/**
 * Validate scanned QR data
 * @param {string} scannedData - Raw QR string
 * @param {string} expectedTournamentId - Tournament we're checking in for
 * @returns {{ valid: boolean, playerId: string|null, error: string|null }}
 */
export const validateCheckInQR = (scannedData, expectedTournamentId) => {
  try {
    const payload = JSON.parse(scannedData);
    
    if (payload.type !== 'acetrack_checkin') {
      return { valid: false, playerId: null, error: 'Invalid QR code — not an AceTrack check-in code' };
    }
    
    if (payload.tournamentId !== expectedTournamentId) {
      return { valid: false, playerId: null, error: 'This QR code is for a different tournament' };
    }
    
    if (!payload.playerId) {
      return { valid: false, playerId: null, error: 'QR code is corrupted — no player ID found' };
    }
    
    return { valid: true, playerId: payload.playerId, error: null };
  } catch (e) {
    return { valid: false, playerId: null, error: 'Could not read QR code' };
  }
};

/**
 * Local (optimistic) check-in — updates in-memory tournament object.
 * Use this for immediate UI feedback before the server confirms.
 * @param {Object} tournament
 * @param {string} playerId
 * @returns {{ success: boolean, tournament: Object, error: string|null }}
 */
export const processCheckIn = (tournament, playerId) => {
  const registered = tournament.registeredPlayerIds || [];
  
  if (!registered.includes(playerId)) {
    return { success: false, tournament, error: 'Player is not registered for this tournament' };
  }
  
  const statuses = { ...(tournament.playerStatuses || {}) };
  
  if (statuses[playerId] === 'Checked-In') {
    return { success: false, tournament, error: 'Player already checked in' };
  }
  
  statuses[playerId] = 'Checked-In';
  
  return {
    success: true,
    tournament: { ...tournament, playerStatuses: statuses },
    error: null,
  };
};

/**
 * 📡 [REMOTE_CHECKIN] (v2.6.618): Server-side atomic check-in via REST.
 * 
 * Call this AFTER processCheckIn for optimistic UI, or standalone for
 * guaranteed atomic check-in without local state dependency.
 * 
 * @param {string} tournamentId - Tournament to check into
 * @param {string|null} playerId - Target player (null = self check-in)
 * @returns {Promise<{ success: boolean, tournament?: Object, message: string, type?: string }>}
 */
export const processCheckInRemote = async (tournamentId, playerId = null) => {
  try {
    const token = await storage.getItem('userToken');
    const body = playerId ? { playerId } : {};

    const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tournamentId}/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'x-ace-api-key': config.PUBLIC_APP_ID || config.ACE_API_KEY
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, message: result.message || 'Check-in failed', tournament: null };
    }

    return {
      success: true,
      tournament: result.tournament || null,
      message: result.message || 'Check-in confirmed',
      type: result.type || 'SUCCESS'
    };
  } catch (err) {
    console.error('[processCheckInRemote] Network error:', err);
    return { success: false, message: 'Network error — please try again', tournament: null };
  }
};

/**
 * Get check-in stats for a tournament
 * @param {Object} tournament
 * @returns {Object}
 */
export const getCheckInStats = (tournament) => {
  const registered = (tournament.registeredPlayerIds || []).length;
  const statuses = tournament.playerStatuses || {};
  const checkedIn = Object.values(statuses).filter(s => s === 'Checked-In').length;
  const noShow = registered - checkedIn;
  
  return {
    total: registered,
    checkedIn,
    pending: noShow,
    percentage: registered > 0 ? Math.round((checkedIn / registered) * 100) : 0,
  };
};

export default {
  generateCheckInQRData,
  validateCheckInQR,
  processCheckIn,
  processCheckInRemote,
  getCheckInStats,
};
