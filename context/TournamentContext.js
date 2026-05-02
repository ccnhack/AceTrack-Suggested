import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { eventBus } from '../services/EventBus';
import TournamentService from '../services/TournamentService';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { useAuth } from './AuthContext';
import { usePlayers } from './PlayerContext';

const TournamentContext = createContext(null);

export const useTournaments = () => useContext(TournamentContext);

export const TournamentProvider = ({ children }) => {
  const [tournaments, setTournaments] = useState([]);
  const tournamentsRef = useRef([]);
  const [reschedulingFrom, setReschedulingFrom] = useState(null);

  const { syncAndSaveData } = useSync();
  const { currentUser, setCurrentUser, currentUserRef } = useAuth();
  const { players, setPlayers } = usePlayers();
  const playersRef = useRef(players);

  useEffect(() => {
    tournamentsRef.current = tournaments;
  }, [tournaments]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Initial Hydration
  useEffect(() => {
    const hydrate = async () => {
      const saved = await syncManager.getSystemFlag('tournaments');
      if (saved) setTournaments(saved);
    };
    hydrate();
  }, []);

  // Entity Listener
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (entity === 'tournaments') {
        const freshData = await syncManager.getSystemFlag('tournaments');
        if (freshData) setTournaments(freshData);
      }
    });
    return unsub;
  }, []);

  const onRegister = useCallback(async (t, method, cost, isResched, fromTid) => {
    try {
      if (!currentUserRef.current || !t) {
        console.warn('[TournamentContext] Registration aborted: Missing User or Tournament');
        return { success: false, message: 'Invalid registration state.' };
      }
      
      const tid = typeof t === 'object' ? t.id : t;
      const tournament = tournamentsRef.current.find(it => it.id === tid);
      
      if (!tournament) {
        console.warn('[TournamentContext] Registration target not found:', tid);
        return { success: false, message: 'Arena not found. Please refresh.' };
      }

      console.log(`[TournamentContext] Starting registration for ${tid} via ${method}`);
      
      if (typeof TournamentService.register !== 'function') {
        throw new Error('TournamentService.register is not a function! Check imports.');
      }

      const result = TournamentService.register(
        tid, 
        currentUserRef.current.id, 
        tournamentsRef.current, 
        playersRef.current, 
        currentUserRef.current,
        method,
        cost
      );
      
      if (result && result.success) {
        setTournaments(result.tournaments);
        setPlayers(result.players);
        setCurrentUser(result.currentUser);
        
        console.log('[TournamentContext] State updated locally. Syncing...');
        
        if (typeof syncAndSaveData !== 'function') {
           console.error('[TournamentContext] syncAndSaveData is undefined!');
           // We continue because local state is updated, but this is why refresh fails
        } else {
           const syncSuccess = await syncAndSaveData({ 
             tournaments: result.tournaments, 
             players: result.players, 
             currentUser: result.currentUser 
           }, false);
           console.log('[TournamentContext] Sync result:', syncSuccess);
        }

        if (result.type === 'UPI_PENDING' || result.type === 'UPI_SUCCESS') {
          // Handled by ExploreScreen
        } else if (result.referralBonus > 0) {
          Alert.alert('Referral Bonus!', `You earned ₹${result.referralBonus} for your first tournament registration!`);
        }
      } else {
        const msg = result?.message || 'Could not complete registration.';
        Alert.alert('Registration Failed', msg);
      }
      return result;
    } catch (e) {
      console.error('[TournamentContext] FATAL_ON_REGISTER_ERROR:', e);
      // Detailed alert for the user to help debug
      Alert.alert('System Error', `Line: onRegister\nError: ${e.message}\nStack: ${e.stack?.substring(0, 100)}`);
      throw e; 
    }
  }, [setTournaments, setPlayers, setCurrentUser, syncAndSaveData]);

  const onJoinWaitlist = useCallback((t) => {
    if (!currentUserRef.current || !t) return null;
    const tid = typeof t === 'object' ? t.id : t;
    
    const result = TournamentService.joinWaitlist(tid, currentUserRef.current.id, tournamentsRef.current);
    
    if (result.success) {
      setTournaments(result.tournaments);
      syncAndSaveData({ tournaments: result.tournaments });
    } else {
      Alert.alert('Waitlist Error', result.message || 'Could not join waitlist.');
    }
    return result;
  }, [setTournaments, syncAndSaveData]);

  const onStartTournament = useCallback((tid) => {
    const result = TournamentService.startTournament(tid, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  const onEndTournament = useCallback((tid) => {
    const result = TournamentService.endTournament(tid, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  const onAssignCoach = useCallback((tid, cid) => {
    const result = TournamentService.assignCoach(tid, cid, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [syncAndSaveData]);

  const onRemoveCoach = useCallback((tid) => {
    const result = TournamentService.removeCoach(tid, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  const onApproveCoach = useCallback((coachId, status = 'approved', reason = '') => {
    const result = TournamentService.approveCoach(coachId, status, playersRef.current);
    if (result.success) {
      // 🛡️ [FIX v2.6.303]: approveCoach modifies players, not tournaments
      const updatedPlayers = reason 
        ? result.players.map(p => String(p.id).toLowerCase() === String(coachId).toLowerCase() 
            ? { ...p, coachRejectReason: reason } 
            : p)
        : result.players;
      setPlayers(updatedPlayers);
      syncAndSaveData({ players: updatedPlayers });
    }
  }, [setPlayers, syncAndSaveData]);

  const onSaveCoachComment = useCallback((tid, comment) => {
    if (!currentUserRef.current) return;
    const result = TournamentService.addCoachComment(tid, currentUserRef.current.id, comment, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [syncAndSaveData]);

  const onAddPlayer = useCallback((tid, playerName, playerPhone) => {
    const result = TournamentService.addPlayer(tid, playerName, playerPhone, tournamentsRef.current, playersRef.current);
    if (result.success) {
      setTournaments(result.tournaments);
      syncAndSaveData({ tournaments: result.tournaments });
      Alert.alert("Success", "Player added to tournament.");
    } else {
      Alert.alert("Error", result.message || "Failed to add player.");
    }
  }, [syncAndSaveData]);

  const onRemovePendingPlayer = useCallback((tid, pid) => {
    const result = TournamentService.removePendingPlayer(tid, pid, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  const onManageInterested = useCallback((tid, pid, action) => {
    const result = TournamentService.manageInterested(tid, pid, action, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  const onDeclineCoachRequest = useCallback((t) => {
    const result = TournamentService.declineCoachRequest(t.id, tournamentsRef.current);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [syncAndSaveData]);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Missing handler used by MatchCard
  const onConfirmCoachRequest = useCallback((t) => {
    if (!currentUserRef.current) return;
    const updated = tournamentsRef.current.map(item => 
      item.id === t.id ? { ...item, assignedCoachId: currentUserRef.current.id, coachStatus: 'Coach Confirmed' } : item
    );
    setTournaments(updated);
    syncAndSaveData({ tournaments: updated });
  }, [syncAndSaveData]);

  const onSaveTournament = useCallback((newT) => {
    const updated = [newT, ...tournamentsRef.current];
    setTournaments(updated);
    syncAndSaveData({ tournaments: updated });
  }, [syncAndSaveData]);

  const onUpdateTournament = useCallback((updated) => {
    const updatedTournaments = tournamentsRef.current.map(t => t.id === updated.id ? updated : t);
    setTournaments(updatedTournaments);
    syncAndSaveData({ tournaments: updatedTournaments });
  }, [syncAndSaveData]);

  const onDeleteTournament = useCallback((tid) => {
    const updated = tournamentsRef.current.filter(t => t.id !== tid);
    setTournaments(updated);
    syncAndSaveData({ tournaments: updated }, true);
  }, [syncAndSaveData]);

  const onReschedule = useCallback((tournamentId) => {
    setReschedulingFrom(tournamentId);
  }, []);

  const onOptOut = useCallback((tid) => {
    if (!currentUserRef.current) return;
    const result = TournamentService.optOut(tid, currentUserRef.current.id, tournamentsRef.current, playersRef.current, currentUserRef.current);
    if (result.success) {
      setTournaments(result.tournaments);
      if (result.players) setPlayers(result.players);
      if (result.currentUser) setCurrentUser(result.currentUser);
      
      // 🛡️ [BUG-6 FIX] (v2.6.313): Only push tournaments atomically.
      // Players must NEVER be pushed atomically — thinned local copies can wipe the server.
      // Players and currentUser are pushed separately via non-atomic merge.
      syncAndSaveData({ tournaments: result.tournaments }, true);
      syncAndSaveData({ 
        players: result.players || playersRef.current,
        currentUser: result.currentUser || currentUserRef.current
      });

      Alert.alert('Success', 'You have successfully opted out of this tournament.');
    } else {
      Alert.alert('Error', result.message || 'Failed to opt out.');
    }
  }, [setTournaments, setPlayers, setCurrentUser, syncAndSaveData]);

  const value = {
    tournaments,
    setTournaments,
    tournamentsRef,
    reschedulingFrom,
    setReschedulingFrom,
    onRegister,
    onOptOut,
    onJoinWaitlist,
    onStartTournament,
    onEndTournament,
    onAssignCoach,
    onRemoveCoach,
    onApproveCoach,
    onSaveCoachComment,
    onDeclineCoachRequest,
    onAddPlayer,
    onRemovePendingPlayer,
    onManageInterested,
    onSaveTournament,
    onUpdateTournament,
    onDeleteTournament,
    onReschedule,
    onConfirmCoachRequest
  };

  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
};
