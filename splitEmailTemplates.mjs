import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'backend', 'email', 'templates');

// passwordReset.mjs — lines 278-580 of original
const src = fs.readFileSync(path.join(dir, 'index.mjs'), 'utf8');

// We'll extract each function by finding its boundaries
function extractFunctions(source, funcNames) {
  let result = '';
  for (const name of funcNames) {
    // Match exported function (async or not)
    const patterns = [
      new RegExp(`(export\\s+async\\s+function\\s+${name}\\s*\\([\\s\\S]*?\\n\\})`, 'm'),
      new RegExp(`(export\\s+function\\s+${name}\\s*\\([\\s\\S]*?\\n\\})`, 'm')
    ];
    for (const pat of patterns) {
      const match = source.match(pat);
      if (match) {
        result += match[1] + '\n\n';
        break;
      }
    }
  }
  return result;
}

// ─── passwordReset.mjs ──────────────────────────────────────
const passwordResetContent = `import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🔒 Password Reset Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

${extractFunctions(src, ['sendPasswordResetEmail', 'buildForceResetHtml', 'sendAdminResetPasswordEmail'])}
`;
fs.writeFileSync(path.join(dir, 'passwordReset.mjs'), passwordResetContent);
console.log('✅ passwordReset.mjs');

// ─── welcome.mjs ──────────────────────────────────────────
const welcomeContent = `import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🎉 Welcome & Credentials Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

${extractFunctions(src, ['buildWelcomeHtml', 'buildCredentialsHtml', 'sendOnboardingSuccessEmail', 'sendLoginDetailsEmail'])}
`;
fs.writeFileSync(path.join(dir, 'welcome.mjs'), welcomeContent);
console.log('✅ welcome.mjs');

// ─── coachInvite.mjs ──────────────────────────────────────────
const coachInviteContent = `import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🏆 Coach Invitation Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

${extractFunctions(src, ['buildCoachInviteHtml', 'sendCoachInviteEmail'])}
`;
fs.writeFileSync(path.join(dir, 'coachInvite.mjs'), coachInviteContent);
console.log('✅ coachInvite.mjs');

// ─── hr.mjs ──────────────────────────────────────────
const hrContent = `import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 👔 HR Email Templates (Promotion, Demotion, Termination, Suspension, Re-Onboarding)
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

${extractFunctions(src, ['buildPromotionHtml', 'sendPromotionEmail', 'buildDemotionHtml', 'sendDemotionEmail', 'buildTerminationHtml', 'sendTerminationEmail', 'buildReOnboardingHtml', 'sendReOnboardingEmail', 'buildSuspensionHtml', 'sendSuspensionEmail'])}
`;
fs.writeFileSync(path.join(dir, 'hr.mjs'), hrContent);
console.log('✅ hr.mjs');

// ─── security.mjs ──────────────────────────────────────────
const securityContent = `import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🚨 Security Alert Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

${extractFunctions(src, ['sendSecurityAlertEmail'])}
`;
fs.writeFileSync(path.join(dir, 'security.mjs'), securityContent);
console.log('✅ security.mjs');

// ─── New index.mjs (barrel re-export) ──────────────────────────────────────────
const barrelContent = `// ═══════════════════════════════════════════════════════════════
// 📧 Email Templates — Barrel Re-Export
// Phase 1D: Modular Email Service (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export { buildOnboardingHtml, sendOnboardingEmail } from './onboarding.mjs';
export { sendPasswordResetEmail, buildForceResetHtml, sendAdminResetPasswordEmail } from './passwordReset.mjs';
export { buildWelcomeHtml, buildCredentialsHtml, sendOnboardingSuccessEmail, sendLoginDetailsEmail } from './welcome.mjs';
export { buildCoachInviteHtml, sendCoachInviteEmail } from './coachInvite.mjs';
export { buildPromotionHtml, sendPromotionEmail, buildDemotionHtml, sendDemotionEmail, buildTerminationHtml, sendTerminationEmail, buildReOnboardingHtml, sendReOnboardingEmail, buildSuspensionHtml, sendSuspensionEmail } from './hr.mjs';
export { sendSecurityAlertEmail } from './security.mjs';
`;
fs.writeFileSync(path.join(dir, 'index.mjs'), barrelContent);
console.log('✅ index.mjs (barrel)');

console.log('\n🎉 Phase 1D email split complete!');
