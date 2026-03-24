/**
 * 📱 QR Check-In Scaffolding (STUB)
 * OWNER Fix: Tournament day player verification via QR codes
 * 
 * TODO: Install:
 *   npx expo install expo-barcode-scanner
 */

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
 * Process check-in for a player
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

// Note: The actual QR scanner UI component would use expo-barcode-scanner
// which requires camera permissions. The UI is stubbed for now.
// 
// Usage example:
// import { BarCodeScanner } from 'expo-barcode-scanner';
// const handleBarCodeScanned = ({ type, data }) => {
//   const result = validateCheckInQR(data, tournamentId);
//   if (result.valid) processCheckIn(tournament, result.playerId);
// };

export default {
  generateCheckInQRData,
  validateCheckInQR,
  processCheckIn,
  getCheckInStats,
};
