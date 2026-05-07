import logger from '../../utils/logger';

export interface SyncMetrics {
  invalidPayloadCount: number;
  staleUpdateCount: number;
  noOpSkippedCount: number;
  successfulUpdateCount: number;
  tamperDetectedCount: number;
  anomalyDetectedCount: number;
  pushAttemptCount: number;
  pushFailureCount: number;
  rateLimitCount: number;
  conflictCount: number;
  lastSyncSuccess: string | null;
}

export interface Incident {
  type: string;
  message: string;
  timestamp: string;
}

class TelemetryService {
  private metrics: SyncMetrics = {
    invalidPayloadCount: 0,
    staleUpdateCount: 0,
    noOpSkippedCount: 0,
    successfulUpdateCount: 0,
    tamperDetectedCount: 0,
    anomalyDetectedCount: 0,
    pushAttemptCount: 0,
    pushFailureCount: 0,
    rateLimitCount: 0,
    conflictCount: 0,
    lastSyncSuccess: null,
  };
  private incidentHistory: Incident[] = [];
  private syncWatchdog: any = null;

  public getMetrics(): SyncMetrics {
    return this.metrics;
  }

  public getIncidentHistory(): Incident[] {
    return this.incidentHistory;
  }

  public trackMetric(key: keyof SyncMetrics, count: number = 1) {
    if (typeof this.metrics[key] === 'number') {
      (this.metrics as any)[key] += count;
    } else if (key === 'lastSyncSuccess') {
      this.metrics.lastSyncSuccess = new Date().toISOString();
    }
  }

  public trackIncident(type: string, message: string) {
    const timestamp = new Date().toISOString();
    this.incidentHistory.unshift({ type, message, timestamp });
    if (this.incidentHistory.length > 10) {
      this.incidentHistory.pop();
    }
    logger.logAction(`SYNC_INCIDENT_${type.toUpperCase()}`, { message });
  }

  public startWatchdog(label: string, timeoutMs: number, onTrigger: () => void) {
    if (this.syncWatchdog) clearTimeout(this.syncWatchdog);
    this.syncWatchdog = setTimeout(() => {
      console.warn(`[TelemetryService] 🛡️ WATCHDOG TRIGGERED: Forcing sync reset after ${timeoutMs/1000}s hang [STUCK_OP: ${label}]`);
      this.trackIncident('watchdog', `Stuck operation: ${label}`);
      onTrigger();
    }, timeoutMs);
  }

  public clearWatchdog() {
    if (this.syncWatchdog) {
      clearTimeout(this.syncWatchdog);
      this.syncWatchdog = null;
    }
  }
}

export const telemetryService = new TelemetryService();
