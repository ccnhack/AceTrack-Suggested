# AceTrack Project Rules & Versioning

This document tracks critical rules and workflows to ensure stability across mobile and web platforms.

## 🔄 Version Synchronization Rule
**CRITICAL**: Every time a new version is pushed (via GitHub or Expo OTA), the following three files **MUST** be synchronized to the same version number:

1.  **`app.json`**: Updated for binary versioning and EAS metadata.
2.  **`App.js`**: Updated `APP_VERSION` constant for the frontend "About" and update checks.
3.  **`config.js`**: Updated `APP_VERSION` constant for initial state hydration.
4.  **`backend/server.mjs`**: Updated `APP_VERSION` constant. This is used by the `/api/status` endpoint to tell clients what the "latest" version is.

**Failure to sync `backend/server.mjs` will cause existing apps to report they are "Up to Date" even when an update is available.**

## 📦 Pre-Built Asset Synchronization Rule
**CRITICAL**: Since the web deployment serves minified bundles from `backend/public/`, updating source constants is NOT enough. Every version bump **MUST** include a global string replacement in build artifacts:
1.  **Scope**: Target all `.js`, `.json`, and `.html` files in `backend/public/` and `dist/`.
2.  **Procedure**: Use a recursive `sed` or `grep|xargs` command to replace the OLD_VERSION with the NEW_VERSION. **CRITICAL**: You MUST escape the periods in the OLD_VERSION string (e.g., `2\.6\.625`) to prevent `sed` from treating them as wildcards and destroying minified CSS hex codes.
3.  **Command Template**: `grep -Irl "OLD_VERSION" backend/public dist | xargs sed -i '' 's/OLD_VERSION_ESCAPED/NEW_VERSION/g'` (e.g., `s/2\.6\.625/2.6.626/g`)
4.  **Validation**: Run `grep -r "OLD_VERSION" .` after the sync.

## 🌐 Web Build Rebuild Rule
**CRITICAL**: The production web deployment serves **pre-built static bundles** from `backend/public/`. Changing source files (`.js`, `.jsx`) does **NOT** update the live web app. Every git push that modifies **any** frontend source file **MUST** include a fresh web export.

1.  **Rebuild**: `npx expo export -p web`
2.  **Deploy**: `rm -rf backend/public && cp -R dist backend/public`
3.  **Purge Old Versions**: `grep -Irl "OLD_VERSION" backend/public dist | xargs sed -i '' 's/OLD_VERSION_ESCAPED/NEW_VERSION/g'`
4.  **Validate**: `grep -r "OLD_VERSION" backend/public dist | wc -l` → must be **0**

**Failure to rebuild will cause the live web app to serve stale JavaScript, making ALL frontend fixes invisible to users. This has caused production incidents.**

## 🚀 Deployment Checklist
- [ ] Update `app.json` version.
- [ ] Update `App.js` `APP_VERSION`.
- [ ] Update `config.js` `APP_VERSION`.
- [ ] Update `backend/server.mjs` `APP_VERSION`.
- [ ] **Rebuild Web**: `npx expo export -p web`
- [ ] **Deploy Web**: `rm -rf backend/public && cp -R dist backend/public`
- [ ] **Run Global Asset Purge**: `grep -Irl "OLD_VERSION" backend/public dist | xargs sed -i '' 's/OLD_VERSION_ESCAPED/NEW_VERSION/g'` (Ensure dots are escaped!)
- [ ] **Validate**: Confirm zero references to old version in `backend/public/` and `dist/`.
- [ ] Commit changes with the version tag in the message.
- [ ] Push to GitHub (triggers Render backend/web deploy).
- [ ] Run `eas update` for all relevant branches (`production`, `preview`, `main`).

## 🛠️ Diagnostics & Troubleshooting
- **Diagnostics API**: `https://acetrack-suggested.onrender.com/api/diagnostics?userId=<userId>`
- **Focus**: Always investigate `ReferenceError`, `TransformError`, and `HYDRATION` events in logs.

## 📜 Last 5 Major Objectives Summary
1.  **v2.6.344 Deployment**: **Support Operations Stabilization**. Fixed stale web build deployment, resolved missing `id` field in team directory endpoint (broke chat/messaging entirely), fixed mobile sidebar clipping, login redirect for support staff, and Report Issue routing.
2.  **v2.6.327 Deployment**: **Support Portal Latency & Asset Sync**. Reduced Support Portal load time from 30s to <2s by refactoring security middleware to indexed Player lookups and implementing thin projections for support roles. Established the "Pre-Built Asset Synchronization Rule" to prevent "Obsolete Version" loops in minified bundles.
3.  **v2.6.259 Deployment**: **Web-Only Admin Portal Hardening**. Strictly isolated Admin and Support login flows to the Web platform. This prevents regular mobile users from encountering security "Access Denied" errors and ensures that staff-only protocols are confined to the management suite.
4.  **v2.6.258 Deployment**: **Diag_Http-Only_After**. Finalized the Zero-Trust web authentication transition by implementing HttpOnly cookies and removing LocalStorage tokens. Restored "Active Devices" diagnostic visibility by hardening the WebSocket handshake with `ACE_API_KEY` fallbacks and whitelisting telemetry uploads for unauthenticated/obsolete clients.
5.  **v2.6.257 Deployment**: **Zero-Trust Data Lockdown & Web Asset Propagation**. Fixed a critical vulnerability where `/api/data` was exposing the entire app state to unauthenticated users. Hardened `getSanitizedState` to strictly isolate chatbot messages and PII. Resolved the "rectangle box" icon issue by fixing `.gitignore` to track bundled fonts and applying high-compatibility asset headers.
