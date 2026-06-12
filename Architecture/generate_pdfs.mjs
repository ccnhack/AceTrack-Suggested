/**
 * AceTrack Architecture PDF Generator
 * Generates print-ready PDFs with Mermaid diagrams and detailed flow explanations.
 * 
 * Usage: node generate_pdfs.mjs
 * Requires: puppeteer (installed via npx)
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========================================================
// SHARED HTML TEMPLATE WITH PRINT-OPTIMIZED CSS
// ========================================================
function wrapHtml(title, emoji, subtitle, sections) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — AceTrack Architecture</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #ffffff;
      --text: #1a1a2e;
      --text-muted: #64748b;
      --accent: #4F46E5;
      --accent-light: #EEF2FF;
      --border: #E2E8F0;
      --section-bg: #F8FAFC;
      --step-bg: #F1F5F9;
      --code-bg: #0F172A;
      --code-text: #E2E8F0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.6;
      font-size: 11px;
    }

    /* ===== PRINT LAYOUT ===== */
    @page {
      size: A4;
      margin: 10mm 10mm 10mm 10mm;
    }

    @media print {
      body { font-size: 9.5px; }
      .page-break { display: none; }
      .no-break { page-break-inside: avoid; }
      .keep-together { page-break-inside: auto; }
      h2 { page-break-after: avoid; margin-top: 16px; margin-bottom: 8px; }
      .flow-section { page-break-inside: auto; margin-bottom: 24px; }
      .step-detail { page-break-inside: avoid; }
      .api-table { page-break-inside: avoid; }
    }

    /* ===== COVER / HEADER ===== */
    .cover {
      text-align: center;
      padding: 20px 20px 15px;
      border-bottom: 3px solid var(--accent);
      margin-bottom: 20px;
    }
    .cover .emoji { font-size: 36px; margin-bottom: 8px; }
    .cover h1 {
      font-size: 24px;
      font-weight: 900;
      color: var(--accent);
      letter-spacing: -0.5px;
    }
    .cover .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 6px;
      font-weight: 500;
    }
    .cover .version {
      font-size: 10px;
      color: #94A3B8;
      margin-top: 12px;
    }

    /* ===== SECTION HEADERS ===== */
    h2 {
      font-size: 16px;
      font-weight: 800;
      color: var(--accent);
      margin: 20px 0 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid var(--accent-light);
      letter-spacing: -0.3px;
    }
    h3 {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      margin: 14px 0 6px;
    }
    .section-intro {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 12px;
      line-height: 1.5;
    }

    /* ===== MERMAID DIAGRAM WRAPPER ===== */
    .diagram-wrapper {
      background: var(--section-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin: 8px 0 12px;
      overflow: hidden;
    }
    .diagram-wrapper .mermaid {
      text-align: center;
    }
    .diagram-wrapper svg {
      max-width: 100% !important;
      max-height: 500px !important;
      height: auto !important;
    }

    /* ===== DETAILED STEPS ===== */
    .steps-container {
      margin: 8px 0 16px;
    }
    .steps-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .steps-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 14px;
      background: var(--accent);
      border-radius: 2px;
    }
    .step-detail {
      display: flex;
      gap: 8px;
      padding: 8px 10px;
      margin-bottom: 4px;
      background: var(--step-bg);
      border-radius: 6px;
      border-left: 3px solid var(--accent);
      page-break-inside: avoid;
    }
    .step-number {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      margin-top: 1px;
    }
    .step-content {
      flex: 1;
    }
    .step-content .step-label {
      font-weight: 700;
      font-size: 11px;
      color: var(--text);
      margin-bottom: 2px;
    }
    .step-content .step-desc {
      font-size: 10.5px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .step-content .step-api {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 9.5px;
      background: var(--code-bg);
      color: var(--code-text);
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 3px;
    }

    /* ===== API TABLES ===== */
    .api-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 10px;
    }
    .api-table th {
      background: var(--accent);
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .api-table td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .api-table tr:nth-child(even) { background: var(--section-bg); }
    .api-table code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 9px;
      background: #E2E8F0;
      padding: 2px 5px;
      border-radius: 3px;
    }

    /* ===== FOOTER ===== */
    .doc-footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 9px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="cover">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <div class="subtitle">${subtitle}</div>
    <div class="version">AceTrack Architecture Documentation • Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>

  ${sections}

  <div class="doc-footer">
    AceTrack Architecture Documentation — Confidential • © 2026 AceTrack
  </div>

  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      themeVariables: {
        primaryColor: '#4F46E5',
        primaryTextColor: '#fff',
        primaryBorderColor: '#4338CA',
        lineColor: '#64748B',
        secondaryColor: '#F1F5F9',
        tertiaryColor: '#EEF2FF',
        fontSize: '10px'
      },
      sequence: { mirrorActors: false, useMaxWidth: true, wrap: true },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
    });
  </script>
