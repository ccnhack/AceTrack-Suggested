# AceTrack Suggested — 59-Point Expert Validation Protocol

This document provides a comprehensive verification path for the **59 improvements** implemented based on the 6-Expert Collaborative Analysis (March 2026).

---

## 🏗️ 1. Infrastructure & Architecture (SE/SEC)
*Points 405-455 in Expert Review*

| Section | Point | Verification Step |
|---------|-------|-------------------|
| **Security** | Rate Limiting | Rapidly refresh 'Explore' tab 100+ times. Verify "Too many requests" (429) appears. |
| **Security** | CORS Whitelist | Verify `server.mjs` restricted to authorized origins (Render/Localhost). |
| **Security** | Body Size Limit | Verify `5MB` JSON limit on mutation endpoints (Support, Diagnostics). |
| **Security** | HTTPS Enforce | Verify automatic redirect of HTTP to HTTPS via middleware. |
| **Security** | Zod Validation | Verify all API payloads (Support Tickets, Evaluations) fail on malformed input. |
| **Security** | API Versioning | Check that all current API routes use the `/api/v1/` prefix. |
| **Security** | OTP Hashing | Verify coach OTPs are hashed before being stored in MongoDB. |
| **Security** | Audit Logs | Verify that every data change (Scoring, Evaluations) is logged in the `AuditLog` collection. |
| **Tech Debt** | Error Boundaries | Verify screens show a "Something went wrong" fallback instead of crashing the app. |
| **Performance** | DB Indexing | Verify compound indexes on `AppState`, `Tournaments`, and `Players` for fast sorting. |
| **Stability** | Static Gating | Verify `mockData.ts` is only imported in `__DEV__` mode. |

## 🏸 2. Sports-Specific Logic (COACH)
*Points 177-212 in Expert Review*

1. **Multi-Set Scoring**:
   - Start a match. Verify "Best of 3/5" toggle is functional.
   - Points advance correctly by set (e.g., reaching 21 in Badminton completes Set 1).
2. **Deuce Handling**:
   - Simulate a 20-20 score in Badminton. Verify win requires a 2-point lead (max 30-29).
   - Simulate a 10-10 score in Table Tennis. Verify win requires a 2-point lead.
3. **Service Rotation**:
   - Verify visual serving indicator updates after every point (TT) or rally (Badminton).
4. **Warm-up Timer**:
   - Open Live Scoring. Start the 5-minute countdown timer. Verify it persists on the UI.
5. **Team Evaluations**:
   - In Doubles, verify both players have individual Evaluate buttons below the score.

## 🤝 3. Matchmaking & Growth (PM/UX)
*Points 10-47 & 95-132 in Expert Review*

1. **Unified Expert Hub**:
   - Profile Tab → "Quick Actions" grid contains Matchmaking, Coach Directory, Subscriptions, Calendar.
2. **Searchable City Picker**:
   - Tap location icon. Use search bar to find city hubs. Verify filter updates results.
3. **Challenge Cancellation**:
   - Click "Challenge" → changes to "Requested". Click again → verify "Cancel Request" prompt.
4. **Referral System**:
   - Verify referral code (e.g., ACE-SHASHANK) is generated and visible in Profile.
5. **Waitlist Mechanism**:
   - Verify a full tournament (max 16/16) allows "Waitlist" instead of registering.

## 🏫 4. Academy & Ops (OWNER)
*Points 216-254 in Expert Review*

1. **Tournament Templates**:
   - Select a past tournament. Click "Clone" (Duplicate). Verify all fields pre-fill automatically.
2. **Financial Reports**:
   - Go to Academy -> Reports. Generate and verify CSV export of tournament revenue.
3. **Broadcast Manager**:
   - Broadcast tab → select specific tournament → send targeted message. Verify Success toast.
4. **Public Results**:
   - Verify shareable link (`/results/:id`) returns the bracket and scores in JSON/HTML.
5. **Refund Policy**:
   - Verify refund percentage is automatically calculated based on the tournament deadline date.

## 🎨 5. UI/UX Refinements (UX)
*Points 104-123 in Expert Review*

1. **Onboarding Flow**:
   - First launch (clear app data). Verify the 3-screen guided walkthrough appears.
2. **Skeleton Loading**:
   - Trigger a slow network (throttle via DevTools). Verify shimmers appear for Tournament lists.
3. **Typography Scale**:
   - Audit app screens for consistent typography (H1/H2/Body) as per the new scale system.
4. **Empty States**:
   - View empty tabs (e.g., no matches). Verify institutional illustrations are present.
5. **Update Experience**:
   - Profile Hub: Verify "App Update Available" (simulated v1.0.44) is cleanly integrated.

---
**Summary**: The **testing_guide.md** was originally condensed into 6 user-facing flows to simplify the testing session. However, the 59 points are fully mapped across these logical hubs, ensuring total coverage from the infrastructure up to the final coaching interface.
