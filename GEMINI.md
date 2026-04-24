# AceTrack Project Rules & Versioning

This document tracks critical rules and workflows to ensure stability across mobile and web platforms.

## 🔄 Version Synchronization Rule
**CRITICAL**: Every time a new version is pushed (via GitHub or Expo OTA), the following three files **MUST** be synchronized to the same version number:

1.  **`app.json`**: Updated for binary versioning and EAS metadata.
2.  **`App.js`**: Updated `APP_VERSION` constant for the frontend "About" and update checks.
3.  **`backend/server.mjs`**: Updated `APP_VERSION` constant. This is used by the `/api/status` endpoint to tell clients what the "latest" version is.

**Failure to sync `backend/server.mjs` will cause existing apps to report they are "Up to Date" even when an update is available.**

## 🚀 Deployment Checklist
- [ ] Update `app.json` version.
- [ ] Update `App.js` `APP_VERSION`.
- [ ] Update `backend/server.mjs` `APP_VERSION`.
- [ ] Commit changes with the version tag in the message.
- [ ] Push to GitHub (triggers Render backend/web deploy).
- [ ] Run `eas update` for all relevant branches (`production`, `preview`, `main`).

## 🛠️ Diagnostics & Troubleshooting
- **Diagnostics API**: `https://acetrack-suggested.onrender.com/api/diagnostics?userId=<userId>`
- **Focus**: Always investigate `ReferenceError`, `TransformError`, and `HYDRATION` events in logs.

## 📜 Last 5 Major Objectives Summary
1.  **v2.6.258 Deployment**: **Diag_Http-Only_After**. Finalized the Zero-Trust web authentication transition by implementing HttpOnly cookies and removing LocalStorage tokens. Restored "Active Devices" diagnostic visibility by hardening the WebSocket handshake with `ACE_API_KEY` fallbacks and whitelisting telemetry uploads for unauthenticated/obsolete clients.
2.  **v2.6.257 Deployment**: **Zero-Trust Data Lockdown & Web Asset Propagation**. Fixed a critical vulnerability where `/api/data` was exposing the entire app state to unauthenticated users. Hardened `getSanitizedState` to strictly isolate chatbot messages and PII. Resolved the "rectangle box" icon issue by fixing `.gitignore` to track bundled fonts and applying high-compatibility asset headers.
3.  **v2.6.62 Deployment**: **Landing Page & Security Hardening**. Split iOS/Android landing pages, fixed iPhone layout overlap, and implemented the "Ultimate Admin Guard" to restrict admin privileges to the System Admin ID only.
4.  **v2.6.61 Deployment**: **Admin Hub Sync & Badge Resolution**. Decoupled badge state from user profile, implemented server-side Union Merge for acknowledgments, and resolved the "Phantom Ticket Generator" bug.
5.  **v2.6.51 Deployment**: **Security Hardening & Admin Guard**. Restricted 'admin' role privileges strictly to the System Admin account (ID: admin).
