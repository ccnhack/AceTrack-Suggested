import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AppState, AuditLog, SupportInvite, Player, SupportTicket } from '../../models/index.mjs';
import { asyncHandler, getISTTimestamp, getISTDate } from '../../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../../middleware/security.mjs';
import {
  sendOnboardingEmail,
  buildOnboardingHtml,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail,
  sendSuspensionEmail
} from '../../emailService.mjs';
import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';

// 🏗️ PHASE 1 (DATABASE) MIGRATION HELPER
// Ensures that direct backend state mutations are immediately synced to distinct collections
async function syncCollectionsFromState(state) {
    const upsertEntities = async (Model, entities) => {
       if (!entities || entities.length === 0) return;
       const bulkOps = entities.map(entity => {
          const entityId = String(entity.id || entity._id || Math.random().toString(36).substring(7));
          return {
             updateOne: { filter: { id: entityId }, update: { $set: { id: entityId, data: entity, lastUpdated: new Date() } }, upsert: true }
          };
       });
       if (bulkOps.length > 0) await Model.bulkWrite(bulkOps);
    };
    await Promise.all([
      upsertEntities(Player, state?.data?.players),
      upsertEntities(SupportTicket, state?.data?.supportTickets)
    ]);
}

export default function ({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions,
  syncMutex
}) {
  const router = express.Router();

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/otp/send', otpLimiter, apiKeyGuard, (req, res) => {
  const { target, type } = req.body; // target is email/phone, type is 'email' or 'phone'
  console.log(`🔑 [OTP_SIMULATION] Code "123456" requested for ${type}: ${target}`);
  logServerEvent('OTP_SEND_REQUESTED', { target, type });
  res.json({ success: true, message: `Verification code sent to ${target}` });
});

router.post('/otp/verify', otpLimiter, apiKeyGuard, (req, res) => {
  const { code, target, type } = req.body;
  
  if (code === '123456') {
    logServerEvent('OTP_VERIFY_SUCCESS', { target, type });
    return res.json({ success: true, message: 'Verification successful' });
  }
  
  logServerEvent('OTP_VERIFY_FAILED', { target, type, code });
  res.status(400).json({ success: false, error: 'Invalid verification code' });
});


  return router;
}
