import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { syncManager } from '../services/SyncManager';
import MatchService from '../services/MatchService';
import { useSync } from './SyncContext';
import { useMatchmakingQuery } from '../stores/hooks';

const MatchmakingContext = createContext(null);

export const useMatchmaking = () => {
  const { data: matchmaking } = useMatchmakingQuery();
  const context = useContext(MatchmakingContext);
  
  return { 
    matchmaking: matchmaking || [], 
    ...context 
  };
};

/**
 * MATCHMAKING CONTEXT (Phase 1.3+)
 * Thin orchestrator that maintains UI state reactivity while delegating
 * all business logic to MatchService and all state authority to SyncManager.
 */
export const MatchmakingProvider = ({ children }) => {
  const { syncAndSaveData } = useSync();

  /**
   * Delegates a challenge creation to the service and authority.
   */
  const createChallenge = useCallback((receiver, date, time, sport, venue, currentUserId, currentUserName) => {
    const response = MatchService.createChallenge(
      { id: currentUserId, name: currentUserName || 'You' }, 
      receiver, 
      date, 
      time, 
      sport, 
      venue
    );
    
    if (response.success) {
      syncManager.handleMatchUpdate(response);
    }
    return response;
  }, []);

  /**
   * Delegates a challenge response (Accept/Decline/Cancel).
   */
  const respondToChallenge = useCallback((challenge, action, userId, userName, overrides = {}) => {
    const response = MatchService.respond(challenge, action, userId, userName, overrides);
    if (response.success) {
      syncManager.handleMatchUpdate(response);
    }
    return response;
  }, []);

  /**
   * Delegates a counter-offer proposal.
   */
  const proposeCounter = useCallback((challenge, userId, userName, date, time, venue, comment) => {
    const response = MatchService.proposeCounter(challenge, userId, userName, date, time, venue, comment);
    if (response.success) {
      syncManager.handleMatchUpdate(response);
    }
    return response;
  }, []);

  /**
   * Delegates match finalization.
   */
  const finalizeMatch = useCallback((match, sets, sport) => {
    const response = MatchService.finalizeMatch(match, sets, sport);
    if (response.success) {
      syncManager.handleMatchUpdate(response);
    }
    return response;
  }, []);

  /**
   * Legacy Compatibility Layer (v2.6.118)
   * UI components should ideally use SyncManager.handleMatchUpdate directly,
   * but we restore this to prevent crashes in older screen logic.
   */
  const onUpdateMatchmaking = useCallback((updatedData) => {
    // 🛡️ [SYNC AUTHORITY] (v2.6.121)
    // If passed a full array (legacy bulk update like 'Remove All Expired'),
    // we must route through syncAndSaveData with the atomic flag.
    if (Array.isArray(updatedData)) {
      console.log('[MatchmakingContext] Bulk update detected, triggering atomic cloud push.');
      syncAndSaveData({ matchmaking: updatedData }, true);
    } else {
      // Single item update via handleMatchUpdate
      syncManager.handleMatchUpdate(updatedData);
    }
  }, [syncAndSaveData]);

  const value = useMemo(() => ({
    createChallenge,
    respondToChallenge,
    proposeCounter,
    finalizeMatch,
    onUpdateMatchmaking
  }), [
    createChallenge,
    respondToChallenge,
    proposeCounter,
    finalizeMatch,
    onUpdateMatchmaking
  ]);

  return (
    <MatchmakingContext.Provider value={value}>
      {children}
    </MatchmakingContext.Provider>
  );
};
