import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AppState, AuditLog, SupportInvite, Player, SupportTicket } from '../models/index.mjs';
import { asyncHandler, getISTTimestamp, getISTDate } from '../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';
import {
  sendOnboardingEmail,
  buildOnboardingHtml,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail
} from '../emailService.mjs';

// 🏗️ PHASE 1 (DATABASE) MIGRATION HELPER
// Ensures that direct backend state mutations are immediately synced to distinct collections
async function syncCollectionsFromState(state) {
    const upsertEntities = async (Model, entities) => {
       if (!entities || entities.length === 0) return;
       const bulkOps = entities.map(entity => {
          const entityId = String(entity.id || entity._id || Math.random().toString(36).substring(7));
          return {
             updateOne: { filter: { id: entityId }, update: { $set: { id: entityId, data: entity, lastUpdated: new Date() } }, upsert: true }
          };
       });
       if (bulkOps.length > 0) await Model.bulkWrite(bulkOps);
    };
    await Promise.all([
      upsertEntities(Player, state?.data?.players),
      upsertEntities(SupportTicket, state?.data?.supportTickets)
    ]);
}

export default function createSupportRoutes({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions
}) {
  const router = express.Router();

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/otp/send', otpLimiter, apiKeyGuard, (req, res) => {
  const { target, type } = req.body; // target is email/phone, type is 'email' or 'phone'
  console.log(`🔑 [OTP_SIMULATION] Code "123456" requested for ${type}: ${target}`);
  logServerEvent('OTP_SEND_REQUESTED', { target, type });
  res.json({ success: true, message: `Verification code sent to ${target}` });
});

// 🔐 OTP: Verify code (Hardcoded to 123456)
router.post('/otp/verify', otpLimiter, apiKeyGuard, (req, res) => {
  const { code, target, type } = req.body;
  
  if (code === '123456') {
    logServerEvent('OTP_VERIFY_SUCCESS', { target, type });
    return res.json({ success: true, message: 'Verification successful' });
  }
  
  logServerEvent('OTP_VERIFY_FAILED', { target, type, code });
  res.status(400).json({ success: false, error: 'Invalid verification code' });
});

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT HUB INVITES: Secure Onboarding Tracking
// ═══════════════════════════════════════════════════════════════

// 1. Generate Invite Link (Admin Only)
router.post('/support/invite', apiKeyGuard, asyncHandler(async (req, res) => {
  const { email, firstName, lastName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name are required' });
  
  // In production, enforce 'admin' role header, simulating strict RBAC
  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  // 🛡️ Double-Provisioning Guard: Check for any existing active links for this email
  const activeInvite = await SupportInvite.findOne({ 
    email, 
    status: { $in: ['Pending', 'Clicked'] }, 
    expiresAt: { $gt: new Date() } 
  });

  if (activeInvite) {
    return res.status(409).json({ 
      error: 'Email already has an active provisioning link.',
      message: 'Kindly resend the invitation or retire the current link to provision again.'
    });
  }

  // 🛡️ SCALABILITY FIX (v2.6.316): Employee-Exists Guard reads from Player collection
  const existingPlayerDocs = await Player.find().lean();
  const existingPlayers = existingPlayerDocs.map(d => d.data);
  const existingEmployee = existingPlayers.find(p =>
    p.role === 'support' && p.email?.toLowerCase() === email.toLowerCase().trim()
  );
  if (existingEmployee && existingEmployee.supportStatus !== 'terminated') {
    return res.status(422).json({
      error: 'Employee Already Exists',
      message: `The email ${email} is already associated with an active support employee (${existingEmployee.name || existingEmployee.firstName + ' ' + existingEmployee.lastName}). Use the Support tab to manage their account.`,
      employeeName: existingEmployee.name || `${existingEmployee.firstName} ${existingEmployee.lastName}`
    });
  }

  const token = bcrypt.hashSync(Date.now().toString() + email, 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // strict 24 hours

  await SupportInvite.create({ email, firstName: firstName.trim(), lastName: lastName.trim(), token, expiresAt });
  await logServerEvent('SUPPORT_INVITE_GENERATED', { email, firstName, lastName });

  const setupLink = `https://acetrack-suggested.onrender.com/setup/${token}`;

  // 📧 Send onboarding email (non-blocking — invite succeeds even if email fails)
  let emailStatus = { success: false, error: 'Email service not configured' };
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    emailStatus = await sendOnboardingEmail(email, setupLink, expiresAt.toISOString(), firstName.trim(), lastName.trim());
  } else {
    console.warn('⚠️ GMAIL_USER / GMAIL_APP_PASSWORD not set. Skipping onboarding email.');
  }

  res.json({ success: true, token, expiresAt, link: setupLink, emailSent: emailStatus.success });
}));

// 1b. Email Preview (Admin Debug — view the onboarding email in browser)
router.get('/support/invite/preview', (req, res) => {
  const sampleLink = 'https://acetrack-suggested.onrender.com/setup/SAMPLE_TOKEN_PREVIEW';
  const expiryFormatted = new Date(Date.now() + 24*60*60*1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const html = buildOnboardingHtml('John Doe', 'john.doe@acetrack.com', sampleLink, expiryFormatted);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// 2. Fetch All Invites (Admin only)
router.get('/support/invites', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const invites = await SupportInvite.find().sort({ createdAt: -1 });
  
  // Auto-mark expired links lazily for the response
  const processed = invites.map(inv => {
     let currentStatus = inv.status;
      if ((currentStatus === 'Pending' || currentStatus === 'Clicked') && inv.expiresAt < new Date()) currentStatus = 'Expired';
     return { ...inv.toObject(), status: currentStatus };
  });

  res.json({ success: true, invites: processed });
}));

// 2a. Retire/Expire Invite (Manual Action)
router.post('/support/invite/expire', apiKeyGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });

  invite.status = 'Retired';
  invite.retiredAt = new Date(); // Store the exact retirement time (v2.6.259)
  
  // Use a special action to track manual retirement
  invite.clicks.push({ 
    action: 'admin_retired', 
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: 'Admin Hub',
    timestamp: new Date()
  });
  
  await invite.save();
  await logServerEvent('SUPPORT_INVITE_RETIRED', { email: invite.email, token });

  res.json({ success: true, message: 'Invite link has been retired and is no longer accessible.' });
}));

