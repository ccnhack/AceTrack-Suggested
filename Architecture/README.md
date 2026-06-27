# AceTrack Architecture & Monolith Decomposition

## 1. Overview
AceTrack is built as an Expo React Native frontend (supporting Web, iOS, Android) paired with a Node/Express backend powered by MongoDB. 
Following the Phase 1 and 2 monolith decomposition, the codebase has transitioned from large monolithic structures into a highly modular, service-oriented architecture.

## 2. Backend Architecture (Post-Decomposition)
The Express backend routing has been aggressively decomposed into thin handlers and rich services.

### Thin Routes (`backend/routes/`)
- `auth.mjs`: Core authentication (Login, MFA, Password Reset).
- `tournaments.mjs`: Tournament operations.
- `admin_core.mjs`: Admin analytics, grid views, and system management.
- `hr.mjs`: Human Resources and Leaves management.
- `support.mjs`: Support operations.
- `comms.mjs`: Websockets and cross-player messaging.
- `infrastructure.mjs`: Health checks and database status.

### Service Layer (`backend/services/`)
Business logic is decoupled from HTTP requests. Key services:
- `AuthService.mjs`: Hashing, MFA, token generation, user validation.
- `TournamentService.mjs`: Brackets, match generation, Elo updates.
- `ShiftAnalyticsService.mjs`: Admin analytics processing.
- `CoachInviteService.mjs`: Coach invitation lifecycle.
- `AuditService.mjs`: System-wide security/action logging.

### Security & Hardening (`backend/middleware/`)
- `errorHandler.mjs`: Global fallback for unhandled route errors.
- `validation.mjs`: Zod-based request validation payload.
- `security.mjs`: Rate limiters, CSRF, API key guards.

## 3. Frontend Architecture (React Native God-Component Decomposition)
Historically, the AceTrack UI contained "God-Components" that exceeded 2,500 lines. The primary contributor was massive inline `StyleSheet.create` blocks. 
These have been decomposed to improve hot-reload speeds and maintainability:

### Component & Style Separation
| Component | Styles Extracted To | Net Reduction |
| :--- | :--- | :--- |
| `AdminGrievancesPanel.js` | `grievances/AdminGrievancesPanel.styles.js` | ~1,000 lines |
| `ProfileScreen.js` | `profile/ProfileScreen.styles.js` | ~1,000 lines |
| `SupportTicketSystem.js`| `tickets/SupportTicketSystem.styles.js` | ~1,000 lines |
| `MatchmakingScreen.js` | `matchmaking/MatchmakingScreen.styles.js` | ~500 lines |
| `AdminSupportTeamPanel.js`| `AdminSupportTeamPanel.styles.js` | ~250 lines |

## 4. State Management (Current Hybrid)
- **Local State**: Context API (AuthContext, SyncContext) used for highly reactive component-level states.
- **Global State**: Zustand used for persistent stores (`useTournamentsStore`, `usePlayersStore`, `useSupportStore`, `useEvaluationsStore`).

## 5. Deployment Rules
- **Backend Deployment**: Handled automatically via Render `main` branch pushes. 
- **Web Build Updates**: Requires rebuilding `dist/` and moving it to `backend/public/`. Source strings MUST be regex-replaced via `sed` to bust the caching mechanism (refer to `GEMINI.md` Pre-Built Asset Synchronization Rule).
