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

  const onRegister = useCallback((t, method, cost, isResched, fromTid) => {
    if (!currentUserRef.current || !t) return null;
    const tid = typeof t === 'object' ? t.id : t;
    const tournament = tournamentsRef.current.find(it => it.id === tid);
    
    if (!tournament) {
      console.warn('[TournamentContext] Registration target not found:', tid);
      return null;
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
    
    if (result.success) {
      setTournaments(result.tournaments);
      setPlayers(result.players);
      setCurrentUser(result.currentUser);
      
      // 🛡️ [SYNC GUARD] (v2.6.309): Atomic save for tournaments/players/currentUser
      syncAndSaveData({ 
        tournaments: result.tournaments, 
        players: result.players, 
        currentUser: result.currentUser 
      });

      if (result.type === 'UPI_PENDING') {
        // No alert here, handled by ExploreScreen for better UI flow
      } else if (result.referralBonus > 0) {
        Alert.alert('Referral Bonus!', `You earned ₹${result.referralBonus} for your first tournament registration!`);
      }
    } else {
      Alert.alert('Registration Failed', result.message || 'Could not complete registration.');
    }
    return result;
  }, [currentUser, setTournaments, setPlayers, setCurrentUser, syncAndSaveData]);

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
    const result = TournamentService.startTournament(tid, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

  const onEndTournament = useCallback((tid) => {
    const result = TournamentService.endTournament(tid, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

  const onAssignCoach = useCallback((tid, cid) => {
    const result = TournamentService.assignCoach(tid, cid, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [tournaments, syncAndSaveData]);

  const onRemoveCoach = useCallback((tid) => {
    const result = TournamentService.removeCoach(tid, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

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
    const result = TournamentService.addCoachComment(tid, currentUserRef.current.id, comment, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments });
  }, [tournaments, syncAndSaveData]);

  const onAddPlayer = useCallback((tid, playerName, playerPhone) => {
    const result = TournamentService.addPlayer(tid, playerName, playerPhone, tournaments, players);
    if (result.success) {
      setTournaments(result.tournaments);
      syncAndSaveData({ tournaments: result.tournaments });
      Alert.alert("Success", "Player added to tournament.");
    } else {
      Alert.alert("Error", result.message || "Failed to add player.");
    }
  }, [tournaments, players, syncAndSaveData]);

  const onRemovePendingPlayer = useCallback((tid, pid) => {
    const result = TournamentService.removePendingPlayer(tid, pid, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

  const onManageInterested = useCallback((tid, pid, action) => {
    const result = TournamentService.manageInterested(tid, pid, action, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

  const onDeclineCoachRequest = useCallback((t) => {
    const result = TournamentService.declineCoachRequest(t.id, tournaments);
    setTournaments(result.tournaments);
    syncAndSaveData({ tournaments: result.tournaments }, true);
  }, [tournaments, syncAndSaveData]);

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
      
      // 🛡️ [FIX v2.6.121] Atomic push to prevent opt-out from being overwritten by stale cloud pull
      syncAndSaveData({ 
        tournaments: result.tournaments,
        players: result.players || playersRef.current,
        currentUser: result.currentUser || currentUserRef.current
      }, true);

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
