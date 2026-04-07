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
1.  **v2.6.27 Deployment**: **Insights & Web-Activity_Fixed**. Integrated Insights Tab into Admin Hub for Web/Mobile, hardened WebSocket device status reporting for browser consistency, and synchronized versions across platform.
2.  **v2.6.26 Deployment**: **Working_Enhanced_Support_Center**. Implemented "Jump to Original Message" (Reply-scroll), Unified Deep Search in Admin Hub, and Draggable AI ChatBot.
3.  **v2.3.2 Deployment**: Implemented Tournament Interest Workflow, added real-time reactivity to modals, and refined UI font sizes/labels.
4.  **v2.3.1 Deployment**: Fixed Matchmaking real-time sync, resolved WebSocket race conditions, and hardened identity management.
5.  **v2.2.5 Deployment**: Fixed Matchmaking 400 error, session logout bug, and hardened notifications against emulator crashes.