</body>
</html>`;
}

// Helper to create a flow section with diagram + detailed steps
function flowSection(id, title, intro, mermaidCode, steps, apiTable, pageBreak = false) {
  const stepsHtml = steps.map((s, i) => `
    <div class="step-detail">
      <div class="step-number">${i + 1}</div>
      <div class="step-content">
        <div class="step-label">${s.label}</div>
        <div class="step-desc">${s.desc}</div>
        ${s.api ? `<div class="step-api">${s.api}</div>` : ''}
      </div>
    </div>`).join('');

  const tableHtml = apiTable ? `
    <h3>API Endpoints</h3>
    <table class="api-table">
      <thead><tr>${apiTable.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${apiTable.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : '';

  return `
  ${pageBreak ? '<div class="page-break"></div>' : ''}
  <div class="flow-section keep-together" id="${id}">
    <h2>${title}</h2>
    ${intro ? `<p class="section-intro">${intro}</p>` : ''}
    <div class="diagram-wrapper no-break">
      <div class="mermaid">${mermaidCode}</div>
    </div>
    <div class="steps-container">
      <div class="steps-title">Detailed Flow Breakdown</div>
      ${stepsHtml}
    </div>
    ${tableHtml}
  </div>`;
}


// ========================================================
// 1. PLAYER ARCHITECTURE
// ========================================================
function buildPlayerHtml() {
  const sections = [
    flowSection('auth', '1. Authentication Flow',
      'The player\'s journey begins with authentication. Two paths exist: new user registration (OTP-verified) and existing user login (username/password).',
      `sequenceDiagram
    participant P as Player App
    participant API as Backend
    participant DB as MongoDB
    P->>API: POST /api/v1/check-username
    API->>DB: Player.findOne({ data.username })
    API-->>P: { available: true/false }
    P->>API: POST /api/v1/otp/send
    API->>DB: OtpTemp.create({ code })
    API-->>P: { success: true }
    P->>API: POST /api/v1/otp/verify
    API-->>P: { verified: true }
    P->>API: POST /api/v1/save (new player)
    API->>DB: Player.create({ id, data })
    API-->>P: { success: true }
    P->>API: POST /api/v1/user/login
    API->>DB: Player.findOne + bcrypt.compare
    API-->>P: Set-Cookie + { user, token }`,
      [
        { label: 'Username Check', desc: 'Player submits desired username. Backend checks MongoDB for case-insensitive match using regex query.', api: 'POST /api/v1/check-username { username }' },
        { label: 'OTP Dispatch', desc: 'System generates a 6-digit verification code, stores it in OtpTemp collection with expiry. Simulated SMS/email delivery for pre-production.', api: 'POST /api/v1/otp/send { phone/email, purpose: "signup" }' },
        { label: 'OTP Verification', desc: 'Player submits received code. Server validates against OtpTemp record, checking expiry and max attempts. Rate-limited to prevent brute force.', api: 'POST /api/v1/otp/verify { phone/email, code }' },
        { label: 'Account Creation', desc: 'New player record saved via the unified /save endpoint. Creates a Player document with hashed password (bcrypt), initial credits, and empty profile.', api: 'POST /api/v1/save { data: { players: [newPlayer] } }' },
        { label: 'Login (Returning Users)', desc: 'Username/password authentication with bcrypt comparison. On success, issues JWT as HttpOnly cookie (ace_auth_token) for stateless session management.', api: 'POST /api/v1/user/login { username, password }' },
        { label: 'Session Verification', desc: 'Every subsequent API call verifies the JWT cookie. The /auth/me endpoint returns current user data and role for client-side hydration.', api: 'GET /api/v1/auth/me (Cookie: ace_auth_token)' },
      ],
      { headers: ['Endpoint', 'Method', 'Auth', 'Purpose'],
        rows: [
          ['<code>/api/v1/user/login</code>', 'POST', 'Rate limited', 'Player login with username/password'],
          ['<code>/api/v1/auth/me</code>', 'GET', 'API Key', 'Session verification via HttpOnly cookie'],
          ['<code>/api/v1/check-username</code>', 'POST', 'API Key', 'Check username availability'],
          ['<code>/api/v1/otp/send</code>', 'POST', 'Rate limited', 'Send OTP for signup verification'],
          ['<code>/api/v1/otp/verify</code>', 'POST', 'Rate limited', 'Verify OTP code'],
          ['<code>/api/v1/logout</code>', 'POST', 'None', 'Clear auth cookie'],
          ['<code>/api/v1/auth/change-password</code>', 'POST', 'API Key', 'Change password (authenticated)'],
        ]
      }
    ),

    flowSection('hydration', '2. State Hydration & Real-Time Sync',
      'The core data pipeline that keeps the player app synchronized with the server using a combination of REST hydration and WebSocket push events.',
      `sequenceDiagram
    participant P as Player App
    participant API as Backend
    participant DB as MongoDB
    participant WS as WebSocket
    P->>API: GET /api/v1/data
    API->>DB: AppState.findOne().sort(-1)
    API->>API: getSanitizedState(state, role)
    API-->>P: { data, version, lastUpdated }
    P->>WS: socket.emit('join', userId)
    WS-->>P: Connection established
    WS-->>P: data_updated event
    P->>API: GET /api/v1/data (re-hydrate)
    WS-->>P: entity_updated event
    P->>P: Merge entity locally`,
      [
        { label: 'Initial Hydration', desc: 'On app launch, fetches the full application state. The server retrieves the latest AppState document (sorted by version descending) and sanitizes it based on user role — stripping PII and admin-only fields for non-admin users.', api: 'GET /api/v1/data (x-ace-api-key + Cookie)' },
        { label: 'Role-Based Sanitization', desc: 'The getSanitizedState() function filters the response. Players see only public tournament data, their own profile, and approved videos. Admin/support fields like audit logs, wallet history of others, and internal notes are removed.' },
        { label: 'WebSocket Connection', desc: 'Player joins their personal Socket.IO room (user:{userId}). This enables targeted real-time updates and admin device pings.' },
        { label: 'Push-Based Sync (data_updated)', desc: 'When any user saves data, the server broadcasts a data_updated event with the changed entity keys and new version number. The client re-fetches only if the version is newer than its local copy.' },
        { label: 'Entity-Level Sync (entity_updated)', desc: 'For granular changes (tournament update, video status change), the server emits entity_updated with the specific entity type and data. The client merges this directly into local state without a full re-hydration.' },
        { label: 'Save Flow (Player Edits)', desc: 'When a player edits their profile or performs actions, changes are sent via POST /save. The server acquires a sync mutex, performs delta detection to identify changed fields, and writes atomically to both the distinct collection and legacy AppState mirror.', api: 'POST /api/v1/save { data, socketId, clientVersion }' },
      ],
      { headers: ['Endpoint', 'Method', 'Auth', 'Purpose'],
        rows: [
          ['<code>/api/v1/data</code>', 'GET', 'API Key + Cache', 'Full state hydration (role-filtered)'],
          ['<code>/api/v1/save</code>', 'POST', 'API Key + Validate', 'Atomic state save with delta detection'],
          ['<code>/api/v1/status</code>', 'GET', 'API Key', 'Check server version + latest app version'],
        ]
      },
      true // page break
    ),

    flowSection('tournament', '3. Tournament Lifecycle (Player Actions)',
      'Players browse, register, manage partners, and check in to tournaments through a comprehensive registration pipeline with financial safeguards.',
      `sequenceDiagram
    participant P as Player
    participant API as Tournament Routes
    participant DB as MongoDB
    participant WS as WebSocket
    P->>API: POST /tournaments/:id/register
    API->>API: Cost validation + Capacity guard
    API->>API: Idempotency check
    API->>DB: Tournament.$addToSet registeredPlayerIds
    API->>DB: Player.$inc credits (deduct)
    API->>WS: io.emit entity_updated
    API-->>P: { success, tournament, teamCode }
    P->>API: POST /tournaments/:id/optout
    API->>API: Calculate cancellation charge
    API->>DB: Remove + Credit refund
    API->>API: Auto-promote from waitlist
    API-->>P: { refundInfo }`,
      [
        { label: 'Browse Tournaments', desc: 'Player views available tournaments from the hydrated state data. Tournaments include title, sport, date, location, cost, registered count, and capacity. No API call needed — data comes from initial hydration.' },
        { label: 'Registration with Cost Validation', desc: 'Server-side cost validation (VAPT-BL2 security fix) ensures the tournament cost matches the server\'s record, preventing client-side manipulation. An idempotency key prevents double-charges on retry.', api: 'POST /api/v1/tournaments/:id/register { method, idempotencyKey }' },
        { label: 'Credits Deduction', desc: 'Credits are atomically deducted from the player\'s wallet using MongoDB $inc operation. A wallet history entry is created for audit trail. If credits are insufficient, registration fails with a clear error.' },
        { label: 'Doubles Partner Flow', desc: 'For doubles tournaments, the registering player can specify a partner. The system creates a doublesTeam with a unique teamCode (e.g., "A1B2C3D4"), deducts cost for both players, and notifies the partner via push notification.', api: 'POST /tournaments/:id/register { registeringPartnerId }' },
        { label: 'Join Team via Code', desc: 'A partner joins an existing doubles team by entering the teamCode. The system validates the code, checks the team isn\'t full, and adds the player as player2.', api: 'POST /tournaments/:id/join-team { teamCode }' },
        { label: 'Opt-Out with Tiered Refund', desc: 'Cancellation charges are calculated based on time before the event: 0% if ≥5 days, 25% if ≥3 days, 50% if ≥1 day, 100% if less. Refund goes to the original payer. If a waitlisted player exists, they\'re auto-promoted.', api: 'POST /tournaments/:id/optout { refundToWallet, optOutMode }' },
        { label: 'Waitlist & Check-In', desc: 'If a tournament is full, players can join the waitlist. On event day, players check in via the app to confirm attendance.', api: 'POST /tournaments/:id/waitlist | /check-in' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/tournaments/:id/register</code>', 'POST', 'Register (credits/UPI/pending)'],
          ['<code>/tournaments/:id/optout</code>', 'POST', 'Opt out with tiered refund'],
          ['<code>/tournaments/:id/waitlist</code>', 'POST', 'Join waitlist for full tournament'],
          ['<code>/tournaments/:id/join-team</code>', 'POST', 'Join doubles team with code'],
          ['<code>/tournaments/:id/partner-chat</code>', 'GET/POST', 'Doubles partner messaging'],
          ['<code>/tournaments/:id/check-in</code>', 'POST', 'Day-of-event check-in'],
        ]
      },
      true
    ),

    flowSection('videos', '4. Match Videos & Media',
      'Players upload match videos which are processed with watermarks via Cloudinary\'s eager transformation pipeline, with webhook-based status updates.',
      `sequenceDiagram
    participant P as Player
    participant API as Media Routes
    participant CLOUD as Cloudinary
    participant WH as Webhook
    participant DB as MongoDB
    P->>API: POST /api/v1/upload (video file)
    API->>CLOUD: upload_stream + watermark overlay
    CLOUD-->>API: { secure_url }
    API-->>P: { url }
    CLOUD->>WH: POST /webhooks/cloudinary (eager done)
    WH->>DB: MatchVideo.$set watermarkedUrl
    WH->>WH: io.emit entity_updated`,
      [
        { label: 'Video Upload', desc: 'Player uploads a match video via multipart form data. The backend streams it to Cloudinary with an eager transformation that applies an AceTrack watermark overlay.', api: 'POST /api/v1/upload (multipart/form-data)' },
        { label: 'Watermark Processing', desc: 'Cloudinary processes the video asynchronously. An eager transformation applies a diagonal watermark text across the video. The original (unwatermarked) URL is stored for purchased/downloaded versions.' },
        { label: 'Webhook Callback', desc: 'When Cloudinary finishes the eager transform, it calls back to /api/webhooks/cloudinary with the watermarked URL. The server matches the video by public_id regex and updates the MatchVideo document.', api: 'POST /api/webhooks/cloudinary (notification_type: eager)' },
        { label: 'Metadata Save', desc: 'The player saves video metadata (matchId, player associations, timestamps) via a separate call. The server creates or updates the MatchVideo document with adminStatus: "Pending" for review.', api: 'POST /api/v1/videos/save-metadata { video: {...} }' },
        { label: 'Real-Time Update', desc: 'After the webhook updates the watermarked URL, the server emits an entity_updated event so all connected clients see the video\'s "ready" status in real-time.' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/api/v1/upload</code>', 'POST', 'Upload video/image to Cloudinary'],
          ['<code>/api/v1/videos/save-metadata</code>', 'POST', 'Save video metadata record'],
          ['<code>/api/webhooks/cloudinary</code>', 'POST', 'Cloudinary eager transform callback'],
        ]
      },
      true
    ),

    flowSection('notifications', '5. Notifications & Diagnostics',
      'The notification system uses Expo Push for offline delivery and in-app notifications for real-time alerts. Diagnostics enable remote troubleshooting.',
      `sequenceDiagram
    participant P as Player
    participant API as Backend
    participant DB as MongoDB
    participant EXPO as Expo Push
    P->>API: POST /register-push-token
    API->>DB: Player.$set pushTokens (cap: 15)
    API-->>P: { success }
    P->>API: POST /mark-read
    API->>DB: Player.$set notifications[].read
    API-->>P: { success }
    EXPO-->>P: Push notification (tournament, slot, etc.)`,
      [
        { label: 'Push Token Registration', desc: 'On app launch, the player registers their Expo push token. The server caps stored tokens at 15 per user to prevent bloat from multiple devices. A security check ensures userId matches the authenticated user.', api: 'POST /api/v1/register-push-token { userId, pushToken }' },
        { label: 'Mark Notifications Read', desc: 'Player marks one or all notifications as read. The server updates both the Player document and syncs to the legacy AppState for backward compatibility.', api: 'POST /api/v1/mark-read { notifId }' },
        { label: 'Push Notification Delivery', desc: 'The server sends push notifications via Expo\'s push service for events like: tournament registration confirmation, slot opened from waitlist, coach assignment, partner opt-out alerts, and system updates.' },
        { label: 'Auto-Flush Diagnostics', desc: 'The app periodically uploads diagnostic logs in the background. These are stored both locally and in Cloudinary, with a rotation policy keeping the last 3 files per user.', api: 'POST /api/v1/diagnostics/auto-flush { username, deviceId, logs }' },
        { label: 'Admin-Triggered Pull', desc: 'Admins can remotely request diagnostic logs from a specific device via WebSocket. The device receives a force_upload_diagnostics event and uploads its current log buffer.' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/api/v1/register-push-token</code>', 'POST', 'Register Expo push token'],
          ['<code>/api/v1/mark-read</code>', 'POST', 'Mark notifications as read'],
          ['<code>/api/v1/diagnostics</code>', 'POST', 'Upload diagnostic logs'],
          ['<code>/api/v1/diagnostics/auto-flush</code>', 'POST', 'Background auto-flush logs'],
        ]
      },
      true
    ),

    flowSection('booking', '6. Coach Booking & Security',
      'Players can book private coaching sessions and view their booking history. Every request passes through a multi-layer security middleware stack.',
      `graph LR
    REQ[Request] --> CORS[CORS]
    CORS --> HELMET[Helmet CSP/HSTS]
    HELMET --> RATE[Rate Limiter]
    RATE --> COOKIE[Cookie Parser]
    COOKIE --> BODY[Body Parser 10MB]
    BODY --> SANIT[Mongo Sanitize]
    SANIT --> NONCE[CSP Nonce]
    NONCE --> APIKEY[API Key Guard]
    APIKEY --> AUTH[Auth Guard JWT]
    AUTH --> HANDLER[Route Handler]`,
      [
        { label: 'View Coach Availability', desc: 'Player browses available coaches from the hydrated state. Each coach has a weekly availability schedule (day-of-week + time slots) that determines when they can be booked.' },
        { label: 'Create Booking', desc: 'Player creates a booking request specifying the coach, date, time, and session type. The booking starts with status "pending" until the coach confirms.', api: 'POST /api/v1/bookings/create { coachId, date, time }' },
        { label: 'View My Bookings', desc: 'Player can view all their past and upcoming bookings, including status (pending, confirmed, completed, rejected).', api: 'GET /api/v1/bookings/player/:playerId' },
        { label: 'CORS Protection', desc: 'Cross-Origin Resource Sharing is configured with a whitelist of allowed origins. Requests from unknown origins are blocked.' },
        { label: 'Helmet Security Headers', desc: 'Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), X-Frame-Options, and other security headers are applied to every response.' },
        { label: 'Rate Limiting', desc: 'Global rate limiter prevents abuse. Specific endpoints (login, OTP, password reset) have additional strict rate limits to prevent brute force attacks.' },
        { label: 'API Key Guard', desc: 'Every API request must include the x-ace-api-key header. This prevents unauthorized access from unknown clients and acts as a first line of defense.' },
        { label: 'JWT Auth Guard', desc: 'Protected endpoints verify the JWT token from the HttpOnly cookie. The guard extracts userId and role for downstream authorization checks.' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/api/v1/bookings/create</code>', 'POST', 'Create a new booking request'],
          ['<code>/api/v1/bookings/player/:playerId</code>', 'GET', 'Get player\'s bookings'],
        ]
      },
      true
    ),
  ];

  return wrapHtml('Player Architecture', '🎾', 'Complete system flow from the mobile app player perspective', sections.join(''));
}


// ========================================================
// 2. COACH ARCHITECTURE
// ========================================================
function buildCoachHtml() {
  const sections = [
    flowSection('onboarding', '1. Coach Onboarding Flow',
      'Coaches are onboarded via an invite-only system managed by the Academy Admin. The invite link triggers a validation → account creation → login flow.',
      `sequenceDiagram
    participant A as Admin
    participant API as Backend
    participant EMAIL as Email
    participant C as Coach
    participant DB as MongoDB
    A->>API: POST /save (coachInvites)
    API->>DB: CoachInvite.create({ token })
    API->>EMAIL: sendCoachInviteEmail
    API-->>A: { success }
    C->>API: GET /coach-invite/validate?token=abc
    API->>DB: CoachInvite.findOne
    API-->>C: { valid, email, academy }
    C->>API: POST /coach-invite/consume
    API->>DB: Player.create({ role: coach })
    API->>DB: CoachInvite.status = consumed
    API-->>C: Set-Cookie + { user }`,
      [
        { label: 'Admin Creates Invite', desc: 'The Admin saves a coach invite via the /save endpoint with the coach\'s email and sport expertise. The server generates a unique token, creates a CoachInvite document, and sends an onboarding email.', api: 'POST /api/v1/save { data: { coachInvites: [...] } }' },
        { label: 'Coach Validates Invite', desc: 'Coach clicks the invite link. The app calls validate to check the token hasn\'t been consumed or expired. Returns the associated email and academy details.', api: 'GET /api/v1/auth/coach-invite/validate?token=abc123' },
        { label: 'Interaction Tracking', desc: 'The system tracks invite analytics (link clicked, form opened) to give admins visibility into invite conversion rates.', api: 'POST /api/v1/auth/coach-invite/track { token, action }' },
        { label: 'Account Creation (Consume)', desc: 'Coach submits their profile details and password. The server creates a Player document with role "coach", hashes the password, marks the invite as "consumed", and issues a JWT token.', api: 'POST /api/v1/auth/coach-invite/consume { token, name, password }' },
        { label: 'Subsequent Logins', desc: 'After onboarding, coaches use the standard user login endpoint with username/password. The JWT cookie enables seamless session management.', api: 'POST /api/v1/user/login { username, password }' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/auth/coach-invite/validate</code>', 'GET', 'Validate invite token'],
          ['<code>/auth/coach-invite/track</code>', 'POST', 'Track invite analytics'],
          ['<code>/auth/coach-invite/consume</code>', 'POST', 'Create coach account'],
          ['<code>/admin/coach-invites</code>', 'GET', 'List all invites (admin)'],
          ['<code>/user/login</code>', 'POST', 'Standard login (post-onboarding)'],
        ]
      }
    ),

    flowSection('availability', '2. Availability Management',
      'Coaches set their weekly availability schedule, which determines tournament eligibility and triggers retroactive notifications for existing assignments.',
      `sequenceDiagram
    participant C as Coach App
    participant API as Booking Routes
    participant DB as MongoDB
    participant PUSH as Push Service
    C->>API: PUT /bookings/coach/:id/availability
    API->>DB: Player.$set data.availability
    API->>DB: Tournament.find({ assignedCoachId })
    loop For each tournament
        API->>API: Check date vs availability
        alt Available and no notification sent
            API->>PUSH: sendPushNotification
        end
    end
    API-->>C: { success, availability }`,
      [
        { label: 'Set Weekly Schedule', desc: 'Coach submits an array of availability slots, each with dayOfWeek (0-6), startTime, and endTime in 24-hour format. This replaces the entire availability array.', api: 'PUT /api/v1/bookings/coach/:coachId/availability { availability: [...] }' },
        { label: 'Retroactive Assignment Check', desc: 'After updating availability, the server queries all tournaments where this coach is already assigned. For each tournament, it checks whether the event date/time falls within the new availability slots.' },
        { label: 'Availability Matching Logic', desc: 'The system parses the tournament date to extract day-of-week and converts the event time to 24h format. It then checks if any availability slot matches both the day and time range.' },
        { label: 'Deferred Notifications', desc: 'If a coach is assigned to a tournament that now falls within their availability, and they haven\'t been notified yet, the system sends a push notification: "Tournament Assignment 🎓 — You have been assigned as coach for [Tournament]".' },
        { label: 'Booking Status Updates', desc: 'Coaches can accept, reject, or complete individual booking requests from players. Status transitions are: pending → confirmed → completed (or rejected).', api: 'PUT /api/v1/bookings/:id/status { status }' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/bookings/coach/:coachId</code>', 'GET', 'View incoming bookings'],
          ['<code>/bookings/:id/status</code>', 'PUT', 'Accept/reject/complete booking'],
          ['<code>/bookings/coach/:coachId/availability</code>', 'PUT', 'Set weekly availability'],
        ]
      },
      true
    ),

    flowSection('tournament-assign', '3. Tournament Assignment & Management',
      'Admins assign coaches to tournaments, send push invites, and coaches confirm or decline assignments with optional comments.',
      `sequenceDiagram
    participant A as Admin
    participant API as Backend
    participant DB as MongoDB
    participant C as Coach
    participant PUSH as Push
    A->>API: POST /tournaments/:id/assign-coach
    API->>DB: Tournament.$set assignedCoach
    API-->>A: { success }
    A->>API: POST /ping-coach { coachId }
    API->>API: Verify availability
    API->>PUSH: sendPushNotification
    API-->>A: { pings, tracking }
    C->>API: POST /tournaments/:id/confirm-coach
    API->>DB: Tournament.$set coachConfirmed = true
    API-->>C: { success }`,
      [
        { label: 'Admin Assigns Coach', desc: 'Admin selects a coach for a tournament. The server updates the tournament\'s assignedCoach field and broadcasts an entity_updated event.', api: 'POST /api/v1/tournaments/:id/assign-coach { coachId }' },
        { label: 'Ping Coach (Push Invite)', desc: 'Admin sends a push notification invite to the coach. The system first validates the coach is available at the tournament\'s date/time, then sends via Expo Push and tracks delivery status.', api: 'POST /api/v1/ping-coach { tournamentId, coachId }' },
        { label: 'Coach Confirms Assignment', desc: 'Coach reviews the assignment details and confirms. This sets coachConfirmed: true on the tournament document.', api: 'POST /api/v1/tournaments/:id/confirm-coach' },
        { label: 'Coach Declines Assignment', desc: 'If the coach declines, the assignedCoach field is cleared, allowing the admin to assign a different coach.', api: 'POST /api/v1/tournaments/:id/decline-coach' },
        { label: 'Coach Comment', desc: 'Coach can add notes or instructions about the tournament (e.g., "Bring extra rackets", "Wet court conditions expected").', api: 'POST /api/v1/tournaments/:id/coach-comment { comment }' },
      ],
      { headers: ['Endpoint', 'Method', 'Role', 'Purpose'],
        rows: [
          ['<code>/tournaments/:id/confirm-coach</code>', 'POST', 'Coach', 'Accept assignment'],
          ['<code>/tournaments/:id/decline-coach</code>', 'POST', 'Coach', 'Decline assignment'],
          ['<code>/tournaments/:id/coach-comment</code>', 'POST', 'Coach', 'Add notes'],
          ['<code>/tournaments/:id/assign-coach</code>', 'POST', 'Admin', 'Assign coach'],
          ['<code>/ping-coach</code>', 'POST', 'Admin', 'Send push invite'],
        ]
      },
      true
    ),

    flowSection('evaluation', '4. Player Evaluation & AI Analysis',
      'Coaches evaluate player performance with structured scoring across multiple skill dimensions, with optional AI-powered analysis generation.',
      `sequenceDiagram
    participant C as Coach App
    participant API as Evaluation Routes
    participant INFRA as Infrastructure
    participant AI as Groq/Cerebras LLM
    participant DB as MongoDB
    C->>API: POST /evaluations { scores, notes }
    API->>API: Verify role = coach
    API->>DB: Evaluation.save
    API-->>C: { success, evaluation }
    C->>INFRA: POST /evaluate/analysis
    INFRA->>AI: fetchWithAIFallback (llama-3.3-70b)
    AI-->>INFRA: Generated analysis text
    INFRA-->>C: { success, analysis }`,
      [
        { label: 'Create Evaluation', desc: 'Coach submits structured scores across skill dimensions: forehand, backhand, serve, footwork, strategy (each 0-100). Optional text notes provide qualitative feedback. The evaluatorId is enforced from JWT to prevent spoofing.', api: 'POST /api/v1/evaluations { playerId, scores, notes }' },
        { label: 'Ownership Enforcement', desc: 'When updating an existing evaluation, the server verifies that doc.evaluatorId matches the requesting coach (or the user is an admin). This prevents coaches from editing each other\'s evaluations.' },
        { label: 'View Evaluations', desc: 'Coach can list evaluations filtered by playerId, with results sorted by lastUpdated descending. Supports pagination with limit parameter.', api: 'GET /api/v1/evaluations?playerId=xyz&limit=50' },
        { label: 'AI Analysis Generation', desc: 'Coach requests an AI-generated analysis based on the evaluation scores. The system uses Groq API with llama-3.3-70b-versatile model, with Cerebras as a fallback. The prompt instructs the AI to be encouraging and motivating.', api: 'POST /api/v1/infrastructure/evaluate/analysis { evaluationScores, playerSkillLevel }' },
        { label: 'Video Highlights', desc: 'Coach can request AI-generated highlights from match video URLs. The infrastructure route processes the video and returns timestamps of key moments.', api: 'POST /api/v1/infrastructure/videos/:id/highlights { videoUrl }' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/evaluations</code>', 'POST', 'Create/update evaluation'],
          ['<code>/evaluations</code>', 'GET', 'List evaluations'],
          ['<code>/infrastructure/evaluate/analysis</code>', 'POST', 'AI analysis from scores'],
          ['<code>/infrastructure/videos/:id/highlights</code>', 'POST', 'Video highlight generation'],
        ]
      },
      true
    ),
  ];

  return wrapHtml('Coach Architecture', '🏸', 'Complete system flow from the coach perspective — invite to evaluation', sections.join(''));
}


// ========================================================
// 3. ACADEMY (ADMIN) ARCHITECTURE
// ========================================================
function buildAcademyHtml() {
  const sections = [
    flowSection('admin-auth', '1. Admin Authentication Flow',
      'Admin login is web-only with a two-factor PIN verification step for enhanced security.',
      `sequenceDiagram
    participant A as Admin Browser
    participant API as Auth Routes
    participant DB as MongoDB
    A->>API: POST /admin/login
    API->>API: Rate-limited (loginLimiter)
    API->>DB: Player.findOne + bcrypt
    API->>API: Verify role === admin
    API->>API: Generate 6-digit PIN
    API-->>A: Set-Cookie + requiresPin: true
    A->>API: POST /admin/verify-pin
    API-->>A: { user, verified: true }
    A->>API: GET /auth/me
    API-->>A: { user, role: admin }`,
      [
        { label: 'Web-Only Login Gate', desc: 'Admin login is strictly web-only (platform: "web" required). This prevents regular mobile users from encountering the admin login flow. Rate-limited by loginLimiter middleware.', api: 'POST /api/v1/admin/login { username, password, platform: "web" }' },
        { label: 'Credential Verification', desc: 'Server queries Player collection by username, verifies the password hash with bcrypt, and confirms the user has role: "admin". Non-admin accounts are rejected with 403.' },
        { label: '2FA PIN Generation', desc: 'A 6-digit PIN is generated and stored in the session. The initial JWT cookie is issued with requiresPin: true, meaning the client must complete PIN verification before accessing admin features.' },
        { label: 'PIN Verification', desc: 'Admin enters the PIN (delivered via a trusted channel). Server validates the PIN matches the session, then upgrades the JWT to a fully-verified state.', api: 'POST /api/v1/admin/verify-pin { pin: "123456" }' },
        { label: 'Session Management', desc: 'Subsequent requests use the verified JWT cookie. The /auth/me endpoint returns user data with role for client-side UI rendering. Logout clears the HttpOnly cookie.' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/admin/login</code>', 'POST', 'Admin login (web-only)'],
          ['<code>/admin/verify-pin</code>', 'POST', '2FA PIN verification'],
          ['<code>/auth/me</code>', 'GET', 'Session check (JWT cookie)'],
          ['<code>/logout</code>', 'POST', 'Clear auth cookie'],
          ['<code>/admin/restore-last-state</code>', 'POST', 'Restore previous AppState snapshot'],
        ]
      }
    ),

    flowSection('tournament-lifecycle', '2. Tournament Full Lifecycle',
      'The admin controls the complete tournament lifecycle: creation → coach assignment → player management → start → end → deletion.',
      `sequenceDiagram
    participant A as Admin
    participant API as Tournament Routes
    participant DB as MongoDB
    participant WS as WebSocket
    participant PUSH as Push
    A->>API: POST /tournaments (create)
    API->>DB: Tournament.create
    API->>WS: io.emit entity_updated
    A->>API: POST /tournaments/:id/assign-coach
    A->>API: POST /ping-coach
    API->>PUSH: sendPushNotification
    A->>API: POST /tournaments/:id/add-player
    A->>API: POST /tournaments/:id/start
    API->>DB: status = In Progress
    A->>API: POST /tournaments/:id/end
    API->>DB: status = Completed
    A->>API: DELETE /tournaments/:id`,
      [
        { label: 'Create Tournament', desc: 'Admin provides title, sport, date/time, location, max players, cost, sponsor, type (singles/doubles), and category. A unique ID is generated, document created in Tournament collection, and synced to AppState.', api: 'POST /api/v1/tournaments { title, sport, date, ... }' },
        { label: 'Update Tournament', desc: 'Admin can modify any tournament field before it starts. Changes are broadcast via WebSocket for real-time client updates.', api: 'PUT /api/v1/tournaments/:id { ...fields }' },
        { label: 'Assign Coach', desc: 'Admin assigns a coach by ID. The system updates the tournament document and may trigger notifications to the coach based on their availability.', api: 'POST /api/v1/tournaments/:id/assign-coach { coachId }' },
        { label: 'Ping Coach', desc: 'Sends a push notification invitation to the coach. Validates availability first, increments ping counter, and tracks delivery status.', api: 'POST /api/v1/ping-coach { tournamentId, coachId }' },
        { label: 'Manual Player Add', desc: 'Admin manually adds a player to a tournament using $addToSet to prevent duplicates.', api: 'POST /api/v1/tournaments/:id/add-player { playerId }' },
        { label: 'Manage Interested Players', desc: 'Admin approves or rejects players from the interested list, moving approved players to registeredPlayerIds.', api: 'POST /tournaments/:id/manage-interested { playerId, action }' },
        { label: 'Start Tournament', desc: 'Sets status to "In Progress". Broadcasts update to all connected clients.', api: 'POST /api/v1/tournaments/:id/start' },
        { label: 'End Tournament', desc: 'Sets status to "Completed". Finalizes match results and enables public results page.', api: 'POST /api/v1/tournaments/:id/end' },
        { label: 'Delete Tournament', desc: 'Permanently removes the tournament from both the distinct collection and AppState. Broadcasts deletion via WebSocket.', api: 'DELETE /api/v1/tournaments/:id' },
      ],
      null,
      true
    ),

    flowSection('support-staff', '3. Support Staff Management',
      'Admin onboards, manages, and monitors support staff through a dedicated invite → setup → management workflow.',
      `sequenceDiagram
    participant A as Admin
    participant API as Support Routes
    participant DB as MongoDB
    participant EMAIL as Email
    participant S as New Staff
    A->>API: POST /support/invite
    API->>DB: SupportInvite.create
    API->>EMAIL: Send setup link
    S->>API: GET /setup/:token
    API-->>S: 3-step form (HTML)
    S->>API: POST /support/invite/setup
    API->>DB: Player.create({ role: support })
    API-->>S: Account ready
    A->>API: POST /support/manage-user
    API->>DB: Update status/level`,
      [
        { label: 'Send Staff Invite', desc: 'Admin specifies email, designation, and support level (L1/L2/Manager). A SupportInvite document is created with a unique token and 7-day expiry. An onboarding email with the setup link is dispatched.', api: 'POST /api/v1/support/invite { email, designation, supportLevel }' },
        { label: 'Staff Onboarding Form', desc: 'Staff clicks the link → server-rendered 3-step HTML form: Step 1 (Personal Info: name, phone, address), Step 2 (Government ID upload), Step 3 (Password creation). CSP nonces ensure XSS safety.' },
        { label: 'Account Finalization', desc: 'Staff submits the multipart form. Server creates a Player document with role "support", hashes the password, uploads gov ID to Cloudinary, and marks the invite as "Used".', api: 'POST /api/v1/support/invite/setup (FormData)' },
        { label: 'Manage Existing Staff', desc: 'Admin can activate/deactivate/promote staff members, change support levels, or force password resets.', api: 'POST /api/v1/support/manage-user { userId, action }' },
        { label: 'Invite Management', desc: 'Admin can list all invites, retire unused invites, or resend expired ones with new tokens.' },
      ],
      { headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['<code>/support/invite</code>', 'POST', 'Send staff invite'],
          ['<code>/support/invites</code>', 'GET', 'List all invites'],
          ['<code>/support/invite/expire</code>', 'POST', 'Retire an invite'],
          ['<code>/support/invite/resend</code>', 'POST', 'Resend invite email'],
          ['<code>/support/invite/setup</code>', 'POST', 'Complete onboarding'],
          ['<code>/support/manage-user</code>', 'POST', 'Manage staff status'],
          ['<code>/support/force-reset</code>', 'POST', 'Force password reset'],
        ]
      },
      true
    ),

    flowSection('ticket-ops', '4. Support Ticket Operations',
      'Admin has full visibility and control over the support ticket lifecycle — from triage to resolution analytics.',
      `sequenceDiagram
    participant A as Admin
    participant API as Support Operations
    participant DB as MongoDB
    participant WS as WebSocket
    A->>API: POST /support/claim-ticket
    API->>DB: $set assignedTo
    A->>API: POST /support/reply-ticket
    API->>DB: $push messages
    A->>API: POST /support/escalate-ticket
    API->>DB: Update priority
    A->>API: POST /support/update-ticket-status
    API->>DB: $set status = resolved
    A->>API: GET /support/analytics
    API-->>A: { open, closed, avgResolution }`,
      [
        { label: 'Claim Ticket', desc: 'Admin or support agent claims an unassigned ticket. Sets assignedTo field and broadcasts update via WebSocket.', api: 'POST /api/v1/support/claim-ticket { ticketId }' },
        { label: 'Reassign Ticket', desc: 'Admin transfers a ticket to a different agent. Updates assignedTo and notifies the new assignee.', api: 'POST /api/v1/support/reassign-ticket { ticketId, newAssigneeId }' },
        { label: 'Escalate Ticket', desc: 'Raises the ticket\'s priority level. Can escalate from L1 → L2 → Manager for complex issues.', api: 'POST /api/v1/support/escalate-ticket { ticketId, escalateToLevel }' },
        { label: 'Reply to Ticket', desc: 'Send a response to the player (public) or add internal notes (isInternal: true). Messages are pushed to the ticket\'s thread.', api: 'POST /api/v1/support/reply-ticket { ticketId, message, isInternal }' },
        { label: 'AI Summary', desc: 'Generate an AI-powered summary of the entire ticket thread for quick context understanding.', api: 'POST /api/v1/support/ai-summary { ticketId }' },
        { label: 'Resolve & Close', desc: 'Update ticket status through the lifecycle: open → in_progress → resolved → closed. Players can rate the resolution quality.', api: 'POST /api/v1/support/update-ticket-status { ticketId, status }' },
        { label: 'Analytics Dashboard', desc: 'View aggregate support metrics: open/closed ticket counts, average resolution time, tickets per agent, SLA compliance, and trend data.' },
        { label: 'Bulk Transfer', desc: 'Transfer all tickets from one agent to another (e.g., during employee offboarding or leave).', api: 'POST /api/v1/support/transfer-tickets { fromAgentId, toAgentId }' },
      ],
      null,
      true
    ),

    flowSection('diagnostics', '5. Diagnostics & Device Management',
      'Admin can remotely query diagnostics, ping devices, and pull logs from player devices via the WebSocket relay.',
      `sequenceDiagram
    participant A as Admin
    participant API as Diagnostics
    participant WS as WebSocket
    participant D as Player Device
    participant CLOUD as Cloudinary
    A->>API: GET /diagnostics?userId=x
    API->>CLOUD: List diagnostic files
    API-->>A: { files: [...] }
    A->>WS: admin_ping_device
    WS->>D: admin_ping_device_relay
    D->>WS: device_pong { deviceId, version }
    WS-->>A: admin_device_pong
    A->>WS: admin_pull_diagnostics
    WS->>D: force_upload_diagnostics
    D->>API: POST /diagnostics (upload)
    API->>CLOUD: Store in Cloudinary`,
      [
        { label: 'List Diagnostic Files', desc: 'Admin queries diagnostics for a specific user. Server fetches from both Cloudinary CDN and local filesystem, deduplicates, and sorts by timestamp.', api: 'GET /api/v1/diagnostics?userId=player123' },
        { label: 'Read Diagnostic File', desc: 'Admin opens a specific diagnostic file. Server tries Cloudinary first, falls back to local filesystem if cloud copy doesn\'t exist.', api: 'GET /api/v1/diagnostics/:filename' },
        { label: 'Ping Device', desc: 'Admin sends a WebSocket ping to check if a specific device is online. The target device responds with its deviceId, name, and app version.' },
        { label: 'Pull Diagnostics', desc: 'Admin remotely triggers a diagnostic upload from a specific device. The device gathers its current DeviceLogger logs and uploads them with a "admin_requested" prefix.', api: 'WebSocket: admin_pull_diagnostics → force_upload_diagnostics' },
        { label: 'Raw Server Events', desc: 'Admin can access raw server-side events from the server_events.jsonl file for deep troubleshooting.', api: 'GET /api/v1/diagnostics/raw_events' },
      ],
      null,
      true
    ),

    flowSection('comms-audit', '6. Org Chat, Audit Logs & Settings',
      'Admin manages internal communications, reviews audit trails, and configures academy-wide settings.',
      `sequenceDiagram
    participant A as Admin
    participant API as Backend
    participant DB as MongoDB
    participant WS as WebSocket
    A->>API: GET /comms/chat?limit=50
    API-->>A: { messages (admin exempt from expiry) }
    A->>API: POST /comms/chat
    API->>DB: OrgMessage.create
    API->>WS: io.emit org_chat_message
    A->>API: GET /admin-core/audit-logs
    API-->>A: { logs (3-day limit) }
    A->>API: POST /admin-core/settings
    API->>DB: OrgSetting.upsert + AuditLog`,
      [
        { label: 'Org Chat (Admin-Only Features)', desc: 'Admin can send messages, upload attachments (via Cloudinary with 7-day expiry), react with emojis, and delete any message. Admin is exempt from the 7-day attachment expiry — can access all files permanently.' },
        { label: 'Chat Features', desc: 'The chat system supports threaded replies (replyTo field), emoji reactions (Map<emoji, userId[]> toggle), file attachments, read receipts, and real-time delivery via WebSocket.' },
        { label: 'Announcements', desc: 'Admin can view broadcast announcements that are sent to all staff members.', api: 'GET /api/v1/comms/announcements' },
        { label: 'Audit Logs', desc: 'Admin queries audit logs with date range and search filters. A 3-day limit is enforced without specific search criteria to prevent excessive database load. Results are capped at 200 records.', api: 'GET /api/v1/admin-core/audit-logs?startDate=...&search=LOGIN' },
        { label: 'Academy Settings', desc: 'Admin creates or updates organizational settings (key-value pairs). Every change is logged in the AuditLog with the admin\'s identity and IP address.', api: 'POST /api/v1/admin-core/settings { key, value }' },
        { label: 'Team Directory', desc: 'Admin views all staff with enriched presence data (device activity, online/offline status, ex-employee detection) and manages reporting hierarchy.', api: 'GET /api/v1/admin-core/team-directory' },
        { label: 'Security Export', desc: 'Admin can export compiled security audit data for compliance review.', api: 'GET /api/v1/infrastructure/security/export' },
      ],
      null,
      true
    ),
  ];

  return wrapHtml('Academy (Admin) Architecture', '🏫', 'Complete admin control plane — tournaments, staff, diagnostics, and operations', sections.join(''));
}


