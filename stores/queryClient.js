/**
 * 🏗️ PHASE 3: React Query Configuration & API Hooks
 * 
 * Declarative data-fetching layer that wraps the existing SyncOrchestrator
 * cloud operations. This replaces the manual loadData/checkForUpdates
 * imperative fetch logic with React Query's caching, refetching, and
 * stale-while-revalidate patterns.
 * 
 * IMPORTANT: These hooks use the SAME API endpoints, headers, and
 * authentication as SyncOrchestrator to ensure zero behavioral change.
 */
import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import config from '../config';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';

// ═══════════════════════════════════════════════════════════════
// 📡 QUERY CLIENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 30s — matches the existing SyncOrchestrator timeout
      staleTime: 30 * 1000,
      // Cache for 5 minutes — prevents redundant fetches on tab switches
      gcTime: 5 * 60 * 1000,
      // Retry with exponential backoff (matches SyncOrchestrator MAX_RETRIES=2)
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(2000 * (attemptIndex + 1), 10000),
      // Refetch on reconnect (matches SyncContext's NETWORK_RECOVERY)
      refetchOnReconnect: true,
      // Refetch when window/app returns to foreground
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔧 API FETCH HELPER
// Uses the same headers and auth as SyncOrchestrator.pushToApi
// ═══════════════════════════════════════════════════════════════
export async function apiFetch(endpoint, options = {}) {
  const cloudUrl = config.API_BASE_URL;
  const token = await syncOrchestrator.getSystemFlag('userToken');
  
  const headers = {
    'Content-Type': 'application/json',
    'x-ace-api-key': config.PUBLIC_APP_ID,
    'x-user-id': syncOrchestrator.getUserId() || 'guest',
    ...options.headers
  };

  if (token && Platform.OS !== 'web') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${cloudUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = new Error(`API Error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// 📊 QUERY KEY FACTORIES
// Centralized query key management for cache invalidation
// ═══════════════════════════════════════════════════════════════
export const queryKeys = {
  appData: ['appData'],
  players: ['players'],
  tournaments: ['tournaments'],
  matches: ['matches'],
  supportTickets: ['supportTickets'],
  evaluations: ['evaluations'],
  matchmaking: ['matchmaking'],
  chatbot: ['chatbotMessages'],
  status: ['status'],
};

// ═══════════════════════════════════════════════════════════════
// 📡 QUERY FUNCTIONS
// These mirror the existing SyncContext.loadData() flow
// ═══════════════════════════════════════════════════════════════

/**
 * Fetches the full app data blob from /api/data.
 * This is the same endpoint SyncContext.loadData() uses.
 */
export async function fetchAppData() {
  // Flush pending pushes before pulling (matches FLUSH_BEFORE_PULL guard)
  await syncOrchestrator.flushPendingPush();
  
  const data = await apiFetch(config.getEndpoint('DATA_SYNC'));
  
  if (data) {
    // Sync to local storage via SyncOrchestrator (maintains parity with existing flow)
    await syncOrchestrator.syncAndSaveData(data, false, true);
  }
  
  return data;
}

/**
 * Fetches the lightweight status endpoint for version checking.
 * Mirrors SyncContext.checkForUpdates().
 */
export async function fetchStatus() {
  return apiFetch(config.getEndpoint('STATUS'));
}

/**
 * Mutation function for saving data to the cloud.
 * Wraps SyncOrchestrator.syncAndSaveData() to maintain all existing
 * guards (thinning, identity sync, debouncing, conflict resolution).
 */
export async function saveData({ updates, isAtomic = false }) {
  await syncOrchestrator.syncAndSaveData(updates, isAtomic, false);
  return { success: true };
}
