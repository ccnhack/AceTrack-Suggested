const fs = require('fs');

const lines = fs.readFileSync('backend/server.mjs', 'utf8').split('\n');

// 1. Remove Cumulative Security Summary
let s1 = lines.findIndex(l => l.includes('// 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)'));
let e1 = -1;
if (s1 !== -1) {
  for (let i = s1 + 1; i < lines.length; i++) {
    if (lines[i].includes('}, 5 * 60 * 1000);')) {
      e1 = i;
      break;
    }
  }
}

// 2. Remove app.get('/')
let s2 = lines.findIndex(l => l.includes("app.get('/', (req, res, next) => {"));
let e2 = -1;
if (s2 !== -1) {
  for (let i = s2 + 1; i < lines.length; i++) {
    if (lines[i].includes('});')) {
      e2 = i;
      break;
    }
  }
}

// 3. Remove Slack Interact and Health Check
let s3 = lines.findIndex(l => l.includes("// 🛡️ [SLACK INTERACTION ENDPOINT] (v2.6.212)"));
let e3 = -1;
if (s3 !== -1) {
  // Let's find Health check which is right below it... wait!
  // It's actually:
  // 900: // 🛡️ [SLACK INTERACTION ENDPOINT]
  // 1068: // Public Health Check
  // Let's just find the end of health check
  for (let i = s3 + 1; i < lines.length; i++) {
    if (lines[i].includes("res.json({ status: 'ok', uptime: process.uptime(), version: APP_VERSION });")) {
      e3 = i + 1; // including the });
      break;
    }
  }
}

// 4. Remove AI Aggregator
let s4 = lines.findIndex(l => l.includes('// 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195)'));
let e4 = -1;
if (s4 !== -1) {
  for (let i = s4 + 1; i < lines.length; i++) {
    if (lines[i].includes('}, 5 * 60 * 1000);')) {
      e4 = i;
      break;
    }
  }
}

console.log('Extracting:', { s1, e1, s2, e2, s3, e3, s4, e4 });

// To avoid index shifting, we'll mark lines for deletion
for (let i = 0; i < lines.length; i++) {
  if (s1 !== -1 && i >= s1 && i <= e1) lines[i] = null;
  if (s2 !== -1 && i >= s2 && i <= e2) lines[i] = null;
  if (s3 !== -1 && i >= s3 && i <= e3) lines[i] = null;
  if (s4 !== -1 && i >= s4 && i <= e4) lines[i] = null;
}

const newLines = lines.filter(l => l !== null);
fs.writeFileSync('backend/server.mjs', newLines.join('\n'));
console.log('✅ Extraction removed successfully.');