// ========================================================
// 4. CORPORATE (HR) ARCHITECTURE
// ========================================================
function buildCorporateHtml() {
  const sections = [
    flowSection('leave-mgmt', '1. HR Module — Leave Management',
      'The HR module uses role-based query scoping (buildHRQuery) to ensure proper data isolation: Admin sees all, Manager sees own + direct reports, Employee sees only own records.',
      `sequenceDiagram
    participant E as Employee
    participant M as Manager
    participant API as HR Routes
    participant DB as MongoDB
    E->>API: POST /hr/leaves { type, dates, reason }
    API->>DB: LeaveRequest.create (Pending)
    API->>DB: Notify manager in-app
    API-->>E: { success, leave }
    M->>API: GET /hr/leaves
    API->>API: buildHRQuery (Manager scope)
    API->>DB: LeaveRequest.find + name enrichment
    API-->>M: { leaves with employeeName }
    M->>API: PUT /hr/leaves/:id/approve
    API->>API: RBAC verify (Manager + managerId)
    API->>DB: Update status + notify employee
    API-->>M: { success }`,
      [
        { label: 'Apply for Leave', desc: 'Employee submits a leave request with type (Earned/Sick/Casual), start/end dates, and reason. The server creates a LeaveRequest document with status: "Pending" and auto-notifies the employee\'s manager via in-app notification.', api: 'POST /api/v1/hr/leaves { type, startDate, endDate, reason }' },
        { label: 'Manager Notification', desc: 'The server looks up the employee\'s managerId from their Player document, then pushes an in-app notification to the manager: "[Employee Name] applied for [type] leave from [date]."' },
        { label: 'Manager Views Team Leaves', desc: 'buildHRQuery scopes the query based on role. For managers, it fetches direct reports via Player.find({ managerId: self }), then queries leaves for all those userIds. Results include name enrichment (v2.6.446).', api: 'GET /api/v1/hr/leaves' },
        { label: 'RBAC Approval Guard', desc: 'When approving/rejecting, the server verifies: (a) req.user.supportLevel === "Manager", and (b) the leave\'s employee has managerId matching the requesting manager. This prevents managers from approving leaves for employees outside their team.' },
        { label: 'Approve Leave', desc: 'Manager approves with an optional comment. The server updates the leave status and pushes a notification to the employee: "Your [type] leave was approved."', api: 'PUT /api/v1/hr/leaves/:id/approve { managerComment }' },
        { label: 'Reject Leave', desc: 'Same RBAC verification as approval. Manager provides a rejection reason, employee is notified with the comment.', api: 'PUT /api/v1/hr/leaves/:id/reject { managerComment }' },
      ],
      { headers: ['Endpoint', 'Method', 'Scoping', 'Purpose'],
        rows: [
          ['<code>/hr/leaves</code>', 'GET', 'Admin/Manager/Self', 'List leave requests'],
          ['<code>/hr/leaves</code>', 'POST', 'Self', 'Apply for leave'],
          ['<code>/hr/leaves/:id/approve</code>', 'PUT', 'Admin/Manager', 'Approve leave'],
          ['<code>/hr/leaves/:id/reject</code>', 'PUT', 'Admin/Manager', 'Reject leave'],
        ]
      }
    ),

    flowSection('attendance', '2. HR Module — Attendance, Payslips & Reviews',
      'Employee self-service for daily attendance tracking, payslip viewing, performance reviews, and document management.',
      `sequenceDiagram
    participant E as Employee
    participant API as HR Routes
    participant DB as MongoDB
    E->>API: POST /hr/attendance/check-in
    API->>DB: Attendance.upsert({ userId, date })
    API-->>E: { success, record }
    E->>API: POST /hr/attendance/check-out
    API->>DB: Attendance.$set checkOut
    API-->>E: { success, record }
    E->>API: GET /hr/payslips
    API->>DB: Payslip.find({ userId })
    API-->>E: { payslips }
    E->>API: GET /hr/reviews
    API->>DB: PerformanceReview.find(query)
    API-->>E: { reviews }`,
      [
        { label: 'Daily Check-In', desc: 'Employee clocks in. The server uses today\'s date (YYYY-MM-DD) as a unique key with findOneAndUpdate + upsert to create or update the attendance record.', api: 'POST /api/v1/hr/attendance/check-in' },
        { label: 'Daily Check-Out', desc: 'Employee clocks out. The server updates the same date\'s record with the check-out timestamp.', api: 'POST /api/v1/hr/attendance/check-out' },
        { label: 'View Attendance History', desc: 'Returns the last 30 attendance records, scoped by buildHRQuery. Managers see their team\'s records.', api: 'GET /api/v1/hr/attendance' },
        { label: 'View Payslips', desc: 'Employee views uploaded payslips sorted by upload date (newest first). Scoped by role.', api: 'GET /api/v1/hr/payslips' },
        { label: 'Performance Reviews', desc: 'Employee views their performance review history. Managers can see reviews for their direct reports.', api: 'GET /api/v1/hr/reviews' },
        { label: 'HR Documents', desc: 'Employee accesses uploaded HR documents (contracts, certificates, etc.) sorted by upload date.', api: 'GET /api/v1/hr/documents' },
        { label: 'Company Policies', desc: 'All employees can view company policies, which are stored as OrgSetting entries with key prefix "policy_".', api: 'GET /api/v1/hr/policies' },
      ],
      { headers: ['Endpoint', 'Method', 'Scoping', 'Purpose'],
        rows: [
          ['<code>/hr/attendance/check-in</code>', 'POST', 'Self', 'Clock in'],
          ['<code>/hr/attendance/check-out</code>', 'POST', 'Self', 'Clock out'],
          ['<code>/hr/attendance</code>', 'GET', 'Admin/Manager/Self', 'View records'],
          ['<code>/hr/payslips</code>', 'GET', 'Admin/Manager/Self', 'View payslips'],
          ['<code>/hr/reviews</code>', 'GET', 'Admin/Manager/Self', 'View reviews'],
          ['<code>/hr/documents</code>', 'GET', 'Admin/Manager/Self', 'View documents'],
          ['<code>/hr/policies</code>', 'GET', 'All', 'View policies'],
        ]
      },
      true
    ),

    flowSection('hierarchy', '3. Organizational Hierarchy',
      'The reporting structure uses managerId and teamLeadId references on Player documents to establish a hierarchical chain that controls HR data visibility.',
      `graph TB
    ADMIN[System Administrator - role: admin] --> MGR[Manager - supportLevel: Manager]
    MGR --> TL[Team Lead - teamLeadId ref]
    MGR --> L2[L2 Agent]
    TL --> L1A[L1 Agent A]
    TL --> L1B[L1 Agent B]`,
      [
        { label: 'System Administrator', desc: 'Top-level role with unrestricted access to all data, settings, and operations. Can manage staff hierarchy, view all HR records, and configure org settings.' },
        { label: 'Manager (supportLevel: Manager)', desc: 'Mid-level role with visibility into direct reports\' HR data (leaves, attendance, reviews). Can approve/reject leave requests. Queries use buildHRQuery to scope data.' },
        { label: 'Team Lead', desc: 'Organizational reference via teamLeadId on Player documents. Team leads may have L1/L2 agents reporting to them. The teamLeadId is set by admin via the hierarchy endpoint.' },
        { label: 'L2 Agent', desc: 'Higher-level support agent with expanded ticket handling capabilities. Sees only their own HR records.' },
        { label: 'L1 Agent', desc: 'Entry-level support agent. Handles basic tickets and sees only their own HR records. Can be promoted to L2 or Manager via /support/manage-user.' },
        { label: 'Ex-Employee Detection', desc: 'The team directory automatically detects ex-employees by checking supportStatus === "terminated" or supportLevel === "EX-EMPLOYEE". These users are shown with "Ex-Employee" designation and isLive: false.' },
        { label: 'Setting Hierarchy', desc: 'Admin updates the reporting chain via POST /admin-core/team-directory/:id/hierarchy with managerId and teamLeadId. Each change is logged in AuditLog.', api: 'POST /admin-core/team-directory/:id/hierarchy { managerId, teamLeadId }' },
      ],
      null,
      true
    ),

    flowSection('ticket-lifecycle', '4. Support Ticket Lifecycle',
      'The support operations platform manages the complete ticket lifecycle from creation to resolution, with AI-powered summaries and analytics.',
      `graph TB
    NEW[New Ticket] --> CLAIM[Claimed]
    CLAIM --> PROGRESS[In Progress]
    PROGRESS --> RESOLVE[Resolved]
    PROGRESS --> ESCALATE[Escalated]
    ESCALATE --> PROGRESS
    RESOLVE --> CLOSED[Closed]
    CLAIM -->|Reassign| CLAIM
    PROGRESS -->|Transfer| CLAIM`,
      [
        { label: 'New Ticket', desc: 'Player submits a ticket with subject, description, and category. A SupportTicket document is created with status "open" and no assignee.', api: 'POST /api/v1/support/save-ticket { subject, description, category }' },
        { label: 'Claim', desc: 'An agent claims the ticket, setting themselves as the assignee. WebSocket broadcasts the update for real-time dashboard refreshes.', api: 'POST /api/v1/support/claim-ticket { ticketId }' },
        { label: 'In Progress', desc: 'Agent responds to the player (public reply) or adds internal notes. Messages are appended to the ticket\'s thread.', api: 'POST /api/v1/support/reply-ticket { ticketId, message, isInternal }' },
        { label: 'Escalate', desc: 'Agent or admin escalates the ticket\'s priority or support level (L1 → L2 → Manager) for complex issues.', api: 'POST /api/v1/support/escalate-ticket { ticketId, escalateToLevel }' },
        { label: 'Reassign / Transfer', desc: 'Ticket can be reassigned to a different agent or bulk-transferred during offboarding.', api: 'POST /support/reassign-ticket or /support/transfer-tickets' },
        { label: 'AI Summary', desc: 'Generate an AI-powered summary of the entire ticket thread using Groq/Cerebras LLM for quick context understanding.', api: 'POST /api/v1/support/ai-summary { ticketId }' },
        { label: 'Resolve & Rate', desc: 'Agent resolves the ticket. Player can rate the resolution quality (1-5 stars with optional feedback).', api: 'POST /support/update-ticket-status + /support/rate-ticket' },
        { label: 'Analytics', desc: 'Dashboard view with: open/closed counts, average resolution time, tickets per agent, SLA compliance, and export capability.', api: 'GET /api/v1/support/analytics' },
      ],
      null,
      true
    ),

    flowSection('deployment', '5. Deployment & Version Sync',
      'The deployment architecture requires strict synchronization of version constants across 4 files and a complete web rebuild pipeline for every frontend change.',
      `graph LR
    GIT[GitHub] --> APPJSON[app.json]
    GIT --> APPJS[App.js]
    GIT --> CONFIG[config.js]
    GIT --> SERVER[server.mjs]
    APPJSON --> EXPO[expo export -p web]
    EXPO --> DIST[dist/]
    DIST --> DEPLOY[cp to backend/public]
    DEPLOY --> SED[grep/sed version purge]
    SED --> RENDER[Render Deploy]
    GIT --> EAS[EAS Update - Mobile OTA]`,
      [
        { label: 'Version Constants (4 Files)', desc: 'Every deployment MUST synchronize APP_VERSION across: app.json (binary), App.js (frontend), config.js (initial state), and server.mjs (backend /api/status). Failure to sync server.mjs causes clients to report "Up to Date" incorrectly.' },
        { label: 'Web Export', desc: 'Frontend changes require npx expo export -p web to generate the production bundle. The output goes to dist/ folder.', api: 'npx expo export -p web' },
        { label: 'Deploy to backend/public', desc: 'The dist/ output replaces backend/public/ which serves the web admin portal. This is the only way frontend changes become visible on the live web app.', api: 'rm -rf backend/public && cp -R dist backend/public' },
        { label: 'Version String Purge', desc: 'A grep/sed command replaces all old version references in minified bundles. CRITICAL: Dots in version strings MUST be escaped (e.g., 2\\.6\\.625) to prevent sed from treating them as regex wildcards and corrupting CSS hex codes.', api: 'grep -Irl "OLD" backend/public | xargs sed -i \'s/OLD/NEW/g\'' },
        { label: 'Render Deploy (Backend + Web)', desc: 'Git push triggers automatic deployment on Render. The Express server serves both the API and the static web bundle from backend/public/.' },
        { label: 'EAS Update (Mobile OTA)', desc: 'Mobile app updates are pushed via Expo Application Services. Running eas update on production, preview, and main branches delivers over-the-air updates to all mobile clients.' },
        { label: 'Security Middleware Stack', desc: 'Every request passes through: CORS → Helmet (CSP, HSTS) → Rate Limiter → Cookie Parser → Body Parser (10MB) → Mongo Sanitize → CSP Nonce → API Key Guard → Auth Guard → CSRF Guard (admin/support routes).' },
      ],
      null,
      true
    ),
  ];

  return wrapHtml('Corporate (HR/Enterprise) Architecture', '🏢', 'HR operations, hierarchy, support platform, and deployment topology', sections.join(''));
}


