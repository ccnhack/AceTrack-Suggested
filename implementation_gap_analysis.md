# AceTrack Expert Panel — Implementation & Testing Gap Analysis

This document identifies which of the **59 Expert Panel recommendations** have been implemented and maps them to specific test cases, user roles, and detailed points of verification.

---

## ✅ 1. Implemented Improvements (Ready for Test)

| Feature Category | Elaborated Details & Verification Points | User Account | Test Step |
|------------------|-------------------------------------------|--------------|-----------|
| **Core Security (SEC)** | • **Rate Limiting**: Added `express-rate-limit` (100 req/min general, 5 req/min on OTP) to prevent brute-force attacks.<br>• **CORS Whitelist**: Strictly restricted API access to authorized Render and local dev domains only.<br>• **Zod Schema Validation**: Every mutation endpoint (Support, Evaluations) now validates the request body structure.<br>• **OTP Hashing**: Replaced plaintext storage with secure `bcrypt` hashes for all tournament and coach codes. | *Technical* | Rapid refresh on 'Explore' (triggers 429). |
| **Academy Hub (OWNER)** | • **Premium Header**: Displays real-time KPIs (Total Participants, Active Events) with institucional typography.<br>• **Segmented Navigation**: Sub-tabs redesigned as a modern pill-shaped control with high-contrast active state.<br>• **Interactive OTP Toggle**: Added a 'Reveal/Hide' state machine on tournament cards to protect codes on-screen.<br>• **Roster Sync**: Synchronized dashboard participant counts with the detailed roster view (e.g., 2/16 status). | `arjun` | Academy Hub → Reports (CSV) / Tournament Card (OTP Toggle). |
| **Operations (OWNER)** | • **Tournament Cloning**: One-click "Clone" system for past tournaments, pre-filling all configuration fields.<br>• **CSV Financials**: One-tap export of revenue, entry fees, and refund data to CSV via `expo-file-system`.<br>• **Broadcast Manager**: Targeted messaging system to push announcements to specific participant groups (e.g., Registered only).<br>• **Refund Enforcement**: Automatic calculation of refund amounts based on per-tournament deadlines. | `arjun` | Select past tournament → Clone. Refund status in Player opt-out. |
| **Sports Logic (COACH)** | • **Multi-Set Scoring**: Updated match model for "Best of 3" and "Best of 5" with individual set score tracking.<br>• **Deuce Rule Engine**: Built-in score validation for Badminton (21 pts, max 30) and Table Tennis (11 pts, uncapped deuce).<br>• **Service Rotation**: Visual serving indicator that auto-rotates every 2 points (TT) or upon rally wins (Badminton).<br>• **Warm-up Timer**: Integrated a configurable 5-minute countdown clock directly in the Live Scoring interface. | `coach@test.com` | Match → Live Scoring. Advance sets to verify counter. |
| **Coaching Tools (COACH)** | • **Team Evaluations**: Independent "Evaluate" buttons for each player in Doubles, persisting results to player history.<br>• **Mentorship Notes**: Integrated "Coach Notes" sub-field for logging qualitative feedback during points/matches.<br>• **Video Bookmarks**: Added timestamp bookmarking (e.g., "Watch 2:15-2:45") shareable with players in the Video tab. | `coach@test.com` | Match → Evaluate. Watch Match Video → Add Bookmark. |
| **UX & Design (UX)** | • **3-Screen Onboarding**: A guided "Tour of Excellence" walking first-time users through the Academy Hub ecosystem.<br>• **Skeleton Loaders**: Shimmering placeholders for all data-heavy lists (Tournaments, Matches) to prevent jarring pops.<br>• **Typography Scale**: Standardized 5-tier institutional font scale applied via a central `designSystem` theme file.<br>• **Expert Hub**: Unified Profile tab with a high-fidelity "Quick Actions" grid consolidating all feature hubs. | `rohan@test.com` | First launch (Onboarding). Profile → Quick Actions Grid. |
| **Discovery (PM)** | • **Searchable City Discovery**: Inline expanding dropdown with keyword search across all metro city hubs.<br>• **Challenge Cancellation**: Added a "Requested" state to matchmaking with a secondary "Cancel Request" confirmation.<br>• **Referral System**: Unique referral code per user with wallet credit rewards for successful onboarding. | `shashank@test.com`| Matchmaking → Search for 'Mumbai' → Challenge → Cancel. |
| **Stability (SE)** | • **Defensive Image Patterns**: Global `null`/`undefined` fallback logic for all remote URIs (Avatars, Previews) to prevent crashes.<br>• **Error Boundaries**: Every screen wrapped in a `<ErrorBoundary>` to catch component-level crashes and offer a Retry UI. | *System* | Integrated across all management screens. |

---

## ⏳ 2. Pending & Deferred Improvements (Backlog)

These items were either deferred due to high architectural risk or prioritized for the Phase 2 roadmap.

| Recommendation | Status | Rationale |
|----------------|--------|-----------|
| **Full Modularization** | 🔴 Deferred | Breaking the 2100-line `App.js` monolith was deemed too high-risk for the current "Suggested" sprint. |
| **Firebase Auth (JWT)** | 🟠 Pending | Firebase Client configuration is ready, but full Bearer Token integration is awaiting a secure environment. |
| **Dynamic Geolocation** | 🟠 Pending | City hubs & Proximity sorting are live using distance fallbacks. Native GPS sorting requires Google Maps API binding. |
| **Push Notifications** | 🟠 Scaffolded | Notification pipeline is scaffolded (`expo-notifications`), but requires external console binding and token management. |
| **Redis Caching** | 🟡 Backlog | Infrastructure target for the high-volume scalability phase (10K+ concurrent users). |
| **Dark Mode** | 🟡 Backlog | Q4 UX Roadmap priority. Current UI focuses on a "Premium Institutional" Light Mode. |
| **Staff/Volunteer Roles** | 🔴 Deferred | Lower priority compared to core scoring, finance, and matchmaking features. |

---

## 🕹️ 3. Comprehensive Test Protocol (Summary)

### A. Academy Administrator (`arjun` / Admin Role)
1.  **Academy Hub**: Verify the "Premium Layout" — high-fidelity tournament cards and participant counts.
2.  **OTP Security**: Use the `OTP` toggle on any tournament card to hide/reveal sensitive codes.
3.  **Financials/Templating**: Export a revenue CSV and test the "Clone" action on past tournaments.

### B. Professional Coach (`coach@test.com` / `password`)
1.  **Live Scoring**: Verify the multi-set logic and deuce capping in Badminton matches.
2.  **Tracking**: Save a team evaluation and verify it persists to the player's performance history.

### C. Competitive Player (`shashank@test.com` / `rohan@test.com`)
1.  **Onboarding/Hub**: Re-view the 3-step tour and use the "Quick Actions" grid in the Profile tab.
2.  **Matchmaking**: Perform city-based search and test the "Challenge/Cancel" request flow.
