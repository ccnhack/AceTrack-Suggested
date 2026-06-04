#!/bin/bash
set -e
git add App.js config.js backend/server.mjs app.json components/DoublesPartnerBoard.js screens/ExploreScreen.js backend/public
git commit -m "v2.6.611: Auto-trigger payment modal for partner request team joins & restore strict gender matching"
git push

echo "Deploying to EAS production..."
eas update --branch production --message "v2.6.611: Auto-trigger payment modal for partner request team joins" --non-interactive || true

echo "Deploying to EAS preview..."
eas update --branch preview --message "v2.6.611: Auto-trigger payment modal for partner request team joins" --non-interactive || true

echo "Deploying to EAS main..."
eas update --branch main --message "v2.6.611: Auto-trigger payment modal for partner request team joins" --non-interactive || true

echo "EAS Deployments Complete!"
