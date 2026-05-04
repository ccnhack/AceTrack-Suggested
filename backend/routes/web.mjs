import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AppState, SupportPasswordReset, Player, Tournament, Match } from '../models/index.mjs';
import { asyncHandler } from '../helpers/utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function createWebRoutes({ APP_VERSION }) {
  const router = express.Router();

  // Adjust public path since we are in routes/
  const publicPath = path.join(__dirname, '../public');

// 🌐 Password Reset Web Page
router.get('/reset-password/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const resetReq = await SupportPasswordReset.findOne({ token, expiresAt: { $gt: new Date() } });
  
  if (!resetReq) {
    return res.status(400).send(`
      <html>
        <body style="background:#0F172A;color:#FFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:50px;">
          <h2>Link Expired or Invalid</h2>
          <p style="color:#94A3B8;">Please request a new password reset link from the AceTrack Portal.</p>
        </body>
      </html>
    `);
  }

  // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection using scoped query
  const escapedEmail = resetReq.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const userDoc = await Player.findOne({ "data.email": { $regex: new RegExp(`^${escapedEmail}$`, 'i') } }).lean();
  
  if (!userDoc || !userDoc.data) {
    return res.status(404).send('User not found');
  }
  const user = userDoc.data;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset AceTrack Password</title>
  <style>
    body { background-color: #0F172A; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { background-color: #1E293B; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 100%; max-width: 400px; box-sizing: border-box; }
    h2 { margin-top: 0; margin-bottom: 24px; color: #FFFFFF; font-weight: 800; text-align: center; }
    .form-group { margin-bottom: 20px; text-align: left; }
    label { display: block; font-size: 13px; color: #94A3B8; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .read-only { background-color: #0F172A; padding: 12px 16px; border-radius: 8px; font-size: 15px; color: #CBD5E1; border: 1px solid #334155; }
    input[type="password"] { width: 100%; box-sizing: border-box; background-color: #0F172A; color: #FFFFFF; border: 1px solid #334155; padding: 12px 16px; border-radius: 8px; font-size: 15px; outline: none; transition: border-color 0.2s; }
    input[type="password"]:focus { border-color: #6366F1; }
    .btn { width: 100%; background-color: #4F46E5; color: #FFF; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background-color 0.2s; margin-top: 10px; }
    .btn:hover { background-color: #4338CA; }
    .btn:disabled { background-color: #334155; cursor: not-allowed; color: #94A3B8; }
    .error { color: #EF4444; font-size: 13px; margin-top: 8px; text-align: center; display: none; }
    .success { display: none; text-align: center; }
  </style>
</head>
<body>
  <div class="container" id="form-container">
    <h2>Set New Password</h2>
    <div class="form-group">
      <label>Email</label>
      <div class="read-only">${user.email}</div>
    </div>
    <div class="form-group">
      <label>Username</label>
      <div class="read-only">${user.username || 'N/A'}</div>
    </div>
    <div class="form-group">
      <label>New Password</label>
      <input type="password" id="newPassword" placeholder="Enter new password">
    </div>
    <div class="form-group">
      <label>Confirm Password</label>
      <input type="password" id="confirmPassword" placeholder="Confirm new password">
    </div>
    <div class="error" id="error-msg"></div>
    <button class="btn" id="submit-btn">Save Password</button>
  </div>
  
  <div class="container success" id="success-container">
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <h2>Password Updated</h2>
    <p style="color:#94A3B8;margin-bottom:24px;line-height:1.6;">Your AceTrack password has been successfully reset. You can now securely log in to the portal.</p>
    <button class="btn" id="btn-go-login">Go to Login</button>
  </div>

  <script nonce="${res.locals.nonce}">
    async function submitPassword() {
      const p1 = document.getElementById('newPassword').value;
      const p2 = document.getElementById('confirmPassword').value;
      const errorMsg = document.getElementById('error-msg');
      const btn = document.getElementById('submit-btn');
      
      errorMsg.style.display = 'none';
      
      if (!p1 || !p2) {
        errorMsg.textContent = 'Both fields are required.';
        errorMsg.style.display = 'block';
        return;
      }
      if (p1 !== p2) {
        errorMsg.textContent = 'Passwords do not match.';
        errorMsg.style.display = 'block';
        return;
      }
      if (p1.length < 8) {
        errorMsg.textContent = 'Password must be at least 8 characters long.';
        errorMsg.style.display = 'block';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Updating...';
      
      try {
        const res = await fetch('/api/support/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: '${token}', newPassword: p1 })
        });
        
        const data = await res.json();
        if (res.ok) {
          document.getElementById('form-container').style.display = 'none';
          document.getElementById('success-container').style.display = 'block';
        } else {
          errorMsg.textContent = data.error || 'Failed to update password.';
          errorMsg.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Save Password';
        }
      } catch (e) {
        errorMsg.textContent = 'Network error. Please try again.';
        errorMsg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save Password';
      }
    }

    // 🛡️ [CSP HARMONY] Attach listeners
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('submit-btn')?.addEventListener('click', submitPassword);
      document.getElementById('btn-go-login')?.addEventListener('click', () => {
        window.location.href = '/';
      });
    });
  </script>
</body>
</html>
  `;
  res.send(html);
}));

// Root catch-all for legacy health monitors
router.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'ok', version: APP_VERSION });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Public Tournament Results (OWNER Fix: public URL)
// ═══════════════════════════════════════════════════════════════
router.get('/results/:tournamentId', async (req, res) => {
  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): O(K) Scoped Web Hydration
    const tournamentDoc = await Tournament.findOne({ id: req.params.tournamentId }).lean();
    if (!tournamentDoc || !tournamentDoc.data) return res.status(404).send('Tournament not found');
    const tournament = tournamentDoc.data;
    
    const registeredIds = Array.isArray(tournament.registeredPlayerIds) ? tournament.registeredPlayerIds.map(String) : [];
    
    const [matchDocs, playerDocs] = await Promise.all([
      Match.find({ "data.tournamentId": tournament.id }).lean(),
      Player.find({ id: { $in: registeredIds } }).lean()
    ]);
    
    const matches = matchDocs.map(d => d.data);
    const players = playerDocs.map(d => d.data);
    
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tournament.title} - Results | AceTrack</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #0F172A; color: #E2E8F0; }
  h1 { color: #3B82F6; } h2 { color: #94A3B8; }
  .match { background: #1E293B; padding: 16px; border-radius: 12px; margin: 8px 0; }
  .player { color: #F8FAFC; font-weight: 700; }
  .score { color: #3B82F6; font-size: 1.2em; font-weight: 900; }
  .meta { color: #64748B; font-size: 0.85em; }
  ${tournament.sponsorName ? '.sponsor { text-align: center; color: #94A3B8; margin-top: 40px; font-size: 0.8em; }' : ''}
</style>
</head><body>
<h1>🏆 ${tournament.title}</h1>
<h2>${tournament.sport} • ${tournament.date} • ${tournament.location || ''}</h2>
<p class="meta">${players.length} players • ${matches.length} matches</p>
${matches.map(m => {
  const p1 = players.find(p => p.id === m.player1Id);
  const p2 = players.find(p => p.id === m.player2Id);
  const sets = m.sets ? m.sets.map(s => `${s.score1}-${s.score2}`).join(', ') : `${m.score1 || 0}-${m.score2 || 0}`;
  return `<div class="match">
    <span class="player">${p1?.name || m.player1Id}</span> vs <span class="player">${p2?.name || m.player2Id}</span>
    <span class="score" style="float:right">${sets}</span>
    ${m.round ? `<div class="meta">Round ${m.round}</div>` : ''}
  </div>`;
}).join('')}
${tournament.sponsorName ? `<div class="sponsor">Sponsored by ${tournament.sponsorName}</div>` : ''}
<p class="meta" style="text-align:center;margin-top:40px">Powered by AceTrack</p>
</body></html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('❌ Public Results Error:', error);
    res.status(500).send('Server error');
  }
});

// ═══════════════════════════════════════════════════════════════
// 🎫 Support Staff Onboarding Page (v2.6.124)
// Server-rendered — works independently of the Expo web bundle
// ═══════════════════════════════════════════════════════════════
router.get('/setup/:token', (req, res) => {
  const { token } = req.params;
  const nonce = res.locals.nonce;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AceTrack Support — Employee Onboarding</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #E2E8F0;
    }
    .card {
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 40px;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, #4F46E5, #7C3AED, #EC4899);
    }
    .icon-wrap {
      width: 64px; height: 64px;
      background: rgba(79,70,229,0.15);
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
    }
    .icon-wrap svg { width: 32px; height: 32px; fill: #818CF8; }
    h1 { text-align: center; font-size: 22px; font-weight: 800; color: #F8FAFC; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 13px; color: #94A3B8; margin-bottom: 28px; }
    .email-badge {
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .email-badge .label { font-size: 10px; font-weight: 700; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase; }
    .email-badge .value { font-size: 15px; font-weight: 600; color: #E2E8F0; margin-top: 4px; }

    .section-title {
      font-size: 12px; font-weight: 700; color: #818CF8; text-transform: uppercase;
      letter-spacing: 1.5px; margin: 24px 0 14px; padding-bottom: 8px;
      border-bottom: 1px solid #334155;
    }
    .section-title:first-of-type { margin-top: 0; }

    .row { display: flex; gap: 12px; }
    .row .field { flex: 1; }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 600; color: #94A3B8; margin-bottom: 6px; }
    .field label .req { color: #F87171; }
    .field input, .field textarea {
      width: 100%;
      padding: 11px 14px;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 10px;
      color: #F8FAFC;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
    }
    .field input:focus, .field textarea:focus { border-color: #6366F1; }
    .field textarea { resize: vertical; min-height: 70px; }

    .file-upload {
      border: 2px dashed #334155;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      position: relative;
    }
    .file-upload:hover { border-color: #6366F1; background: rgba(99,102,241,0.05); }
    .file-upload.has-file { border-color: #34D399; background: rgba(16,185,129,0.05); }
    .file-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file-upload .upload-icon { font-size: 28px; margin-bottom: 8px; }
    .file-upload .upload-text { font-size: 13px; color: #94A3B8; }
    .file-upload .upload-text strong { color: #818CF8; }
    .file-upload .file-name { font-size: 13px; color: #34D399; font-weight: 600; margin-top: 6px; }
    .file-upload .upload-hint { font-size: 11px; color: #475569; margin-top: 6px; }

    .error-msg {
      background: rgba(239,68,68,0.12);
      color: #F87171;
      font-size: 13px;
      padding: 10px 14px;
      border-radius: 10px;
      margin-bottom: 16px;
      display: none;
    }
    .error-msg.visible { display: block; }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      color: #FFF;
      font-size: 15px;
      font-weight: 700;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: opacity 0.2s, transform 0.1s;
      margin-top: 8px;
    }
    .btn:hover { opacity: 0.92; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner { display: inline-block; width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: #FFF; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .progress-bar { display: flex; gap: 6px; margin-bottom: 4px; }
    .progress-bar .step { flex: 1; height: 4px; border-radius: 2px; background: #334155; transition: background 0.3s; }
    .progress-bar .step.done { background: #818CF8; }
    .progress-label { font-size: 11px; color: #64748B; text-align: right; margin-bottom: 20px; }

    /* States */
    .state { display: none; }
    .state.active { display: block; }
    .state-center { text-align: center; }
    .state-icon { width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .state-icon.error { background: rgba(239,68,68,0.15); }
    .state-icon.error svg { fill: #F87171; }
    .state-icon.success { background: rgba(16,185,129,0.15); }
    .state-icon.success svg { fill: #34D399; }
    .state-center h2 { font-size: 20px; font-weight: 800; color: #F8FAFC; margin-bottom: 8px; }
    .state-center p { font-size: 14px; color: #94A3B8; line-height: 1.6; margin-bottom: 24px; }
    .link-btn {
      display: inline-block; padding: 12px 28px;
      background: rgba(99,102,241,0.15); color: #818CF8;
      font-weight: 700; font-size: 14px; border-radius: 10px;
      text-decoration: none; transition: background 0.2s;
    }
    .link-btn:hover { background: rgba(99,102,241,0.25); }
    .loading-container { text-align: center; padding: 60px 0; }
    .loading-container .spinner { width: 36px; height: 36px; border-width: 3px; border-color: rgba(99,102,241,0.3); border-top-color: #818CF8; }
    .loading-text { margin-top: 16px; font-size: 14px; color: #64748B; }
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Loading State -->
    <div id="state-loading" class="state active">
      <div class="loading-container">
        <div class="spinner"></div>
        <div class="loading-text">Verifying your invitation link...</div>
      </div>
    </div>

    <!-- Invalid State -->
    <div id="state-invalid" class="state state-center">
      <div class="state-icon error">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      </div>
      <h2>Invalid Setup Link</h2>
      <p id="invalid-msg">This setup link is invalid or has expired.</p>
      <p style="font-size:12px;color:#64748B;">Please contact your System Administrator for a new invitation.</p>
    </div>

    <!-- Form State -->
    <div id="state-form" class="state">
      <div class="icon-wrap">
        <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
      </div>
      <h1>AceTrack Support</h1>
      <div class="subtitle">Secure Employee Onboarding</div>

      <div class="progress-bar">
        <div class="step done"></div>
        <div class="step" id="prog-2"></div>
        <div class="step" id="prog-3"></div>
      </div>
      <div class="progress-label" id="prog-label">Step 1 of 3 — Personal Details</div>

      <div class="email-badge">
        <div class="label">Corporate Email (Verified)</div>
        <div class="value" id="agent-email">—</div>
      </div>

      <!-- STEP 1: Personal Details -->
      <div id="step-1" class="state active">
        <div class="section-title">👤 Personal Information</div>
        <div class="row">
          <div class="field">
            <label>First Name <span class="req">*</span></label>
            <input type="text" id="firstName" placeholder="e.g. Rahul" required>
          </div>
          <div class="field">
            <label>Last Name <span class="req">*</span></label>
            <input type="text" id="lastName" placeholder="e.g. Sharma" required>
          </div>
        </div>
        <div class="field">
          <label>Phone Number <span class="req">*</span></label>
          <input type="tel" id="phone" placeholder="+91 9876543210">
        </div>

        <div class="section-title">🏠 Permanent Address</div>
        <div class="field">
          <label>Address Line 1 <span class="req">*</span></label>
          <input type="text" id="addrLine1" placeholder="House/Flat No., Street">
        </div>
        <div class="field">
          <label>Address Line 2</label>
          <input type="text" id="addrLine2" placeholder="Landmark (optional)">
        </div>
        <div class="row">
          <div class="field">
            <label>City <span class="req">*</span></label>
            <input type="text" id="city" placeholder="e.g. Bangalore">
          </div>
          <div class="field">
            <label>State <span class="req">*</span></label>
            <input type="text" id="addrState" placeholder="e.g. Karnataka">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>PIN Code <span class="req">*</span></label>
            <input type="text" id="pinCode" placeholder="e.g. 560001" maxlength="6">
          </div>
          <div class="field">
            <label>Country</label>
            <input type="text" id="country" value="India" placeholder="India">
          </div>
        </div>

        <div class="error-msg" id="error-1"></div>
        <button class="btn" id="btn-go-step-2">Continue to ID Verification →</button>
      </div>

      <!-- STEP 2: ID Upload -->
      <div id="step-2" class="state">
        <div class="section-title">🪪 Government ID Verification</div>
        <p style="font-size:13px;color:#94A3B8;margin-bottom:16px;line-height:1.5;">
          Upload a clear scan or photo of your government-issued ID (Aadhaar, PAN, Passport, or Driving License) for employment documentation.
        </p>

        <div class="file-upload" id="file-drop">
          <input type="file" id="govIdFile" accept="image/*,application/pdf" style="display:none">
          <div class="upload-icon">📄</div>
          <div class="upload-text"><strong>Click to upload</strong> or drag and drop</div>
          <div class="file-name" id="fileName" style="display:none"></div>
          <div class="upload-hint">PDF, JPG, PNG — Max 10MB</div>
        </div>

        <div class="error-msg" id="error-2"></div>
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button class="btn" id="btn-back-step-1" style="background:#334155;flex:0.4;">← Back</button>
          <button class="btn" id="btn-go-step-3" style="flex:0.6;">Continue to Security →</button>
        </div>
      </div>

      <!-- STEP 3: Password -->
      <div id="step-3" class="state">
        <div class="section-title">🔐 Account Security</div>
        <div class="field">
          <label>Create Password <span class="req">*</span></label>
          <input type="password" id="password" placeholder="At least 8 characters" autocomplete="new-password">
        </div>
        <div class="field">
          <label>Confirm Password <span class="req">*</span></label>
          <input type="password" id="confirm" placeholder="Repeat your password" autocomplete="new-password">
        </div>

        <div class="error-msg" id="error-3"></div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="btn" id="btn-back-step-2" style="background:#334155;flex:0.4;">← Back</button>
          <button class="btn" style="flex:0.6;" id="submit-btn">Finalize Account</button>
        </div>
        <div class="footer">🔒 Your password is encrypted end-to-end before storage.</div>
      </div>
    </div>

    <!-- Success State -->
    <div id="state-success" class="state state-center">
      <div class="state-icon success">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      </div>
      <h2>Account Ready!</h2>
      <p>Your support agent account has been securely established. All documentation has been recorded. You can now log in.</p>
      <a href="/" class="link-btn">Go to Login →</a>
    </div>
  </div>

  <script nonce="${nonce}">
    const TOKEN = '${token}';
    const API = '';
    let selectedFile = null;

    function showState(id) {
      document.querySelectorAll('.card > .state').forEach(s => s.classList.remove('active'));
      document.getElementById('state-' + id).classList.add('active');
    }

    // 📊 Analytics: Track form step views
    function trackStep(action) {
      try {
        fetch('/api/support/invite/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: '${token}', action })
        }).catch(() => {});
      } catch(e) {}
    }

    // Track initial form view
    trackStep('Form Opened (Step 1)');

    function showStep(n) {
      [1,2,3].forEach(i => {
        document.getElementById('step-' + i).classList.toggle('active', i === n);
      });
      // Update progress bar
      document.getElementById('prog-2').classList.toggle('done', n >= 2);
      document.getElementById('prog-3').classList.toggle('done', n >= 3);
      const labels = { 1: 'Step 1 of 3 — Personal Details', 2: 'Step 2 of 3 — ID Verification', 3: 'Step 3 of 3 — Security' };
      document.getElementById('prog-label').textContent = labels[n];
      
      const trackLabels = {
        1: 'Viewing Personal Info',
        2: 'ID Verification Reached',
        3: 'Security Setup Reached'
      };
      trackStep(trackLabels[n]);
    }

    function showError(boxId, msg) {
      const box = document.getElementById(boxId);
      box.textContent = msg;
      box.classList.add('visible');
    }
    function clearErrors() {
      document.querySelectorAll('.error-msg').forEach(b => { b.classList.remove('visible'); b.textContent = ''; });
      document.getElementById('file-drop').style.borderColor = '#E2E8F0';
    }

    function goStep2() {
      clearErrors();
      const fn = document.getElementById('firstName').value.trim();
      const ln = document.getElementById('lastName').value.trim();
      const ph = document.getElementById('phone').value.trim();
      const a1 = document.getElementById('addrLine1').value.trim();
      const ct = document.getElementById('city').value.trim();
      const st = document.getElementById('addrState').value.trim();
      const pin = document.getElementById('pinCode').value.trim();

      if (!fn || !ln) { showError('error-1', 'First and Last Name are required.'); return; }
      if (!ph || ph.length < 10) { showError('error-1', 'Please enter a valid phone number.'); return; }
      if (!a1) { showError('error-1', 'Address Line 1 is required.'); return; }
      if (!ct || !st) { showError('error-1', 'City and State are required.'); return; }
      if (!pin || pin.length < 5) { showError('error-1', 'Please enter a valid PIN/ZIP code.'); return; }
      showStep(2);
    }

    function backStep1() { clearErrors(); showStep(1); }

    function goStep3() {
      clearErrors();
      if (!selectedFile) { 
        showError('error-2', 'Government ID upload is required for documentation.'); 
        document.getElementById('file-drop').style.borderColor = '#EF4444';
        return; 
      }
      if (selectedFile.size > 10 * 1024 * 1024) { showError('error-2', 'File size must be under 10MB.'); return; }
      showStep(3);
    }

    function backStep2() { clearErrors(); showStep(2); }

    function handleFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      processFile(file);
    }

    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('file-drop').classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      processFile(file);
    }

    function processFile(file) {
      if (file.size > 10 * 1024 * 1024) {
        showError('error-2', 'File size must be under 10MB.');
        return;
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowed.includes(file.type)) {
        showError('error-2', 'Invalid file type. Please upload JPG, PNG, or PDF.');
        return;
      }
      
      selectedFile = file;
      document.getElementById('fileName').style.display = 'block';
      document.getElementById('fileName').textContent = '✓ ' + file.name;
      document.getElementById('file-drop').classList.add('has-file');
      document.getElementById('file-drop').style.borderColor = '#10B981'; // Success Green
      clearErrors();
    }

    async function verifyToken() {
      try {
        const res = await fetch(API + '/api/support/invite/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: TOKEN })
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('agent-email').textContent = data.email;
          showState('form');
        } else {
          document.getElementById('invalid-msg').textContent = data.error || 'This setup link is invalid or has expired.';
          showState('invalid');
        }
      } catch (err) {
        document.getElementById('invalid-msg').textContent = 'Failed to connect to the server. Please try again later.';
        showState('invalid');
      }
    }

    async function handleSetup() {
      clearErrors();
      const pw = document.getElementById('password').value;
      const cf = document.getElementById('confirm').value;
      const btn = document.getElementById('submit-btn');

      if (pw.length < 8) { showError('error-3', 'Password must be at least 8 characters.'); return; }
      if (pw !== cf) { showError('error-3', 'Passwords do not match.'); return; }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Setting up...';

      try {
        // Build FormData with all employee details
        const fd = new FormData();
        fd.append('token', TOKEN);
        fd.append('password', pw);
        fd.append('firstName', document.getElementById('firstName').value.trim());
        fd.append('lastName', document.getElementById('lastName').value.trim());
        fd.append('phone', document.getElementById('phone').value.trim());
        fd.append('addressLine1', document.getElementById('addrLine1').value.trim());
        fd.append('addressLine2', document.getElementById('addrLine2').value.trim());
        fd.append('city', document.getElementById('city').value.trim());
        fd.append('state', document.getElementById('addrState').value.trim());
        fd.append('pinCode', document.getElementById('pinCode').value.trim());
        fd.append('country', document.getElementById('country').value.trim() || 'India');
        if (selectedFile) fd.append('govId', selectedFile);

        trackStep('form_submit');
        const res = await fetch(API + '/api/support/invite/setup', {
          method: 'POST',
          body: fd
        });
        const data = await res.json();
        if (res.ok) {
          showState('success');
        } else {
          showError('error-3', data.error || 'Failed to establish account.');
          btn.disabled = false;
          btn.textContent = 'Finalize Account';
        }
      } catch (err) {
        showError('error-3', 'A network error occurred. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Finalize Account';
      }
    }

    // 🛡️ [CSP HARMONY] Attach listeners after DOM load (v2.6.234)
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('btn-go-step-2')?.addEventListener('click', goStep2);
      document.getElementById('btn-go-step-3')?.addEventListener('click', goStep3);
      document.getElementById('btn-back-step-1')?.addEventListener('click', backStep1);
      document.getElementById('btn-back-step-2')?.addEventListener('click', backStep2);
      document.getElementById('submit-btn')?.addEventListener('click', handleSetup);
      
      const fileDrop = document.getElementById('file-drop');
      const fileInput = document.getElementById('govIdFile');
      
      fileDrop?.addEventListener('click', (e) => {
        if (e.target.id !== 'govIdFile') {
          fileInput?.click();
          e.stopPropagation();
        }
      });
      
      fileDrop?.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDrop.classList.add('drag-over');
      });
      
      fileDrop?.addEventListener('dragleave', () => {
        fileDrop.classList.remove('drag-over');
      });
      
      fileDrop?.addEventListener('drop', (e) => {
        handleDrop(e);
      });
      
      fileInput?.addEventListener('change', () => {
        handleFileSelect(fileInput);
      });
    });

    // Auto-verify on page load
    verifyToken();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});


// ═══════════════════════════════════════════════════════════════
// Serve Web Admin Dashboard
// ═══════════════════════════════════════════════════════════════
// publicPath is defined above
if (fs.existsSync(publicPath)) {
  // 🛡️ [ENTRY-POINT GUARD]: Handle the root explicitly with no-cache headers.
  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 🛡️ [HIGH COMPATIBILITY ASSETS]: Explicitly handle Font MIME types and CORS (v2.6.257)
  router.use((req, res, next) => {
    if (req.path.endsWith('.ttf')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'font/ttf');
    }
    // Allow CORS for all static assets to prevent loading issues
    if (req.path.includes('/assets/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    next();
  });

  // 🛡️ [STATIC ASSETS]: Serve physical files (JS, CSS, Images, etc.)
  router.use(express.static(publicPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.ttf')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    }
  }));

  // 🛡️ [SPA FALLBACK]: Handle deep-links for the Single Page Application.
  // We exclude paths with extensions (containing a dot) to ensure missing assets return 404, not HTML.
  router.use((req, res, next) => {
    const isApi = req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/results') || req.path.startsWith('/setup');
    const hasExtension = req.path.includes('.');
    
    if (req.method === 'GET' && !isApi && !hasExtension) {
      // Still apply no-cache for SPA routes to be safe
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(publicPath, 'index.html'));
    } else {
      next();
    }
  });
}

  return router;
}
