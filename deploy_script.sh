#!/bin/bash
set -e
echo "Exporting web..."
npx expo export -p web
echo "Copying to backend/public..."
rm -rf backend/public
cp -R dist backend/public
echo "Purging old versions..."
FILES=$(grep -Irl "2.6.610" backend/public dist || true)
if [ -n "$FILES" ]; then
  for FILE in $FILES; do
    sed -i '' 's/2.6.610/2.6.611/g' "$FILE"
  done
fi
echo "Done"
