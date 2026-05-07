import storage from '../../utils/storage';

class QueueService {
  private pendingSync: string[] = [];
  private pendingSyncUpdates: Record<string, any> = {};

  // 🏗️ Phase A-2: Fast structural hash for deep comparison.
  public fastHash(obj: any): number {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let hash = 0;
    const len = Math.min(str.length, 50000);
    for (let i = 0; i < len; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i) | 0;
    }
    hash = ((hash << 5) - hash) + str.length | 0;
    return hash;
  }

  public async hydrate() {
    const savedPending = await storage.getItem('pendingSync');
    if (Array.isArray(savedPending)) {
      this.pendingSync = savedPending;
    }
  }

  public getPendingSync(): string[] {
    return this.pendingSync;
  }

  public getPendingUpdates(): Record<string, any> {
    return this.pendingSyncUpdates;
  }

  public async setPendingUpdates(keys: string[], updates: Record<string, any>) {
    keys.forEach(k => {
      if (!this.pendingSync.includes(k)) this.pendingSync.push(k);
    });
    Object.assign(this.pendingSyncUpdates, updates);
    await storage.setItem('pendingSync', this.pendingSync);
  }

  public async clearPending() {
    this.pendingSync = [];
    this.pendingSyncUpdates = {};
    await storage.setItem('pendingSync', []);
  }

  public async restorePending(keys: string[], updates: Record<string, any>) {
    Object.assign(this.pendingSyncUpdates, updates);
    this.pendingSync = keys;
    await storage.setItem('pendingSync', keys);
  }
}

export const queueService = new QueueService();
