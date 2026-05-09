# AceTrack API Endpoint Registry
> **Last Updated**: 2026-05-10 | **Version**: 2.6.333  
> **Base URL**: `https://acetrack-suggested.onrender.com`

## Authentication Headers

| Header | Value | Required |
|--------|-------|----------|
| `x-ace-api-key` | `AceTrack_Client_v2_Production` (Public App ID) | For public routes |
| `x-ace-api-key` | `${ACE_API_KEY}` (Master Key from Render env) | For protected routes |
| `Authorization` | `Bearer <JWT>` | For authenticated routes |
| `Cookie` | `acetrack_session=<JWT>` | For web sessions (HttpOnly) |
| `Content-Type` | `application/json` | For POST/PUT requests |

## Route Mounting

All routes are mounted under both `/api` and `/api/v1` for backward compatibility.

---

## 🔐 Authentication Routes (`routes/auth.mjs`)

| # | Method | Path | Auth | Rate Limiter | Description |
|---|--------|------|------|--------------|-------------|
| 1 | `GET` | `/api/auth/me` | API Key + Cookie | — | Validate active session, return sanitized user |
| 2 | `POST` | `/api/admin/login` | — | loginLimiter | Admin login (returns MFA challenge) |
| 3 | `POST` | `/api/admin/verify-pin` | — | — | Verify admin MFA PIN |
| 4 | `POST` | `/api/admin/restore-last-state` | API Key | — | Emergency: restore previous app state |
| 5 | `POST` | `/api/logout` | — | — | Clear session cookie |
| 6 | `POST` | `/api/user/login` | — | loginLimiter | Regular player login |
| 7 | `POST` | `/api/support/login` | — | loginLimiter | Support staff login (issues JWT + cookie) |
| 8 | `POST` | `/api/support/password-reset/request` | — | passwordResetLimiter | Initiate password recovery email |
| 9 | `POST` | `/api/support/password-reset/confirm` | — | — | Confirm password reset with token |

---

## 📊 Data & Sync Routes (`routes/data.mjs`)

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 10 | `GET` | `/api/data` | API Key (Public OK for GET) | Fetch full sanitized app state |
| 11 | `GET` | `/api/player/:id` | API Key + Auth | Fetch single player data |
| 12 | `GET` | `/api/status` | API Key (Public OK) | App version, uptime, DB status |
| 13 | `POST` | `/api/save` | API Key | Save/sync app state (validated) |
| 14 | `POST` | `/api/upload` | API Key | Upload video recording |
| 15 | `POST` | `/api/register-push-token` | API Key | Register push notification token |

---

## 🩺 Diagnostics Routes (`routes/data.mjs`)

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 16 | `GET` | `/api/diagnostics` | API Key | Fetch user diagnostics (query: `userId`) |
| 17 | `GET` | `/api/diagnostics/raw_events` | API Key | Fetch raw diagnostic events |
| 18 | `GET` | `/api/diagnostics/:filename` | API Key | Download specific diagnostic file |
| 19 | `POST` | `/api/diagnostics` | API Key (Public OK) | Submit diagnostic telemetry |
| 20 | `POST` | `/api/diagnostics/auto-flush` | API Key (Public OK) | Submit batched auto-flush telemetry |
| 21 | `GET` | `/api/audit-logs` | API Key | Fetch security audit logs |

---

## 🎫 Support & Ticket Routes (`routes/support.mjs`)

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 22 | `POST` | `/api/otp/send` | API Key (Public OK) | Send OTP to phone/email |
| 23 | `POST` | `/api/otp/verify` | API Key (Public OK) | Verify OTP code |
| 24 | `POST` | `/api/support/invite` | API Key | Generate employee onboarding invite |
| 25 | `GET` | `/api/support/invite/preview` | — | Preview onboarding email HTML |
| 26 | `GET` | `/api/support/invites` | API Key + Auth | List all invites |
| 27 | `POST` | `/api/support/invite/expire` | API Key | Expire an invite |
| 28 | `POST` | `/api/support/invite/resend` | API Key | Resend invite email |
| 29 | `POST` | `/api/support/invite/click` | — | Track invite link click |
| 30 | `POST` | `/api/support/invite/track` | — | Track invite interaction |
| 31 | `POST` | `/api/support/invite/setup` | — | Complete employee setup (multipart) |
| 32 | `GET` | `/api/debug/active-sessions` | — | List active WebSocket sessions |
| 33 | `GET` | `/api/support/session-status/:userId` | API Key (Public OK) | Get user's session status |
| 34 | `GET` | `/api/support/attendance` | API Key + Auth | Attendance data for support staff |
| 35 | `GET` | `/api/support/analytics` | API Key + Auth | Support analytics dashboard data |
| 36 | `GET` | `/api/support/export` | API Key + Auth | Export support data |
| 37 | `POST` | `/api/support/manage-user` | API Key | Admin: promote/demote/terminate employee |
| 38 | `POST` | `/api/support/transfer-tickets` | API Key | Transfer tickets between agents |
| 39 | `POST` | `/api/support/ai-summary` | API Key (Public OK) | AI-generated ticket summary |
| 40 | `POST` | `/api/support/reassign-ticket` | API Key | Reassign a ticket to another agent |
| 41 | `POST` | `/api/support/rate-ticket` | API Key | Submit ticket rating |
| 42 | `POST` | `/api/support/claim-ticket` | API Key | Claim an unassigned ticket |
| 43 | `POST` | `/api/support/force-reset` | API Key | Admin: force-reset employee password |

---

## 🏗️ Infrastructure Routes (`routes/infrastructure.mjs`)

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 44 | `GET` | `/api/health` | — | Health check (status, version, uptime) |
| 45 | `POST` | `/api/slack/interact` | — | Slack webhook interaction handler |

---

## 🌐 Web Page Routes (`routes/web.mjs`)

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 46 | `GET` | `/reset-password/:token` | — | Password reset form page |
| 47 | `GET` | `/results/:tournamentId` | — | Public tournament results page |
| 48 | `GET` | `/setup/:token` | — | Employee onboarding setup page |
| 49 | `GET` | `/` | — | SPA entry (serves `index.html`) |

---

## Running Regression Tests

```bash
# Run the full endpoint regression suite against Render production
node backend/tests/endpoint_regression.test.mjs

# Run against local server
API_BASE_URL=http://localhost:3005 node backend/tests/endpoint_regression.test.mjs
```

The regression test automatically reads `MONGODB_URI` from the `.env` file to create test fixtures and validates all endpoint categories:
- **Reachability**: HTTP status codes (not 404/502/503)
- **Auth Guard**: Correct 401/403 on protected endpoints
- **Response Shape**: JSON structure validation
- **SMTP Timeout**: Verifies email endpoints don't hang