// 2b. Resend Onboarding Email (Rate Limited: 3 per invite, 1min cooldown, 4hr lockout)
router.post('/support/invite/resend', apiKeyGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });

  const resends = invite.emailResends || [];
  const now = Date.now();

  // Check if 3 resends exhausted → 4-hour lockout from last resend
  if (resends.length >= 3) {
    const lastResend = new Date(resends[resends.length - 1].timestamp).getTime();
    const lockoutEnd = lastResend + (4 * 60 * 60 * 1000); // 4 hours
    if (now < lockoutEnd) {
      const remainingMs = lockoutEnd - now;
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      return res.status(429).json({ 
        error: `Rate limit reached. Email can be resent after ${hours}h ${mins}m`,
        nextAvailableAt: new Date(lockoutEnd).toISOString(),
        resendsUsed: resends.length,
        resendsMax: 3
      });
    }
    // Lockout expired — reset the counter
    invite.emailResends = [];
  }

  // Check 1-minute cooldown from last resend
  if (resends.length > 0) {
    const lastResend = new Date(resends[resends.length - 1].timestamp).getTime();
    const cooldownEnd = lastResend + (60 * 1000); // 1 minute
    if (now < cooldownEnd) {
      const remainingSec = Math.ceil((cooldownEnd - now) / 1000);
      return res.status(429).json({ 
        error: `Please wait ${remainingSec}s before resending`,
        nextAvailableAt: new Date(cooldownEnd).toISOString(),
        resendsUsed: resends.length,
        resendsMax: 3
      });
    }
  }

  // Send the email (use stored name from invite)
  const setupLink = `https://acetrack-suggested.onrender.com/setup/${token}`;
  let emailStatus = { success: false, error: 'Email service not configured' };
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    emailStatus = await sendOnboardingEmail(invite.email, setupLink, invite.expiresAt.toISOString(), invite.firstName || '', invite.lastName || '');
  }

  if (emailStatus.success) {
    if (!invite.emailResends) invite.emailResends = [];
    invite.emailResends.push({ timestamp: new Date() });
    await invite.save();
    const remaining = 3 - invite.emailResends.length;
    await logServerEvent('SUPPORT_EMAIL_RESENT', { email: invite.email, resendsUsed: invite.emailResends.length });
    res.json({ 
      success: true, 
      message: `Email resent to ${invite.email}`,
      resendsUsed: invite.emailResends.length,
      resendsMax: 3,
      resendsRemaining: remaining
    });
  } else {
    res.status(500).json({ error: emailStatus.error || 'Failed to send email' });
  }
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 ADMIN LOGIN WITH MFA (v2.6.170)
// Server-side authentication — credentials & PIN never leave the server
// ═══════════════════════════════════════════════════════════════
// Auth Routes: MOVED to ./routes/auth.mjs (Phase 1c Modularization)

// 🌐 IP Geolocation \u0026 Bot Detection Helpers
function detectBot(userAgent, isp = '') {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  
  // 1. Explicit User-Agent Patterns
  if (ua.includes('whatsapp')) return 'WhatsApp';
  if (ua.includes('telegrambot')) return 'Telegram';
  if (ua.includes('twitterbot')) return 'Twitter';
  if (ua.includes('facebookexternalhit')) return 'Facebook';
  if (ua.includes('slackbot')) return 'Slack';
  if (ua.includes('linkedinbot')) return 'LinkedIn';
  if (ua.includes('discordbot')) return 'Discord';
  if (ua.includes('googlebot') || ua.includes('google-transparency-report') || ua.includes('google-http-client')) return 'Google';
  
  // 2. ISP-based detection (for scanners that mask User-Agent)
  const provider = (isp || '').toLowerCase();
  if (provider.includes('google')) return 'Google (Scanner)';
  if (provider.includes('amazon') || provider.includes('aws')) return 'AWS (Scanner)';
  if (provider.includes('microsoft') || provider.includes('azure')) return 'Azure (Scanner)';
  if (provider.includes('digitalocean')) return 'DigitalOcean (Scanner)';
  if (provider.includes('cloudflare')) return 'Cloudflare (Scanner)';

  // 3. Generic Catch-all
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('headless')) return 'Generic Bot';
  
  return null;
}

function isBotTraffic(userAgent) {
  return !!detectBot(userAgent);
}

async function resolveIpGeo(ipRaw) {
  try {
    // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
    // The first one is typically the actual client.
    const ipChain = (ipRaw || '').split(',').map(s => s.trim().replace('::ffff:', '')).filter(Boolean);
    const primaryIp = ipChain[0] || '127.0.0.1';
    
    if (primaryIp === '127.0.0.1' || primaryIp === '::1') {
      return { ip: primaryIp, city: 'Localhost', region: '', country: '', isp: '', lat: 0, lon: 0, timezone: '' };
    }

    const resp = await fetch(`http://ip-api.com/json/${primaryIp}?fields=status,city,regionName,country,isp,lat,lon,timezone`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'success') {
        // We return the primary resolved geo data, but keep the ipRaw as the full chain for the logger
        return { 
          ip: ipRaw, // Store the full chain in the record
          city: data.city, 
          region: data.regionName, 
          country: data.country, 
          isp: data.isp, 
          lat: data.lat, 
          lon: data.lon, 
          timezone: data.timezone 
        };
      }
    }
  } catch (e) { /* silent fallback */ }
  return { ip: (ipRaw || '127.0.0.1'), city: '', region: '', country: '', isp: '' };
}

