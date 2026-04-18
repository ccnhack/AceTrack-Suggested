import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { eventBus } from './EventBus';

/**
 * CONNECTIVITY SERVICE (Phase 0.5)
 * Centralized tracking of network state.
 */

class ConnectivityService {
  private static instance: ConnectivityService;
  private isOnline: boolean = true;
  private connectionType: string = 'unknown';
  private lastSyncTime: number = 0;
  private forceOffline: boolean = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): ConnectivityService {
    if (!ConnectivityService.instance) {
      ConnectivityService.instance = new ConnectivityService();
    }
    return ConnectivityService.instance;
  }

  private init() {
    // Subscribe to network state changes
    NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = this.isOnline;
      this.isOnline = !!state.isConnected && !!state.isInternetReachable;
      this.connectionType = state.type;

      if (wasOnline !== this.isOnline) {
        console.log(`[Connectivity] Status changed: ${this.isOnline ? 'ONLINE' : 'OFFLINE'} (${this.connectionType})`);
        this.emitStatus();
      }
    });

    // Initial check
    NetInfo.fetch().then(state => {
      this.isOnline = !!state.isConnected;
      this.connectionType = state.type;
    });
  }

  public setForceOffline(val: boolean) {
    this.forceOffline = val;
    this.emitStatus();
  }

  private emitStatus() {
    const finalOnline = this.forceOffline ? false : this.isOnline;
    eventBus.emit('CONNECTIVITY_CHANGED', { 
        isOnline: finalOnline, 
        connectionType: this.connectionType 
    });
  }

  public getStatus() {
    return {
      isOnline: this.isOnline,
      connectionType: this.connectionType,
      lastSyncTime: this.lastSyncTime
    };
  }

  public updateLastSyncTime() {
    this.lastSyncTime = Date.now();
  }

  public checkConnection(): Promise<boolean> {
    return NetInfo.fetch().then(state => !!state.isConnected);
  }
}

export const connectivityService = ConnectivityService.getInstance();
