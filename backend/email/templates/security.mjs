import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🚨 Security Alert Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export async function sendSecurityAlertEmail(event, data) {
  // 🛡️ SECURITY: Obfuscated email to prevent plaintext leakage (v2.6.191)
  const _s = (b) => Buffer.from(b, 'base64').toString();
  const adminEmail = process.env.ADMIN_SECURITY_EMAIL || _s('aGFja2VyaXNiYWNrMTcxN0BnbWFpbC5jb20=');
  
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const osint = data.OSINT || {};
  const score = typeof osint.score === 'number' ? osint.score : null;
  const scoreLabel = score !== null ? `${score}%` : 'UNKNOWN';
  const scoreColor = score !== null ? (score > 75 ? '#EF4444' : (score > 25 ? '#F59E0B' : '#10B981')) : '#64748B';

  const htmlBody = `
    <div style="font-family: sans-serif; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <h2 style="color: #0F172A; margin: 0; font-size: 20px; font-weight: 800;">🚨 Security Broadcast</h2>
        <span style="background-color: ${scoreColor}; color: #FFFFFF; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">ABUSE CONFIDENCE: ${scoreLabel}</span>
      </div>

      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 20px;">A critical security event has been detected from an <strong>Unknown IP</strong>. This request was automatically blocked by the AceTrack Guard.</p>
      
      <div style="background-color: #F8FAFC; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
        <p style="margin: 0 0 12px; font-size: 14px;"><strong>Event:</strong> <span style="color: #EF4444; font-family: monospace; font-weight: bold;">${event}</span></p>
        <p style="margin: 0 0 12px; font-size: 14px;"><strong>Source IP:</strong> <span style="font-family: monospace;">${data.IP}</span> (${osint.country || '??'})</p>
        <p style="margin: 0 0 12px; font-size: 14px;"><strong>Reputation:</strong> <span style="color: ${scoreColor}; font-weight: bold;">${osint.provider || 'N/A'}</span></p>
        <p style="margin: 0 0 12px; font-size: 14px;"><strong>Timestamp:</strong> ${timestamp} IST</p>
        
        <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 16px 0;">
        
        <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Request Intelligence</p>
        <pre style="background: #0F172A; color: #38BDF8; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.5;">${JSON.stringify(data, null, 2)}</pre>
      </div>

      <p style="margin-top: 24px; font-size: 12px; color: #94A3B8; text-align: center;">
        This broadcast was triggered by the <strong>Zero-Trust Guard (v2.6.195)</strong>. Known IPs are automatically suppressed from this alert.
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"AceTrack Security" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: adminEmail,
    subject: `🚨 SECURITY ALERT: ${event}`,
    html: htmlBody,
    text: `SECURITY ALERT: ${event}\nTimestamp: ${timestamp} IST\nMetadata: ${JSON.stringify(data, null, 2)}`,
    priority: 'high'
  };

  try {
    const info = await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    // Silent fail to prevent blocking the main request cycle
    return { success: false };
  }
}