// 3. Web Hub: Click Tracking (No Auth Required) — Enhanced with IP Geolocation
router.post('/support/invite/click', asyncHandler(async (req, res) => {
  const { token } = req.body;
  const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });
  if (invite.status === 'Expired') return res.status(400).json({ error: 'Invite has been Expired' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });
  
  const geo = await resolveIpGeo(ipRaw);
  const botType = detectBot(userAgent, geo.isp);
  if (invite.status === 'Pending' && !botType) invite.status = 'Clicked';
  
  invite.clicks.push({ 
    action: botType ? `BOT:${botType}:link_click` : 'link_click', 
    ip: geo.ip, 
    userAgent, 
    city: geo.city, 
    region: geo.region, 
    country: geo.country, 
    isp: geo.isp, 
    botType,
    lat: geo.lat, 
    lon: geo.lon, 
    timezone: geo.timezone, 
    timestamp: new Date() 
  });
  await invite.save();

  res.json({ success: true, email: invite.email });
}));

// 3b. Form Step Tracking (tracks form_view, step progression, submission)
router.post('/support/invite/track', asyncHandler(async (req, res) => {
  const { token, action: rawAction } = req.body;
  if (!token || !rawAction) return res.status(400).json({ error: 'Invalid tracking data' });

  const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const geo = await resolveIpGeo(ipRaw);
  const botType = detectBot(userAgent, geo.isp);

  let action = rawAction;
  if (botType) {
    action = `BOT:${botType}:${action}`;
  }
  invite.clicks.push({ 
    action, 
    ip: geo.ip, 
    userAgent, 
    city: geo.city, 
    region: geo.region, 
    country: geo.country, 
    isp: geo.isp, 
    botType,
    lat: geo.lat, 
    lon: geo.lon, 
    timezone: geo.timezone, 
    timestamp: new Date() 
  });
  await invite.save();

  res.json({ success: true });
}));

// 4. Web Hub: Final Setup & Creation (v2.6.124 — Full Employee Onboarding)
router.post('/support/invite/setup', upload.single('govId'), asyncHandler(async (req, res) => {
  const { token, password, firstName, lastName, phone, addressLine1, addressLine2, city, state: addrState, pinCode, country } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invalid token' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Link already used' });
  if (invite.status === 'Expired') return res.status(400).json({ error: 'Invite has been Expired' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Link expired' });

  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First and Last Name are required' });

  // A. Upload Govt ID to Cloudinary (if provided)
  let govIdUrl = null;
  if (req.file) {
    try {
      // 📁 Naming Convention: "LastName, FirstName(email)" for easy HR lookup
      const sanitizedLastName = (lastName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const sanitizedFirstName = (firstName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const sanitizedEmail = (invite.email || '').replace(/[^a-zA-Z0-9@._-]/g, '');
      const publicId = `${sanitizedLastName}, ${sanitizedFirstName}(${sanitizedEmail})`;

      const cloudResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'acetrack/support_ids',
        resource_type: 'auto',
        public_id: publicId
      });
      govIdUrl = cloudResult.secure_url;
      // Clean up temp file
      fs.unlink(req.file.path, () => {});
    } catch (uploadErr) {
      console.error('❌ Govt ID upload failed:', uploadErr.message);
      // Continue without blocking account creation
    }
  }

  // B. Modify Global State
  // 🛡️ SCALABILITY FIX (v2.6.316): Read/write players from Player distinct collection
  const playerDocs = await Player.find().lean();
  const players = playerDocs.map(d => d.data);
  
  const existingIndex = players.findIndex(p => 
    p.role === 'support' && 
    p.email?.toLowerCase() === invite.email.toLowerCase() && 
    p.id !== 'admin' // 🛡️ ADMIN GUARD: Protect admin from setup takeover
  );
  
  let finalUsername = '';

  if (existingIndex !== -1) {
    // ♻️ RE-ONBOARDING EXISTING (Ex-Employee)
    const existing = players[existingIndex];
    finalUsername = existing.username;

    players[existingIndex] = {
      ...existing,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: phone || '',
      password: bcrypt.hashSync(password, 10),
      supportStatus: 'active', // Restores access
      supportLevel: 'Trainee',  // Default to Trainee on re-onboard
      designation: 'Trainee',   // 🔄 Initialization sync
      address: {
        line1: addressLine1 || '',
        line2: addressLine2 || '',
        city: city || '',
        state: addrState || '',
        pinCode: pinCode || '',
        country: country || 'India'
      },
      govIdUrl: govIdUrl || existing.govIdUrl || '',
      reOnboardedAt: new Date().toISOString()
    };
  } else {
    // ✨ NEW ONBOARDING
    const generateSupportUsername = (fName, lName, existingPlayers) => {
      const base = (fName.substring(0, 3) + lName.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '');
      let un = base;
      let counter = 1;
      while (existingPlayers.some(p => p.username === un || p.id === un)) {
        un = `${base}${counter}`;
        counter++;
      }
      return un;
    };

    finalUsername = generateSupportUsername(firstName, lastName, players);

    const newSupportAgent = {
      id: `sup_${Date.now().toString(36)}`,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      email: invite.email,
      phone: phone || '',
      password: bcrypt.hashSync(password, 10),
      role: 'support',
      supportStatus: 'active',
      supportLevel: 'Trainee',  // ✨ Explicit Rank Initialization
      designation: 'Trainee',   // 🔄 Explicit Designation Sync
      address: {
        line1: addressLine1 || '',
        line2: addressLine2 || '',
        city: city || '',
        state: addrState || '',
        pinCode: pinCode || '',
        country: country || 'India'
      },
      govIdUrl: govIdUrl || '',
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      onboardedVia: 'invite',
      onboardedIp: ip,
      username: finalUsername
    };

    players.push(newSupportAgent);
  }
  // 🛡️ SCALABILITY FIX (v2.6.316): Persist directly to Player collection
  const upsertPlayer = async (playerData) => {
    const entityId = String(playerData.id);
    await Player.updateOne(
      { id: entityId },
      { $set: { id: entityId, data: playerData, lastUpdated: new Date() } },
      { upsert: true }
    );
  };
  if (existingIndex !== -1) {
    await upsertPlayer(players[existingIndex]);
  } else {
    await upsertPlayer(players[players.length - 1]);
  }

  // C. Invalidate token
  invite.status = 'Used';
  await invite.save();
  await logServerEvent('SUPPORT_ACCOUNT_CREATED', { 
    email: invite.email, 
    name: `${firstName} ${lastName}`, 
    phone: phone || '',
    hasGovId: !!govIdUrl,
    ip 
  });

  res.json({ success: true, message: 'Account established successfully' });

  // 📧 DUAL-EMAIL TRIGGER (Non-blocking)
  // 1. CEO Congratulations & Welcome
  sendOnboardingSuccessEmail(invite.email, firstName);
  // 2. Official Login Credentials
  sendLoginDetailsEmail(invite.email, `${firstName} ${lastName}`, finalUsername, phone);
}));


