#!/bin/bash
set -e

echo "Building web..."
npx expo export -p web

echo "Deploying web bundle..."
rm -rf backend/public
cp -R dist backend/public

echo "Purging old version strings in bundles..."
grep -Irl "2.6.611" backend/public dist | xargs sed -i '' 's/2.6.611/2.6.612/g' || true

echo "Pushing to Git..."
git add App.js config.js backend/server.mjs app.json stores/hooks.js backend/public
git commit -m "v2.6.612: Fix UI state staleness for partner request removal"
git push

echo "Deploying to EAS production..."
eas update --branch production --message "v2.6.612: Fix UI state staleness for partner request removal" --non-interactive || true

echo "Deploying to EAS preview..."
eas update --branch preview --message "v2.6.612: Fix UI state staleness for partner request removal" --non-interactive || true

echo "Deploying to EAS main..."
eas update --branch main --message "v2.6.612: Fix UI state staleness for partner request removal" --non-interactive || true

echo "EAS Deployments Complete!"
