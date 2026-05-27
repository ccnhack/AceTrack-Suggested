import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AppState, AuditLog, SupportInvite, Player, SupportTicket } from '../../models/index.mjs';
import { asyncHandler, getISTTimestamp, getISTDate } from '../../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../../middleware/security.mjs';
import {
  sendOnboardingEmail,
  buildOnboardingHtml,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail,
  sendSuspensionEmail
} from '../../emailService.mjs';
import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';

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

export default function ({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions,
  syncMutex
}) {
  const router = express.Router();

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/support/invite', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const { email, firstName, lastName, supportLevel } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name are required' });
  
  // 🛡️ [RBAC HARDENING] (v2.6.475): Use JWT-verified role instead of spoofable header
  if (req.userRole !== 'admin') {
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
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingAgent = await Player.findOne({ "data.role": "support", "data.email": { $regex: new RegExp(`^${escapedEmail}$`, 'i') } }).lean();

  if (existingAgent) {
    const status = (existingAgent.data.supportStatus || '').toLowerCase();
    const isTerminated = status === 'terminated' || status === 'inactive' || existingAgent.data.supportLevel === 'EX-EMPLOYEE';
    
    if (!isTerminated) {
      return res.status(422).json({
        error: 'Employee Already Exists',
        message: `The email ${email} is already associated with an active support employee (${existingAgent.data.name || existingAgent.data.firstName + ' ' + existingAgent.data.lastName}). Use the Support tab to manage their account.`,
        employeeName: existingAgent.data.name || `${existingAgent.data.firstName} ${existingAgent.data.lastName}`
      });
    }
  }

  const token = bcrypt.hashSync(Date.now().toString() + email, 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // strict 24 hours

  await SupportInvite.create({ email, firstName: firstName.trim(), lastName: lastName.trim(), supportLevel, token, expiresAt });
  await logAudit(req, 'SUPPORT_INVITE_GENERATED', [], { email, firstName, lastName });

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

router.get('/support/invite/preview', (req, res) => {
  const sampleLink = 'https://acetrack-suggested.onrender.com/setup/SAMPLE_TOKEN_PREVIEW';
  const expiryFormatted = new Date(Date.now() + 24*60*60*1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const html = buildOnboardingHtml('John Doe', 'john.doe@acetrack.com', sampleLink, expiryFormatted);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

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

router.post('/support/invite/expire', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  // 🛡️ [RBAC HARDENING] (v2.6.475): Use JWT-verified role instead of spoofable header
  if (req.userRole !== 'admin') {
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
  
  // 🛡️ [ARRAY BOMB DEFUSAL] (v2.6.435): Cap clicks to max 50
  if (invite.clicks.length > 50) invite.clicks = invite.clicks.slice(-50);
  
  await invite.save();
  await logAudit(req, 'SUPPORT_INVITE_RETIRED', [], { email: invite.email, token });

  res.json({ success: true, message: 'Invite link has been retired and is no longer accessible.' });
}));

router.post('/support/invite/resend', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  // 🛡️ [RBAC HARDENING] (v2.6.475): Use JWT-verified role instead of spoofable header
  if (req.userRole !== 'admin') {
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

  // 🛡️ [ARRAY BOMB DEFUSAL] (v2.6.435): Cap clicks to max 50
  if (invite.clicks.length > 50) invite.clicks = invite.clicks.slice(-50);

  await invite.save();

  res.json({ success: true, email: invite.email });
}));

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

  // 🛡️ [ARRAY BOMB DEFUSAL] (v2.6.435): Cap clicks to max 50
  if (invite.clicks.length > 50) invite.clicks = invite.clicks.slice(-50);

  await invite.save();

  res.json({ success: true });
}));

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
  // 🛡️ SCALABILITY FIX (v2.6.316): Read/write players using scoped DB queries
  const escapedEmail = invite.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingAgentDoc = await Player.findOne({
    "data.role": "support",
    "data.email": { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
    id: { $ne: 'admin' } // 🛡️ ADMIN GUARD: Protect admin from setup takeover
  }).lean();
  
  const existing = existingAgentDoc ? existingAgentDoc.data : null;
  
  let finalUsername = '';
  let finalPlayerToSave = null;

  if (existing) {
    // ♻️ RE-ONBOARDING EXISTING (Ex-Employee)
    finalUsername = existing.username;

    finalPlayerToSave = {
      ...existing,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: phone || '',
      password: bcrypt.hashSync(password, 10),
      supportStatus: 'active', // Restores access
      supportLevel: invite.supportLevel || 'Intern',  // Default from invite on re-onboard
      designation: invite.supportLevel || 'Intern',   // 🔄 Initialization sync
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
    const generateSupportUsername = async (fName, lName) => {
      const base = (fName.substring(0, 3) + lName.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '');
      let un = base;
      let counter = 1;
      while (true) {
        const conflict = await Player.exists({ $or: [{ id: un }, { "data.username": un }] });
        if (!conflict) break;
        un = `${base}${counter}`;
        counter++;
      }
      return un;
    };

    finalUsername = await generateSupportUsername(firstName, lastName);

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
      supportLevel: invite.supportLevel || 'Intern',  // ✨ Explicit Rank Initialization
      designation: invite.supportLevel || 'Intern',   // 🔄 Explicit Designation Sync
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

    finalPlayerToSave = newSupportAgent;
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
  
  await upsertPlayer(finalPlayerToSave);

  // C. Invalidate token
  invite.status = 'Used';
  await invite.save();
  await logAudit(req, 'SUPPORT_ACCOUNT_CREATED', ['players'], { 
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


  return router;
}
