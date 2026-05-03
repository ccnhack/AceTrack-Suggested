import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import TournamentService from '../services/TournamentService';
import storage from '../utils/storage';
import { useSync } from './SyncContext';
import { useAuth } from './AuthContext';
import { usePlayers } from './PlayerContext';
import { useTournamentsStore } from '../stores';
import { useTournamentsQuery } from '../stores/hooks';

const TournamentContext = createContext(null);

export const useTournaments = () => {
  const { data: tournaments } = useTournamentsQuery();
  const context = useContext(TournamentContext);
  
  // Provide tournamentsRef for backward compatibility if components need it
  const tournamentsRef = useRef(tournaments || []);
  useEffect(() => {
    tournamentsRef.current = tournaments || [];
  }, [tournaments]);

  return { 
    tournaments: tournaments || [], 
    tournamentsRef, 
    ...context 
  };
};

export const TournamentProvider = ({ children }) => {
  const setTournamentsStore = useTournamentsStore(s => s.setTournaments);
  const [reschedulingFrom, setReschedulingFrom] = useState(null);

  const { syncAndSaveData } = useSync();
  const { currentUser, setCurrentUser, currentUserRef } = useAuth();
  const { players, setPlayers } = usePlayers();
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const onRegister = useCallback(async (t, method, cost, isResched, fromTid) => {
    try {
      if (!currentUserRef.current || !t) {
        console.warn('[TournamentContext] Registration aborted: Missing User or Tournament');
        return { success: false, message: 'Invalid registration state.' };
      }
      
      const tid = typeof t === 'object' ? t.id : t;
      const currentTournaments = useTournamentsStore.getState().tournaments;
      const tournament = currentTournaments.find(it => it.id === tid);
      
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
        currentTournaments, 
        playersRef.current, 
        currentUserRef.current,
        method,
        cost
      );
      
      if (result && result.success) {
        setTournamentsStore(result.tournaments);
        setPlayers(result.players);
        setCurrentUser(result.currentUser);
        
        console.log('[TournamentContext] State updated locally. Syncing...');
        
        if (typeof syncAndSaveData !== 'function') {
           console.error('[TournamentContext] syncAndSaveData is undefined!');
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
      Alert.alert('System Error', `Line: onRegister\nError: ${e.message}\nStack: ${e.stack?.substring(0, 100)}`);
      throw e; 
    }
  }, [setTournamentsStore, setPlayers, setCurrentUser, syncAndSaveData]);

  const onJoinWaitlist = useCallback((t) => {
    if (!currentUserRef.current || !t) return null;
    const tid = typeof t === 'object' ? t.id : t;
    const currentTournaments = useTournamentsStore.getState().tournaments;
    
    const result = TournamentService.joinWaitlist(tid, currentUserRef.current.id, currentTournaments);
    
    if (result.success) {
      setTournamentsStore(result.tournaments);
      syncAndSaveData({ tournaments: result.tournaments });
    } else {
      Alert.alert('Waitlist Error', result.message || 'Could not join waitlist.');
    }
    return result;
  }, [setTournamentsStore, syncAndSaveData]);

  const onStartTournament = useCallback((tid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.startTournament(tid, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onEndTournament = useCallback((tid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.endTournament(tid, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onAssignCoach = useCallback((tid, cid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.assignCoach(tid, cid, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [setTournamentsStore, syncAndSaveData]);

  const onRemoveCoach = useCallback((tid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.removeCoach(tid, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onApproveCoach = useCallback((coachId, status = 'approved', reason = '') => {
    const result = TournamentService.approveCoach(coachId, status, playersRef.current);
    if (result.success) {
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
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.addCoachComment(tid, currentUserRef.current.id, comment, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [setTournamentsStore, syncAndSaveData]);

  const onAddPlayer = useCallback((tid, playerName, playerPhone) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.addPlayer(tid, playerName, playerPhone, currentTournaments, playersRef.current);
    if (result.success) {
      setTournamentsStore(result.tournaments);
      syncAndSaveData({ tournaments: result.tournaments });
      Alert.alert("Success", "Player added to tournament.");
    } else {
      Alert.alert("Error", result.message || "Failed to add player.");
    }
  }, [setTournamentsStore, syncAndSaveData]);

  const onRemovePendingPlayer = useCallback((tid, pid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.removePendingPlayer(tid, pid, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onManageInterested = useCallback((tid, pid, action) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.manageInterested(tid, pid, action, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onDeclineCoachRequest = useCallback((t) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.declineCoachRequest(t.id, currentTournaments);
    setTournamentsStore(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onConfirmCoachRequest = useCallback((t) => {
    if (!currentUserRef.current) return;
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const updated = currentTournaments.map(item => 
      item.id === t.id ? { ...item, assignedCoachId: currentUserRef.current.id, coachStatus: 'Coach Confirmed' } : item
    );
    setTournamentsStore(updated);
    syncAndSaveData({ tournaments: updated });
  }, [setTournamentsStore, syncAndSaveData]);

  const onSaveTournament = useCallback((newT) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const updated = [newT, ...currentTournaments];
    setTournamentsStore(updated);
    syncAndSaveData({ tournaments: updated });
  }, [setTournamentsStore, syncAndSaveData]);

  const onUpdateTournament = useCallback((updated) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const updatedTournaments = currentTournaments.map(t => t.id === updated.id ? updated : t);
    setTournamentsStore(updatedTournaments);
    syncAndSaveData({ tournaments: updatedTournaments });
  }, [setTournamentsStore, syncAndSaveData]);

  const onDeleteTournament = useCallback((tid) => {
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const updated = currentTournaments.filter(t => t.id !== tid);
    setTournamentsStore(updated);
    syncAndSaveData({ tournaments: updated }, true);
  }, [setTournamentsStore, syncAndSaveData]);

  const onReschedule = useCallback((tournamentId) => {
    setReschedulingFrom(tournamentId);
  }, []);

  const onOptOut = useCallback((tid) => {
    if (!currentUserRef.current) return;
    const currentTournaments = useTournamentsStore.getState().tournaments;
    const result = TournamentService.optOut(tid, currentUserRef.current.id, currentTournaments, playersRef.current, currentUserRef.current);
    if (result.success) {
      setTournamentsStore(result.tournaments);
      if (result.players) setPlayers(result.players);
      if (result.currentUser) setCurrentUser(result.currentUser);
      
      syncAndSaveData({ tournaments: result.tournaments }, true);
      syncAndSaveData({ 
        players: result.players || playersRef.current,
        currentUser: result.currentUser || currentUserRef.current
      });

      Alert.alert('Success', 'You have successfully opted out of this tournament.');
    } else {
      Alert.alert('Error', result.message || 'Failed to opt out.');
    }
  }, [setTournamentsStore, setPlayers, setCurrentUser, syncAndSaveData]);

  const value = useMemo(() => ({
    setTournaments: setTournamentsStore,
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
  }), [
    setTournamentsStore, reschedulingFrom, onRegister, onOptOut, onJoinWaitlist,
    onStartTournament, onEndTournament, onAssignCoach, onRemoveCoach, onApproveCoach,
    onSaveCoachComment, onDeclineCoachRequest, onAddPlayer, onRemovePendingPlayer,
    onManageInterested, onSaveTournament, onUpdateTournament, onDeleteTournament,
    onReschedule, onConfirmCoachRequest
  ]);

  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
};
