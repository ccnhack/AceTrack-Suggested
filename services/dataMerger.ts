import { thinPlayers, capPlayerDetail } from '../utils/storage';

/**
 * PURE DATA MERGER (Phase 0.3)
 * Logic for deterministic merging of cloud and local state.
 * Rules: 
 * - No side effects.
 * - No mutations.
 * - Cloud-wins by default for collections.
 * - Local-wins/Union for specific metadata (Badge history).
 */

export interface MergeResult<T> {
  result: T;
  meta: {
    winner: 'cloud' | 'local' | 'merged';
    conflictsResolved: boolean;
    fieldsChanged: string[];
  };
}

export const dataMerger = {
  /**
   * Orchestrates the full state merge.
   */
  mergeData(localData: any = {}, cloudData: any = {}): MergeResult<any> {
    const fieldsChanged: string[] = [];
    const mergedResult: any = { ...cloudData }; // Start with cloud as priority

    // 1. Merge Collections (ID-based, Cloud priority)
    const collections = ['tournaments', 'matchVideos', 'matches', 'evaluations', 'auditLogs', 'matchmaking'];
    collections.forEach(key => {
      if (localData[key] || cloudData[key]) {
        mergedResult[key] = this.mergeCollection(localData[key] || [], cloudData[key] || []);
        fieldsChanged.push(key);
      }
    });

    // 1.5 Support Ticket Specialized Merge (v2.6.221)
    if (localData.supportTickets || cloudData.supportTickets) {
      mergedResult.supportTickets = this.mergeSupportTickets(localData.supportTickets || [], cloudData.supportTickets || []);
      fieldsChanged.push('supportTickets');
    }

    // 2. Specialized Player Merge (Thinning required)
    if (localData.players || cloudData.players) {
      mergedResult.players = this.mergePlayers(localData.players || [], cloudData.players || []);
      fieldsChanged.push('players');
    }

    // 3. Specialized User Merge (Badge history preservation)
    // 🛡️ [PERFORMANCE] (v2.6.319): Dead code removed. Server explicitly deletes currentUser from sync payloads.
    /*
    if (localData.currentUser || cloudData.currentUser) {
      mergedResult.currentUser = this.mergeCurrentUser(localData.currentUser, cloudData.currentUser);
      fieldsChanged.push('currentUser');
    }
    */

    // 4. Merge static keys
    const staticKeys = ['isCloudOnline', 'isUsingCloud', 'seenAdminActionIds', 'visitedAdminSubTabs'];
    staticKeys.forEach(key => {
        if (key === 'seenAdminActionIds' || key === 'visitedAdminSubTabs') {
            mergedResult[key] = this.mergeHistorySets(localData[key], cloudData[key]);
        } else if (cloudData[key] !== undefined) {
            mergedResult[key] = cloudData[key];
        } else {
            mergedResult[key] = localData[key];
        }
    });

    return {
      result: mergedResult,
      meta: {
        winner: 'merged',
        conflictsResolved: fieldsChanged.length > 0,
        fieldsChanged
      }
    };
  },

  /**
   * ID-based collection merger. Cloud entries replace local entries with same ID.
   * New local entries are preserved.
   */
  mergeCollection(local: any[], cloud: any[], idField: string = 'id'): any[] {
    const cloudMap = new Map(cloud.map(item => [item[idField], item]));
    const merged = [...cloud]; // Start with all cloud items
    
    // Add local items that aren't in cloud
    local.forEach(item => {
      if (!item || !item[idField]) return;
      if (!cloudMap.has(item[idField])) {
        merged.push(item);
      }
    });

    // Final sort/filter logic (e.g., newest first for specific types)
    return merged.filter(item => !!item);
  },

  /**
   * Player-specific merge with mandatory thinning.
   */
  mergePlayers(local: any[], cloud: any[]): any[] {
    const rawMerged = this.mergeCollection(local, cloud);
    // Mandatory cleanup: filter invalid and thin for storage
    const cleaned = rawMerged.filter(p => !!(p && p.id));
    return thinPlayers(cleaned);
  },

  /**
   * Merges the current user object, preserving local-only session state 
   * (like specific UI flags) while taking cloud business data.
   */
  mergeCurrentUser(local: any, cloud: any): any {
    if (!cloud) return capPlayerDetail(local);
    if (!local) return capPlayerDetail(cloud);

    // Cloud wins for profile, but local wins for specialized lists (Badges)
    const merged = {
      ...local,
      ...cloud,
      seenAdminActionIds: this.mergeHistorySets(local.seenAdminActionIds, cloud.seenAdminActionIds),
      visitedAdminSubTabs: this.mergeHistorySets(local.visitedAdminSubTabs, cloud.visitedAdminSubTabs)
    };

    return capPlayerDetail(merged);
  },

  /**
   * Merges history sets (Badge IDs, etc) using a Union strategy.
   */
  mergeHistorySets(local: any, cloud: any): string[] {
    const localArr = Array.isArray(local) ? local : [];
    const cloudArr = Array.isArray(cloud) ? cloud : [];
    
    const combined = new Set([...localArr, ...cloudArr].map(String).filter(id => !!id && id !== 'undefined' && id !== 'null'));
    return Array.from(combined);
  },

  /**
   * Specialized Support Ticket Merge (v2.6.221)
   * Prevents "Seen" status from being lost during cloud sync and 
   * implements updatedAt-based metadata reconciliation.
   */
  mergeSupportTickets(local: any[], cloud: any[]): any[] {
    const cloudMap = new Map(cloud.map(item => [item.id, item]));
    const localMap = new Map(local.map(item => [item.id, item]));
    
    const allIds = new Set([...cloudMap.keys(), ...localMap.keys()]);
    const merged: any[] = [];

    allIds.forEach(id => {
      const localTicket = localMap.get(id);
      const cloudTicket = cloudMap.get(id);

      if (localTicket && cloudTicket) {
        // Start with cloud as baseline
        const mergedTicket = { ...cloudTicket };
        
        // 1. Message Status Synchronization (Seen > Delivered > Sent)
        const localMsgs = localTicket.messages || [];
        const cloudMsgs = cloudTicket.messages || [];
        const msgMap = new Map(cloudMsgs.map((m: any) => [m.id, m]));
        
        localMsgs.forEach((lm: any) => {
          if (msgMap.has(lm.id)) {
            const cm = msgMap.get(lm.id);
            // 🛡️ [SEEN PERSISTENCE] If local knows it's seen, cloud shouldn't downgrade it
            if (lm.status === 'seen' && (cm as any).status !== 'seen') {
              msgMap.set(lm.id, { ...(cm as any), status: 'seen' });
            }
          } else {
            // 🛡️ [LOCAL PRESERVATION] New local message (not yet in cloud) - add to the map
            msgMap.set(lm.id, lm);
          }
        });
        
        // Re-assemble and sort messages
        mergedTicket.messages = Array.from(msgMap.values()).sort((a: any, b: any) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // 2. Metadata Reconciliation (Newest wins for Status/Assignee)
        const localUpdate = new Date(localTicket.updatedAt || 0).getTime();
        const cloudUpdate = new Date(cloudTicket.updatedAt || 0).getTime();
        
        if (localUpdate > cloudUpdate) {
          mergedTicket.status = localTicket.status;
          mergedTicket.assignedTo = localTicket.assignedTo;
          mergedTicket.updatedAt = localTicket.updatedAt;
          mergedTicket.lastMessageAt = localTicket.lastMessageAt;
        }

        merged.push(mergedTicket);
      } else {
        // Only exists in one source
        merged.push(cloudTicket || localTicket);
      }
    });

    return merged.filter(t => !!t);
  }
};
