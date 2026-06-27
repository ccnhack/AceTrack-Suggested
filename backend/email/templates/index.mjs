// ═══════════════════════════════════════════════════════════════
// 📧 Email Templates — Barrel Re-Export
// Phase 1D: Modular Email Service (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export { buildOnboardingHtml, sendOnboardingEmail } from './onboarding.mjs';
export { sendPasswordResetEmail, buildForceResetHtml, sendAdminResetPasswordEmail } from './passwordReset.mjs';
export { buildWelcomeHtml, buildCredentialsHtml, sendOnboardingSuccessEmail, sendLoginDetailsEmail } from './welcome.mjs';
export { buildCoachInviteHtml, sendCoachInviteEmail } from './coachInvite.mjs';
export { buildPromotionHtml, sendPromotionEmail, buildDemotionHtml, sendDemotionEmail, buildTerminationHtml, sendTerminationEmail, buildReOnboardingHtml, sendReOnboardingEmail, buildSuspensionHtml, sendSuspensionEmail } from './hr.mjs';
export { sendSecurityAlertEmail } from './security.mjs';
