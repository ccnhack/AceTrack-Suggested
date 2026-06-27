# AceTrack API Endpoints Document

This document outlines the core REST endpoints available in the AceTrack backend after the modularization effort (v2.6.772).

## 1. Authentication & Session (`/api/v1/auth`, `/api/v1/admin`, `/api/v1/user`)
All auth routes are hardened with rate limiters (`loginLimiter`, `passwordResetLimiter`) and auditing.
- `GET /api/v1/auth/me` - Validates session and returns current user payload.
- `POST /api/v1/user/login` - Standard user/coach/academy login.
- `POST /api/v1/admin/login` - Step 1 of Admin Zero-Trust login (Password check).
- `POST /api/v1/admin/verify-pin` - Step 2 of Admin Zero-Trust login (MFA check).
- `POST /api/v1/support/login` - Support staff secure login.
- `POST /api/v1/logout` - Clears session and CSRF cookies.
- `POST /api/v1/auth/change-password` - Update current user password.
- `POST /api/v1/check-username` - Validates username availability during signup.

### Coach Invites
- `GET /api/v1/auth/coach-invite/validate` - Validates invite token status.
- `POST /api/v1/auth/coach-invite/track` - Tracks clicks/analytics on an invite.
- `POST /api/v1/auth/coach-invite/consume` - Marks token as used and affiliates the coach.
- `GET /api/v1/admin/coach-invites` - (Admin only) Lists all generated invites.

## 2. Admin & Core Analytics (`/api/v1/admin-core`)
- `GET /api/v1/admin-core/shift-analytics` - Fetches shift and support staff metrics.
- `GET /api/v1/admin-core/audit-logs` - Retrieves system-wide audit logs.
- `POST /api/v1/admin-core/audit-logs/export` - Triggers an export of the audit table.
- `POST /api/v1/admin-core/clear-mfa-history` - Flushes MFA brute-force logs.
- `POST /api/v1/admin/restore-last-state` - Emergency state reversion endpoint.

## 3. Human Resources & Shifts (`/api/v1/hr`, `/api/v1/support`)
- `POST /api/v1/support/check-in` - Initiates a support staff shift.
- `POST /api/v1/support/check-out` - Concludes a shift and calculates active hours.
- `GET /api/v1/support/shift-status` - Returns current shift block data for the logged-in user.
- `GET /api/v1/hr/attendance-history` - Retrieves paginated past shifts.
- `GET /api/v1/hr/my-payslips` - Retrieves payroll records.

## 4. Tournaments & Matchmaking (`/api/v1/tournaments`)
- `POST /api/v1/tournaments/create` - Creates a new tournament.
- `POST /api/v1/tournaments/generate-brackets` - (Admin/Academy) Auto-generates seeding brackets.
- `POST /api/v1/tournaments/update-score` - Posts match results and recalculates Elo ratings.
- `GET /api/v1/tournaments/:id/metrics` - Aggregated engagement metrics for a tournament.

## 5. Communications & Support (`/api/v1/comms`, `/api/v1/support`)
- `GET /api/v1/comms/org-chat` - Syncs organizational chat history.
- `POST /api/v1/comms/org-chat` - Pushes a new organization chat message.
- `GET /api/v1/support/tickets` - Lists support grievances.
- `POST /api/v1/support/tickets/:id/reply` - Adds a message to a ticket thread.
- `POST /api/v1/support/tickets/:id/reassign` - Shifts ownership of a ticket to another agent.

## 6. General Data Sync (`/api/v1/data`)
- `GET /api/v1/data` - Hydrates the frontend application store (Player, Tournament, System Status). Note: This endpoint is strictly sanitized to prevent PII exposure based on the active user token.
- `POST /api/v1/data` - Mutates user/app data states.
- `POST /api/v1/data/avatar` - Cloudinary avatar upload handler.

## 7. Infrastructure (`/api/v1/infrastructure`)
- `GET /api/status` - Health check, returns database readiness and `latestAppVersion`.
- `GET /api/diagnostics` - Aggregated view of active WebSockets, Memory, and Error rates.