// ========================================================
// PDF GENERATION
// ========================================================
async function generatePdf(html, outputPath, name) {
  console.log(`📄 Generating ${name}...`);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
  
  // Wait for Mermaid to render
  await page.waitForFunction(() => {
    const mermaidDivs = document.querySelectorAll('.mermaid');
    return Array.from(mermaidDivs).every(div => div.querySelector('svg'));
  }, { timeout: 30000 }).catch(() => {
    console.warn(`⚠️  Some Mermaid diagrams may not have rendered in ${name}`);
  });
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;color:#94A3B8;width:100%;text-align:center;font-family:Inter,sans-serif;">AceTrack Architecture — ${name}</div>`,
    footerTemplate: '<div style="font-size:8px;color:#94A3B8;width:100%;text-align:center;font-family:Inter,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  
  await browser.close();
  console.log(`✅ ${name} → ${outputPath}`);
}


// ========================================================
// MAIN
// ========================================================
async function main() {
  console.log('\n🚀 AceTrack Architecture PDF Generator\n');
  
  const docs = [
    { builder: buildPlayerHtml, file: '01_Player_Architecture.pdf', name: 'Player Architecture' },
    { builder: buildCoachHtml, file: '02_Coach_Architecture.pdf', name: 'Coach Architecture' },
    { builder: buildAcademyHtml, file: '03_Academy_Admin_Architecture.pdf', name: 'Academy (Admin) Architecture' },
    { builder: buildCorporateHtml, file: '04_Corporate_HR_Architecture.pdf', name: 'Corporate (HR) Architecture' },
  ];

  for (const doc of docs) {
    const html = doc.builder();
    const htmlPath = path.join(__dirname, doc.file.replace('.pdf', '.html'));
    const pdfPath = path.join(__dirname, doc.file);
    
    // Save HTML as well (for debugging)
    fs.writeFileSync(htmlPath, html);
    
    await generatePdf(html, pdfPath, doc.name);
  }
  
  console.log('\n🎉 All PDFs generated successfully!\n');
  console.log('Files:');
  docs.forEach(d => console.log(`  📄 Architecture/${d.file}`));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
