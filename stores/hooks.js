/**
 * 🏗️ PHASE 3: React Query Hooks
 * 
 * Custom hooks for data fetching that components can gradually
 * adopt instead of importing from legacy contexts.
 * 
 * Usage:
 *   // Old way (still works):
 *   const { players } = usePlayers();
 *   
 *   // New way (Phase 3):
 *   import { usePlayersQuery } from '../stores/hooks';
 *   const { data: players, isLoading } = usePlayersQuery();
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, fetchAppData, fetchStatus, saveData } from './queryClient';
import { usePlayersStore, useTournamentsStore, useSupportStore, useMatchmakingStore, useEvaluationsStore } from './index';

// ═══════════════════════════════════════════════════════════════
// 📡 FULL APP DATA QUERY
// Replaces SyncContext.loadData() for components that need
// the entire state blob (e.g., initial boot, admin dashboard)
// ═══════════════════════════════════════════════════════════════
export function useAppDataQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.appData,
    queryFn: fetchAppData,
    staleTime: 30 * 1000,
    ...options
  });
}

// ═══════════════════════════════════════════════════════════════
// 📊 ENTITY-SPECIFIC QUERIES
// These read from Zustand stores (which are fed by EventBus).
// The useQuery wrapper adds loading/error states and refetch.
// ═══════════════════════════════════════════════════════════════

/**
 * Players query — reads from the Zustand store which is
 * already subscribed to EventBus 'ENTITY_UPDATED' events.
 */
export function usePlayersQuery() {
  const { players, hydrate } = usePlayersStore();
  
  return useQuery({
    queryKey: queryKeys.players,
    queryFn: async () => {
      await hydrate();
      return usePlayersStore.getState().players;
    },
    initialData: players,
    staleTime: 60 * 1000, // Players change less frequently
  });
}

/**
 * Tournaments query
 */
export function useTournamentsQuery() {
  const { tournaments, hydrate } = useTournamentsStore();
  
  return useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: async () => {
      await hydrate();
      return useTournamentsStore.getState().tournaments;
    },
    initialData: tournaments,
    staleTime: 30 * 1000,
  });
}

/**
 * Support tickets query
 */
export function useSupportTicketsQuery() {
  const { supportTickets, hydrate } = useSupportStore();
  
  return useQuery({
    queryKey: queryKeys.supportTickets,
    queryFn: async () => {
      await hydrate();
      return useSupportStore.getState().supportTickets;
    },
    initialData: supportTickets,
    staleTime: 10 * 1000, // Tickets need high freshness
  });
}

/**
 * Matchmaking query
 */
export function useMatchmakingQuery() {
  const { matchmaking, hydrate } = useMatchmakingStore();
  
  return useQuery({
    queryKey: queryKeys.matchmaking,
    queryFn: async () => {
      await hydrate();
      return useMatchmakingStore.getState().matchmaking;
    },
    initialData: matchmaking,
    staleTime: 30 * 1000,
  });
}

/**
 * Evaluations query
 */
export function useEvaluationsQuery() {
  const { evaluations, hydrate } = useEvaluationsStore();
  
  return useQuery({
    queryKey: queryKeys.evaluations,
    queryFn: async () => {
      await hydrate();
      return useEvaluationsStore.getState().evaluations;
    },
    initialData: evaluations,
    staleTime: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 📡 STATUS QUERY
// Replaces SyncContext.checkForUpdates() periodic polling
// ═══════════════════════════════════════════════════════════════
export function useStatusQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: fetchStatus,
    // Poll every 2 minutes (matches existing PERIODIC_VERSION_CHECK interval)
    refetchInterval: 120 * 1000,
    staleTime: 10 * 1000,
    ...options
  });
}

// ═══════════════════════════════════════════════════════════════
// 🔄 SYNC MUTATION
// Wraps SyncManager.syncAndSaveData() with optimistic updates
// ═══════════════════════════════════════════════════════════════
export function useSyncMutation() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: saveData,
    onSuccess: () => {
      // Invalidate all entity queries to trigger refetch
      qc.invalidateQueries({ queryKey: queryKeys.appData });
    },
    onError: (error) => {
      console.error('[useSyncMutation] Save failed:', error);
    }
  });
}
