/**
 * 🛡️ AUDIT SERVICE
 * Extracted from server.mjs (Monolithic Refactoring Phase 1)
 * 
 * Handles:
 * - Security event logging (logAudit)
 * - Critical event alerts
 * - AI aggregation for security summaries
 * - Server diagnostic logging (logServerEvent)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuditLog, SecuritySummary } from '../models/index.mjs';
import { getIPReputation, createSecurityAlertSender } from './SecurityAlertService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// We need to resolve the diagnostics dir relative to this file (which is in services/)
const DIAGNOSTICS_DIR = path.join(__dirname, '..', 'diagnostics');

// Initialize the alert sender
const sendSecurityAlert = createSecurityAlertSender();

/**
 * Main security audit logger and alert aggregator
 */
export const getClientIp = (req) => {
  if (!req) return '0.0.0.0';
  let ip = req.headers && req.headers['x-forwarded-for'];
  if (ip) {
    ip = ip.split(',')[0].trim();
  } else {
    ip = req.ip || (req.connection && req.connection.remoteAddress) || '0.0.0.0';
  }
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip;
};

export const logAudit = async (req, action, changedCollections = [], details = {}) => {
  try {
    const ip = getClientIp(req);
    
    await AuditLog.create({
      userId: (req && req.headers && req.headers['x-user-id']) || ip || 'system',
      action,
      changedCollections,
      ipAddress: ip,
      userAgent: (req && req.headers && req.headers['user-agent']) || 'unknown',
      details
    });

    // 🚨 Real-time Alert for Critical Events (v2.6.195)
    // 🛡️ [PRODUCTION HARDENING] (v2.6.327): Demoted noisy route blocks to batch-only aggregation
    const criticalEvents = ['OTP_BRUTE_FORCE_DETECTED', 'ADMIN_PRIVILEGE_ESCALATION', 'SENSITIVE_ACCESS_ATTEMPT', 'BRUTE_FORCE_DETECTED'];
    const aggregationEvents = [...criticalEvents, 'UNAUTHORIZED_ACCESS_BLOCKED', 'HARD_ROUTE_BLOCK', 'LOGIN_SUCCESS', 'SUPPORT_LOGIN_SUCCESS'];

    if (aggregationEvents.includes(action)) {
      let actor = (req && req.headers && req.headers['x-user-id']) || (req && req.user && req.user.id);
      
      // 🛡️ [ACTOR INFERENCE] (v2.6.209)
      if ((!actor || actor === 'guest') && ip !== '0.0.0.0') {
        try {
          const lastSession = await AuditLog.findOne({
            ipAddress: ip,
            action: { $in: ['LOGIN_SUCCESS', 'SUPPORT_LOGIN_SUCCESS'] },
            timestamp: { $gt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
          }).sort({ timestamp: -1 }).lean();
          
          if (lastSession) {
            const inferredId = lastSession.details?.userId || lastSession.userId;
            if (inferredId && inferredId !== ip && inferredId !== 'guest') {
              actor = `${inferredId} (Inferred)`;
            }
          }
        } catch (e) {
          console.error("Actor inference failed:", e.message);
        }
      }
      
      actor = actor || 'guest';
      const url = (req && (req.originalUrl || req.url)) || 'Unknown';
      const method = (req && req.method) || 'Unknown';

      // 🛡️ [AI AGGREGATION] (v2.6.195)
      let summary = await SecuritySummary.findOne({
        ipAddress: ip,
        actor: actor,
        isSummarized: false,
        firstEventAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) }
      });

      if (summary) {
        summary.events.push({ action, url, method, details });
        summary.lastEventAt = new Date();
        await summary.save();
      } else {
        await SecuritySummary.create({
          ipAddress: ip,
          userId: (req && req.headers && req.headers['x-user-id']) || (req && req.user && req.user.id) || actor,
          actor: actor,
          events: [{ action, url, method, details }]
        });
      }

      // Only send individual Slack alerts for CRITICAL events
      if (criticalEvents.includes(action)) {
        // 🛡️ [LOCAL_BYPASS] (v2.6.258)
        const isLocal = (ip) => {
          if (!ip) return false;
          if (process.env.NODE_ENV === 'production') return false; 
          return ip === '127.0.0.1' || 
                 ip === '::1' || 
                 ip.includes('127.0.0.1') || 
                 ip.includes('192.168.') || 
                 ip.includes('10.') || 
                 ip.startsWith('172.') || 
                 ip === 'localhost' ||
                 ip === '::ffff:127.0.0.1';
        };
        
        if (isLocal(ip) && process.env.NODE_ENV !== 'production' && process.env.TEST_ALERTS_LOCALLY !== 'true') {
          console.log(`[AUTH] Local critical event detected (${action}) from ${ip}. Alert suppressed.`);
        } else {
          const osint = await getIPReputation(ip);
          await sendSecurityAlert(action, {
            IP: ip,
            Actor: actor,
            URL: url,
            Method: method,
            'User-Agent': (req && req.headers && req.headers['user-agent']) || 'unknown',
            Payload: JSON.stringify(req.body || {}),
            OSINT: osint,
            ...details 
          });
        }
      }
    }
  } catch (e) {
    console.error("❌ Audit log error:", e.message);
  }
};

/**
 * Server diagnostics logger (JSONL format)
 */
export const logServerEvent = async (action, details = {}) => {
  try {
    if (!fs.existsSync(DIAGNOSTICS_DIR)) {
       fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    }
    const logFile = path.join(DIAGNOSTICS_DIR, 'server_events.jsonl'); // 🛡️ Switched to JSONL (v2.6.48)
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), action, ...details }) + '\n';
    await fs.promises.appendFile(logFile, entry);
    console.log(`📡 [Server Log] ${action}:`, details);
  } catch (e) {
    console.error("❌ Failed to write server log:", e.message);
  }
};

// Export the singleton sender so other modules can use the same configured sender
export { sendSecurityAlert };