// 🛡️ [DEBUG] (v2.6.270): Temporary debug endpoint for active support sessions
router.get('/debug/active-sessions', (req, res) => {
  const sessions = [];
  for (const [socketId, sess] of activeSupportSessions) {
    sessions.push({ socketId, ...sess, durationMs: Date.now() - sess.startTime });
  }
  const connectedSockets = io.sockets.sockets ? io.sockets.sockets.size : 'unknown';
  res.json({ 
    activeSupportSessions: sessions, 
    totalConnectedSockets: connectedSockets,
    timestamp: new Date().toISOString()
  });
});

// 🛡️ [SESSION_CHECK] (v2.6.270): REST-based support session status check
// Used by AdminDiagnosticsPanel as a fallback when socket ping/pong is unreliable
router.get('/support/session-status/:userId', apiKeyGuard, (req, res) => {
  const { userId } = req.params;
  const sessions = [];
  for (const [socketId, sess] of activeSupportSessions) {
    if (String(sess.userId) === String(userId)) {
      sessions.push({
        socketId,
        startTime: new Date(sess.startTime).toISOString(),
        durationMs: Date.now() - sess.startTime,
        deviceName: sess.deviceName || 'Browser',
        isLive: true
      });
    }
  }
  res.json({ userId, sessions, isOnline: sessions.length > 0, timestamp: new Date().toISOString() });
});

// 📊 SUPPORT MANAGEMENT & ANALYTICS (v2.6.132)
// ---------------------------------------------------------

