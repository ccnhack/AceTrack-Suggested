/**
 * 🏗️ PHASE 3: React Query Configuration & API Hooks
 * 
 * Declarative data-fetching layer that wraps the existing SyncManager
 * cloud operations. This replaces the manual loadData/checkForUpdates
 * imperative fetch logic with React Query's caching, refetching, and
 * stale-while-revalidate patterns.
 * 
 * IMPORTANT: These hooks use the SAME API endpoints, headers, and
 * authentication as SyncManager to ensure zero behavioral change.
 */
import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import config from '../config';
import { syncManager } from '../services/SyncManager';

// ═══════════════════════════════════════════════════════════════
// 📡 QUERY CLIENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 30s — matches the existing SyncManager timeout
      staleTime: 30 * 1000,
      // Cache for 5 minutes — prevents redundant fetches on tab switches
      gcTime: 5 * 60 * 1000,
      // Retry with exponential backoff (matches SyncManager MAX_RETRIES=2)
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
// Uses the same headers and auth as SyncManager.pushToApi
// ═══════════════════════════════════════════════════════════════
export async function apiFetch(endpoint, options = {}) {
  const cloudUrl = config.API_BASE_URL;
  const token = await syncManager.getSystemFlag('userToken');
  
  const headers = {
    'Content-Type': 'application/json',
    'x-ace-api-key': config.PUBLIC_APP_ID,
    'x-user-id': syncManager.getUserId() || 'guest',
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
  await syncManager.flushPendingPush();
  
  const data = await apiFetch(config.getEndpoint('DATA_SYNC'));
  
  if (data) {
    // Sync to local storage via SyncManager (maintains parity with existing flow)
    await syncManager.syncAndSaveData(data, false, true);
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
 * Wraps SyncManager.syncAndSaveData() to maintain all existing
 * guards (thinning, identity sync, debouncing, conflict resolution).
 */
export async function saveData({ updates, isAtomic = false }) {
  await syncManager.syncAndSaveData(updates, isAtomic, false);
  return { success: true };
}