// 🕐 [ATTENDANCE API] (v2.6.267): Get attendance data for support employees
router.get('/support/attendance', apiKeyGuard, authGuard, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection
    const playerDocs = await Player.find().lean();
    const allPlayers = playerDocs.map(d => d.data);

    const agents = allPlayers.filter(p => p.role === 'support');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    // Build per-agent attendance data
    const attendance = agents.map(agent => {
      const sessions = agent.sessionHistory || [];
      
      // Check if currently online via in-memory tracker
      const activeSessions = [];
      for (const [, sess] of activeSupportSessions) {
        if (String(sess.userId) === String(agent.id)) {
          activeSessions.push({
            startTime: new Date(sess.startTime).toISOString(),
            durationMs: Date.now() - sess.startTime,
            device: sess.deviceName || 'Browser',
            isLive: true
          });
        }
      }
      const isCurrentlyOnline = activeSessions.length > 0;

      // Today's total hours
      const todaySessions = sessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0)
        + activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);

      // Weekly hours (per day)
      const weeklyDays = [];
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(weekStart);
        dayStart.setDate(dayStart.getDate() + i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const daySessions = sessions.filter(s => {
          const st = new Date(s.startTime);
          return st >= dayStart && st < dayEnd;
        });
        let dayMs = daySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        // Add live session time for today
        if (dayStart <= now && dayEnd > now) {
          dayMs += activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        }
        weeklyDays.push({
          date: dayStart.toISOString().split('T')[0],
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayStart.getDay()],
          totalMs: dayMs
        });
      }

      // Last 20 session entries
      const recentSessions = sessions.slice(-20).reverse();

      // Last seen
      const lastSession = sessions[sessions.length - 1];
      const lastSeen = isCurrentlyOnline ? 'Now' : (lastSession?.endTime || null);

      return {
        id: agent.id,
        name: agent.name,
        isCurrentlyOnline,
        activeSessions,
        todayMs,
        weeklyDays,
        allSessions: sessions, // For client-side date filtering
        recentSessions,
        lastSeen,
        totalSessionCount: sessions.length
      };
    });

    res.json({ attendance, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/support/analytics', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Use verified role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read from distinct collections
    const [playerDocs, ticketDocs] = await Promise.all([
      Player.find().lean(),
      SupportTicket.find().lean()
    ]);
    const allPlayers = playerDocs.map(d => d.data);
    const agents = allPlayers.filter(p => p.role === 'support');
    const allTickets = ticketDocs.map(d => d.data);

    // 🕐 TIME FILTER: Parse optional from/to query params
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    // Filter tickets by time range (based on createdAt)
    const tickets = allTickets.filter(t => {
      if (!fromDate && !toDate) return true;
      const created = new Date(t.createdAt);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      return true;
    });

    console.log(`[API] Analytics: ${agents.length} agents, ${tickets.length}/${allTickets.length} tickets (filtered)`);

    // 📊 Compute detailed per-agent metrics from actual ticket data
    const agentMetrics = agents.map(agent => {
      const agentId = agent.id;
      const agentTickets = tickets.filter(t => t && (String(t.assignedTo) === String(agentId) || String(t.assignedTo) === String(agent.username)));

      // Active caseload (open tickets)
      const activeTickets = agentTickets.filter(t => 
        ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)
      ).length;

      // Closed/Resolved tickets
      const closedResolved = agentTickets.filter(t => 
        t.status === 'Closed' || t.status === 'Resolved'
      );
      const closedResolvedCount = closedResolved.length;

      // Avg Resolution Time (assignedAt → closedAt/resolvedAt)
      const resolutionTimes = closedResolved
        .filter(t => t.assignedAt && (t.closedAt || t.resolvedAt))
        .map(t => {
          const end = new Date(t.closedAt || t.resolvedAt);
          const start = new Date(t.assignedAt);
          return end - start;
        })
        .filter(ms => ms > 0);
      const avgResolutionMs = resolutionTimes.length > 0 
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length 
        : 0;

      // Avg First Response Time (assignedAt → firstResponseAt)
      const frtTimes = agentTickets
        .filter(t => t.assignedAt && t.firstResponseAt)
        .map(t => new Date(t.firstResponseAt) - new Date(t.assignedAt))
        .filter(ms => ms > 0);
      const avgFirstResponseMs = frtTimes.length > 0 
        ? frtTimes.reduce((a, b) => a + b, 0) / frtTimes.length 
        : 0;

      // Tickets Reopened (count tickets that have reopenCount > 0 or were moved from Closed/Resolved back to In Progress)
      const reopenedCount = agentTickets.filter(t => (t.reopenCount || 0) > 0).length;

      // CSAT / User Feedback
      const ratedTickets = agentTickets.filter(t => t.rating && t.rating > 0);
      const csatScore = ratedTickets.length > 0
        ? (ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length).toFixed(1)
        : null;

      // SLA Compliance (resolved within 24h of creation)
      const slaTarget = 24 * 60 * 60 * 1000; // 24 hours
      const slaEligible = closedResolved.filter(t => t.createdAt && (t.closedAt || t.resolvedAt));
      const slaCompliant = slaEligible.filter(t => {
        const resTime = new Date(t.closedAt || t.resolvedAt) - new Date(t.createdAt);
        return resTime <= slaTarget;
      }).length;
      const slaPercent = slaEligible.length > 0 
        ? Math.round((slaCompliant / slaEligible.length) * 100) 
        : null;

      // Escalation Rate (tickets that were reassigned to someone else)
      const escalatedCount = agentTickets.filter(t => t.escalated || t.reassignedFrom === agentId).length;
      const escalationRate = agentTickets.length > 0
        ? Math.round((escalatedCount / agentTickets.length) * 100)
        : 0;

      // 🕒 Agent Activity Timeline (Last 15 Actions)
      let activities = [];
      agentTickets.forEach(t => {
        if (t.assignedAt) activities.push({ type: 'assignment', time: t.assignedAt, ticketId: t.id, title: t.title });
        if (t.closedAt) activities.push({ type: 'closure', time: t.closedAt, ticketId: t.id, title: t.title });
        if (t.resolvedAt) activities.push({ type: 'resolved', time: t.resolvedAt, ticketId: t.id, title: t.title });
        if (t.ratedAt && t.rating) activities.push({ type: 'csat_received', time: t.ratedAt, ticketId: t.id, rating: t.rating });
        if (t.messages) {
          t.messages.forEach(m => {
            if (m.senderId === agentId) {
              activities.push({ type: 'reply', time: m.timestamp, ticketId: t.id, text: m.text });
            }
          });
        }
      });
      activities.sort((a,b) => new Date(b.time) - new Date(a.time));
      const activityTimeline = activities.slice(0, 15);

      // 🕐 [SESSION DATA] (v2.6.267): Include attendance summary in analytics
      const agentSessions = agent.sessionHistory || [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySessions = agentSessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayActiveMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
      
      // Check if currently online
      let isCurrentlyOnline = false;
      for (const [, sess] of activeSupportSessions) {
        if (sess.userId === agentId) { isCurrentlyOnline = true; break; }
      }

      return {
        id: agentId,
        name: agent.name || `${agent.firstName} ${agent.lastName}`,
        email: agent.email,
        status: agent.supportStatus,
        level: agent.supportLevel || 'Trainee',
        score: SupportMetricsService.calculateWeightedScore(agent.metrics || {}),
        stats: {
          ...(agent.metrics || {}),
          activeTickets,
          closedResolvedCount,
          avgResolutionMs,
          avgFirstResponseMs,
          reopenedCount,
          csatScore: csatScore ? parseFloat(csatScore) : null,
          slaPercent,
          escalationRate,
          totalHandled: agentTickets.length,
          manualPicks: agent.metrics?.manualPicks || 0
        },
        activityTimeline,
        attendance: {
          isCurrentlyOnline,
          todayActiveMs,
          totalSessions: agentSessions.length,
          lastSeen: isCurrentlyOnline ? 'Now' : (agentSessions[agentSessions.length - 1]?.endTime || null)
        }
      };
    });

    // Sort leaderboard by score desc
    agentMetrics.sort((a, b) => b.score - a.score);

    // Global stats
    const allRatings = agents.map(a => a.metrics?.avgRating || 0).filter(r => r > 0);
    const globalAvgRating = allRatings.length > 0 ? (allRatings.reduce((a,b) => a+b, 0) / allRatings.length) : 4.5;

    // Ticket Type Breakdown
    const ticketTypesBreakdown = {};
    tickets.forEach(t => {
      const type = t.type || 'Other';
      ticketTypesBreakdown[type] = (ticketTypesBreakdown[type] || 0) + 1;
    });

    // Automated Admin Alerts
    const adminAlerts = [];
    agentMetrics.forEach(a => {
      if (a.stats.activeTickets > 10) {
        adminAlerts.push({ type: 'warning', message: `${a.name} is overwhelmed with ${a.stats.activeTickets} active tickets. Consider pausing distribution.` });
      }
      if (a.stats.csatScore && a.stats.csatScore <= 3.5) {
         adminAlerts.push({ type: 'danger', message: `${a.name} has a low CSAT score (${a.stats.csatScore}★). Quality review recommended.` });
      }
    });

    const overdueCount = tickets.filter(t => {
      if (t.status === 'Closed' || t.status === 'Resolved') return false;
      const created = new Date(t.createdAt);
      return (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
    }).length;
    
    if (overdueCount > 0) {
      adminAlerts.push({ type: 'danger', message: `${overdueCount} tickets are overdue (open for > 48h).` });
    }

    tickets.filter(t => (t.reopenCount || 0) >= 3).forEach(t => {
      adminAlerts.push({ type: 'warning', message: `Ticket #${t.id.slice(-4)} has been reopened ${t.reopenCount} times.` });
    });

    // Team-wide summary  
    const teamSummary = {
      totalOpenTickets: tickets.filter(t => ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)).length,
      totalClosedResolved: tickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length,
      unassignedQueue: tickets.filter(t => !t.assignedTo && t.status === 'Open').length,
      ticketsToday: allTickets.filter(t => {
        const created = new Date(t.createdAt);
        const today = new Date();
        return created.toDateString() === today.toDateString();
      }).length,
      overdueTickets: overdueCount,
      ticketTypesBreakdown,
      adminAlerts
    };

    res.json({
      leaderboard: agentMetrics,
      globalAvgRating,
      teamSummary,
      filteredTicketCount: tickets.length,
      totalTicketCount: allTickets.length,
      tickets: tickets.map(t => ({
        id: t.id,
        type: t.type || 'Other',
        status: t.status,
        title: t.title,
        assignedTo: t.assignedTo,
        rating: t.rating,
        createdAt: t.createdAt,
        closedAt: t.closedAt
      })),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 📥 Export Support Data as CSV (Admin only)
router.get('/support/export', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Enforce verified admin role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const tickets = state.data.supportTickets || [];
    const fields = ['id', 'type', 'status', 'assignedTo', 'createdAt', 'resolvedAt', 'closedAt', 'rating'];
    let csv = fields.join(',') + '\n';
    
    tickets.forEach(t => {
       const row = fields.map(f => {
         let value = t[f] || '';
         if (typeof value === 'string') {
           value = value.replace(/"/g, '""');
           if (value.includes(',') || value.includes('\n') || value.includes('"')) {
             value = `"${value}"`;
           }
         }
         return value;
       });
       csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="support_tickets.csv"');
    res.send(csv);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/manage-user', apiKeyGuard, async (req, res) => {
  const { targetUserId, status, level } = req.body;
  console.log(`[API] POST /support/manage-user: target=${targetUserId}, status=${status}, level=${level}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const playerDoc = await Player.findOne({ id: targetUserId });
    if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: "User not found" });
    const user = playerDoc.data;

    // Apply updates
    if (status) {
      players[idx].supportStatus = status;
      if (status === 'terminated') {
        players[idx].terminatedAt = new Date().toISOString();
      } else if (status === 'suspended') {
        // 🔒 SUSPEND: Freeze account without full termination
        players[idx].suspendedAt = new Date().toISOString();
        console.log(`[SUSPEND] ${players[idx].email} suspended by admin`);
      } else if (status === 'active') {
        // Re-onboarding or unsuspend: clear metadata
        delete players[idx].terminatedAt;
        delete players[idx].suspendedAt;
        players[idx].reOnboardedAt = new Date().toISOString();
        
        // 🔑 Generate fresh credentials for re-onboarded employee
        const newPassword = Math.random().toString(36).substring(2, 12);
        players[idx].password = newPassword;
        console.log(`[RE-ONBOARD] Generated new credentials for ${players[idx].email}`);
        
        // 📧 Send Welcome Back email with new access key
        sendReOnboardingEmail(players[idx].email, players[idx].name, newPassword);
      }
    }
    if (level) {
      const oldLevel = players[idx].supportLevel || 'Trainee';
      players[idx].supportLevel = level;
      players[idx].designation = level; // 🔄 Sync designation with support level

      // 📧 Trigger Promotion/Demotion Email if level changed (v2.6.148)
      if (oldLevel !== level) {
         const LEVEL_RANKS = { 'Trainee': 1, 'Specialist': 2, 'Senior': 3 };
         const oldRank = LEVEL_RANKS[oldLevel] || 0;
         const newRank = LEVEL_RANKS[level] || 0;

         if (newRank < oldRank) {
            // Demotion: Use the supportive, growth-focused template
            console.log(`[LEVEL] Demoting ${players[idx].email} from ${oldLevel} to ${level}`);
            sendDemotionEmail(players[idx].email, players[idx].name, level);
         } else {
            // Promotion: Use the celebratory template
            console.log(`[LEVEL] Promoting ${players[idx].email} from ${oldLevel} to ${level}`);
            sendPromotionEmail(players[idx].email, players[idx].name, level);
         }
      }
    }

    
    // Automated Unassign Trigger: If terminated or suspended, free up their tickets
    if (status === 'terminated' || status === 'suspended') {
       // 🛡️ SECURITY LOCKDOWN (v2.6.238): Immediately invalidate all active JWTs
       user.lastForceLogoutAt = Date.now();
       user.activeSessions = [];
       console.log(`[AUTH_LOCK] Invalidated all sessions for ${user.email} due to ${status}`);

       // Update all assigned tickets directly in DB
       await SupportTicket.updateMany(
         { "data.assignedTo": targetUserId },
         { $set: { "data.assignedTo": null, "data.assignedAt": null, lastUpdated: new Date() } }
       );

       if (status === 'terminated') {
         // 📧 Trigger Termination Email
         sendTerminationEmail(user.email, user.name);
       }
    }

    playerDoc.data = user;
    playerDoc.lastUpdated = new Date();
    playerDoc.markModified('data');
    await playerDoc.save();

    logServerEvent('SUPPORT_USER_MANAGED', { admin: req.headers['x-user-id'] || 'admin', targetUserId, status, level });
    res.json({ success: true, user: user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 Transfer All Open Tickets from One Agent to Another
router.post('/support/transfer-tickets', apiKeyGuard, async (req, res) => {
  const { fromAgentId, toAgentId } = req.body;
  console.log(`[API] POST /support/transfer-tickets: from=${fromAgentId}, to=${toAgentId}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
  if (!fromAgentId || !toAgentId) return res.status(400).json({ error: 'Both fromAgentId and toAgentId are required' });
  if (fromAgentId === toAgentId) return res.status(400).json({ error: 'Source and target agent cannot be the same' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const [fromDoc, toDoc] = await Promise.all([
      Player.findOne({ id: fromAgentId }).lean(),
      Player.findOne({ id: toAgentId }).lean()
    ]);
    const fromAgent = fromDoc?.data;
    const toAgent = toDoc?.data;
    
    if (!fromAgent) return res.status(404).json({ error: "Source agent not found" });
    if (!toAgent || toAgent.role !== 'support' || toAgent.supportStatus !== 'active') {
      return res.status(404).json({ error: "Target agent not found or not active" });
    }

    // Bulk update tickets assigned to the source agent
    const result = await SupportTicket.updateMany(
      { 
        "data.assignedTo": fromAgentId,
        "data.status": { $in: ['Open', 'In Progress', 'Awaiting Response'] }
      },
      { 
        $set: { 
          "data.assignedTo": toAgentId,
          "data.assignedAt": new Date().toISOString(),
          "data.reassignedFrom": fromAgentId,
          lastUpdated: new Date()
        } 
      }
    );

    const transferCount = result.modifiedCount || 0;

    logServerEvent('SUPPORT_TICKETS_TRANSFERRED', { fromAgentId, toAgentId, count: transferCount });
    res.json({ success: true, transferred: transferCount, message: `${transferCount} ticket(s) transferred to ${toAgent.name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 🤖 [NEW v2.6.297] Generate AI Closure Summary (Proxy for Web CORS bypass) */
router.post('/support/ai-summary', apiKeyGuard, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "Messages array required" });
  
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set" });

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        temperature: 0.5,
        max_tokens: 512
      })
    });
    const data = await aiRes.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      res.json({ success: true, text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: data.error?.message || "AI Error" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 🔄 [NEW v2.6.162] Reassign a Specific Ticket to Another Agent */
router.post('/support/reassign-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, targetAgentId } = req.body;
  console.log(`[API] POST /support/reassign-ticket: ticket=${ticketId}, to=${targetAgentId}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
  if (!ticketId || !targetAgentId) return res.status(400).json({ error: 'Both ticketId and targetAgentId are required' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const [playerDocs, ticketDoc] = await Promise.all([
      Player.find().lean(),
      SupportTicket.findOne({ id: ticketId })
    ]);
    const players = playerDocs.map(d => d.data);
    const targetAgent = players.find(p => {
      if (p.id !== targetAgentId) return false;
      const role = (p.role || '').toLowerCase();
      const status = (p.supportStatus || '').toLowerCase();
      const level = (p.supportLevel || '').toLowerCase();
      
      // 🛡️ [SMART LIFECYCLE GUARD] (v2.6.249)
      const hasActiveTermination = !!p.terminatedAt && (!p.reOnboardedAt || new Date(p.terminatedAt) > new Date(p.reOnboardedAt));

      const isExplicitlyInactive = 
        ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || 
        ['ex-employee', 'terminated'].includes(level) ||
        hasActiveTermination;
      
      const isActiveSupport = role === 'support' && (status === 'active' || !status) && !isExplicitlyInactive;
      const isActiveAdmin = role === 'admin' && !isExplicitlyInactive;

      return isActiveSupport || isActiveAdmin;
    });
    if (!targetAgent) return res.status(404).json({ error: "Target agent not found, inactive, or unauthorized" });

    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketDoc.data;

    const oldAgentId = ticket.assignedTo;
    
    // Perform reassignment
    ticket.assignedTo = targetAgentId;
    ticket.assignedAt = new Date().toISOString();
    ticket.reassignedFrom = oldAgentId;
    ticket.assignedAgentName = targetAgent.name;

    // 🛡️ [AUTO-INTRO MESSAGE] Generate personalized greeting on reassign
    const ticketUserId = ticket.userId;
    const userIdx = players.findIndex(p => p.id === ticketUserId);
    const userName = (userIdx !== -1 && players[userIdx].name) ? players[userIdx].name : 'User';

    tickets[ticketIdx] = ticket;

    // 🛡️ [AUTO-INTRO MESSAGE] Generate personalized greeting on reassign
    const ticketTitle = ticket.title || '';
    const ticketType = ticket.type || '';
    const firstUserMsg = (ticket.messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "llama-3.1-70b-versatile",
            messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
            temperature: 0.3, max_tokens: 50
          })
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: targetAgentId,
      text: `Hi ${userName}, I am ${targetAgent.name} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    ticket.messages = [...(ticket.messages || []), introMsg];
    ticket.status = 'In Progress';
    ticket.updatedAt = new Date().toISOString();

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    logServerEvent('SUPPORT_TICKET_REASSIGNED', { ticketId, fromAgentId: oldAgentId, toAgentId: targetAgentId });
    res.json({ 
      success: true, 
      message: `Ticket #${ticketId.slice(-4)} reassigned to ${targetAgent.name}`,
      ticket: ticket
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ⭐ Rate Ticket (CSAT)
router.post('/support/rate-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, rating, feedback } = req.body;
  const userId = req.headers['x-user-id'];
  console.log(`[API] POST /support/rate-ticket: ticket=${ticketId}, user=${userId}, rating=${rating}`);
  
  if (!ticketId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Valid ticketId and rating (1-5) required' });
  }

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });

    const ticket = ticketDoc.data;
    if (ticket.userId !== userId) {
      return res.status(403).json({ error: "You can only rate your own tickets" });
    }
    if (ticket.status !== 'Closed' && ticket.status !== 'Resolved') {
      return res.status(400).json({ error: "Only closed or resolved tickets can be rated" });
    }
    if (ticket.rating) {
      return res.status(400).json({ error: "This ticket has already been rated" });
    }

    ticket.rating = rating;
    if (feedback) ticket.ratingFeedback = feedback;
    ticket.ratedAt = new Date().toISOString();

    // Update agent's overall metrics
    const agentId = ticket.assignedTo;
    if (agentId) {
      const playerDoc = await Player.findOne({ id: agentId });
      if (playerDoc && playerDoc.data) {
        const p = playerDoc.data;
        if (!p.metrics) p.metrics = {};
        const oldRatedCount = p.metrics.ratedTickets || 0;
        const oldAvg = p.metrics.avgRating || 0;
        
        p.metrics.avgRating = ((oldAvg * oldRatedCount) + rating) / (oldRatedCount + 1);
        p.metrics.ratedTickets = oldRatedCount + 1;
        
        playerDoc.data = p;
        playerDoc.lastUpdated = new Date();
        playerDoc.markModified('data');
        await playerDoc.save();
      }
    }

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    logServerEvent('TICKET_RATED', { ticketId, rating, agentId });
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/claim-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId } = req.body;
  const agentId = req.headers['x-user-id'];
  console.log(`[API] POST /support/claim-ticket: ticketID=${ticketId}, agentID=${agentId}`);
  if (!agentId) return res.status(400).json({ error: "Agent ID required in headers" });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const [playerDocs, ticketDoc] = await Promise.all([
      Player.find().lean(),
      SupportTicket.findOne({ id: ticketId })
    ]);
    const players = playerDocs.map(d => d.data);

    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketDoc.data;
    
    if (ticket.assignedTo) return res.status(409).json({ error: "Ticket already assigned" });

    // Assign to agent
    ticket.assignedTo = agentId;
    ticket.assignedAt = new Date().toISOString();
    ticket.assignmentSource = 'manual_pool';

    const agentIdx = players.findIndex(p => p.id === agentId);
    const agentName = (agentIdx !== -1 && players[agentIdx].name) ? players[agentIdx].name : 'Support Agent';
    ticket.assignedAgentName = agentName;

    // 🛡️ [AUTO-INTRO MESSAGE] (v2.6.295): Generate personalized greeting on claim
    const ticketUserId = ticket.userId;
    const userIdx = players.findIndex(p => p.id === ticketUserId);
    const userName = (userIdx !== -1 && players[userIdx].name) ? players[userIdx].name : 'User';

    // Build AI issue description from ticket title + first user message
    const ticketTitle = ticket.title || '';
    const ticketType = ticket.type || '';
    const firstUserMsg = (ticket.messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "llama-3.1-70b-versatile",
            messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
            temperature: 0.3, max_tokens: 50
          })
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: agentId,
      text: `Hi ${userName}, I am ${agentName} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    ticket.messages = [...(ticket.messages || []), introMsg];
    ticket.status = 'In Progress';
    ticket.updatedAt = new Date().toISOString();

    // Increment agent's pool bonus metrics
    if (agentIdx !== -1) {
      const playerDoc = await Player.findOne({ id: agentId });
      if (playerDoc && playerDoc.data) {
        if (!playerDoc.data.metrics) playerDoc.data.metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
        playerDoc.data.metrics.manualPicks += 1;
        playerDoc.data.metrics.totalHandled += 1;
        playerDoc.lastUpdated = new Date();
        playerDoc.markModified('data');
        await playerDoc.save();
      }
    }

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    logAudit(req, 'TICKET_CLAIMED', ['supportTickets'], { ticketId, agentId });

    res.json({ success: true, ticket: ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/force-reset', apiKeyGuard, async (req, res) => {
  console.log(`[API] POST /support/force-reset requested for ${req.body.targetUserId}`);
  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Target user ID required' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const playerDoc = await Player.findOne({ id: targetUserId });
    if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User account not found' });
    
    const user = playerDoc.data;
    if (user.role !== 'support') {
      return res.status(400).json({ error: 'Can only force-reset support accounts via this portal.' });
    }

    // Generate Random Alphanumeric Password (10 chars)
    const newPassword = Math.random().toString(36).substring(2, 7) + Math.random().toString(36).substring(2, 7);
    console.log(`[FORCE-RESET] Generated new password for ${user.email}`);
    
    // Assign Plaintext to match local frontend authentication model
    user.password = bcrypt.hashSync(newPassword, 10);
    
    // Security Guard: Invalidate all existing sessions
    user.devices = [];

    playerDoc.data = user;
    playerDoc.lastUpdated = new Date();
    playerDoc.markModified('data');
    await playerDoc.save();
    console.log(`[FORCE-RESET] Database updated for ${user.email}`);

    // Log Event
    await logServerEvent('SUPPORT_FORCE_PASSWORD_RESET', { 
      adminId: req.headers['x-user-id'] || 'admin', 
      targetEmail: user.email 
    });

    // Send Notification Email
    console.log(`[FORCE-RESET] Sending reset email to ${user.email}...`);
    sendAdminResetPasswordEmail(user.email, user.name, newPassword);
    console.log(`[FORCE-RESET] Email dispatch triggered for ${user.email}`);
    res.json({ 
      success: true, 
      message: `Password reset successfully for ${user.name}. Credentials sent to ${user.email}.`
    });
  } catch (e) {
    console.error(`[FORCE-RESET] CRITICAL ERROR: ${e.message}`, e.stack);
    res.status(500).json({ error: e.message });
  }
});

  return router;
}
