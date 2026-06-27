import express from 'express';
import { Player } from '../models/index.mjs';
import { asyncHandler } from '../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export function createSupportShiftRouter(deps) {
  const router = express.Router();
  const { io, logServerEvent, logAudit } = deps;

// ═══════════════════════════════════════════════════════════════
// 🕐 SHIFT MANAGEMENT SYSTEM (v2.6.673)
// Check-in/Check-out with time rounding, overtime tracking, and
// auto-checkout after 8h 15m grace period.
// ═══════════════════════════════════════════════════════════════

/**
 * Rounds a Date to the nearest 30 minutes.
 * < 15 min → round down to :00
 * 15–44 min → round to :30
 * >= 45 min → round up to next hour :00
 */
function roundToNearest30(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  if (minutes < 15) {
    d.setMinutes(0, 0, 0);
  } else if (minutes < 45) {
    d.setMinutes(30, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d;
}

// 🕐 POST /support/check-in — Start shift
router.post('/support/check-in', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (!['support', 'admin', 'superadmin'].includes(playerDoc.data.role)) return res.status(403).json({ error: 'Only support employees and admins can check in' });

  // Prevent double check-in
  const todayStr = new Date().toISOString().split('T')[0];
  const existingCheckin = playerDoc.data.shiftCheckinAt;
  if (existingCheckin && existingCheckin.startsWith(todayStr) && playerDoc.data.shiftStatus === 'on_shift') {
    return res.status(409).json({ 
      error: 'Already checked in today',
      checkinTime: playerDoc.data.shiftCheckinRounded,
      checkoutDue: playerDoc.data.shiftCheckoutDue
    });
  }

  const now = new Date();
  const rounded = roundToNearest30(now);
  const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
  const checkoutDue = new Date(rounded.getTime() + SHIFT_DURATION_MS);

  await Player.updateOne(
    { id: userId },
    { $set: {
      'data.shiftStatus': 'on_shift',
      'data.shiftCheckinAt': now.toISOString(),
      'data.shiftCheckinRounded': rounded.toISOString(),
      'data.shiftCheckoutDue': checkoutDue.toISOString(),
      'data.shiftCheckoutAt': null,
      lastUpdated: new Date()
    }}
  );

  logAudit(req, 'SUPPORT_SHIFT_CHECKIN', ['players'], {
    userId,
    name: playerDoc.data.name,
    email: playerDoc.data.email,
    username: playerDoc.data.username,
    actualTime: now.toISOString(),
    roundedTime: rounded.toISOString(),
    checkoutDue: checkoutDue.toISOString(),
    scheduledStart: playerDoc.data.scheduledShiftStart,
    scheduledEnd: playerDoc.data.scheduledShiftEnd
  }).catch(() => {});

  console.log(`🕐 [SHIFT] ${userId} checked in at ${now.toLocaleTimeString()} → rounded to ${rounded.toLocaleTimeString()}, checkout due at ${checkoutDue.toLocaleTimeString()}`);

  // 📡 Notify all clients that this agent's shift status changed
  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { 
        id: userId, 
        shiftStatus: 'on_shift',
        shiftCheckinAt: now.toISOString(),
        shiftCheckinRounded: rounded.toISOString(),
        shiftCheckoutDue: checkoutDue.toISOString(),
        shiftCheckoutAt: null
      },
      source: 'shift_checkin',
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    checkinTime: rounded.toISOString(),
    checkinTimeActual: now.toISOString(),
    checkoutDue: checkoutDue.toISOString(),
    shiftStatus: 'on_shift'
  });
}));

// 🕐 POST /support/check-out — End shift
router.post('/support/check-out', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { isAutoCheckout, justification } = req.body || {};
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (!['support', 'admin', 'superadmin'].includes(playerDoc.data.role)) return res.status(403).json({ error: 'Only support employees and admins can check out' });

  const checkinTime = playerDoc.data.shiftCheckinRounded;
  if (!checkinTime) {
    return res.status(400).json({ error: 'No active check-in found' });
  }

  const now = new Date();
  const checkinDate = new Date(checkinTime);
  const totalShiftMs = now.getTime() - checkinDate.getTime();
  
  if (totalShiftMs < 7 * 60 * 60 * 1000 && !isAutoCheckout) {
    if (!justification || justification.trim().length === 0) {
      return res.status(400).json({ error: 'Early checkout justification is required.' });
    }
  }

  const SHIFT_LIMIT_MS = 8 * 60 * 60 * 1000;
  const overtimeMs = Math.max(0, totalShiftMs - SHIFT_LIMIT_MS);

  const updateSet = {
      'data.shiftStatus': 'off_shift',
      'data.shiftCheckoutAt': now.toISOString(),
      lastUpdated: new Date()
  };
  if (justification && justification.trim().length > 0) {
      updateSet['data.shiftCheckoutJustification'] = justification.trim();
  } else {
      updateSet['data.shiftCheckoutJustification'] = null;
  }

  await Player.updateOne(
    { id: userId },
    { $set: updateSet }
  );

  logAudit(req, 'SUPPORT_SHIFT_CHECKOUT', ['players'], {
    userId,
    name: playerDoc.data.name,
    email: playerDoc.data.email,
    username: playerDoc.data.username,
    checkoutTime: now.toISOString(),
    checkinRounded: checkinTime,
    totalShiftMs,
    overtimeMs,
    isAutoCheckout: !!isAutoCheckout,
    justification: justification || null,
    scheduledStart: playerDoc.data.scheduledShiftStart,
    scheduledEnd: playerDoc.data.scheduledShiftEnd
  }).catch(() => {});

  console.log(`🕐 [SHIFT] ${userId} checked out at ${now.toLocaleTimeString()}. Total: ${Math.floor(totalShiftMs / 3600000)}h ${Math.floor((totalShiftMs % 3600000) / 60000)}m. Overtime: ${Math.floor(overtimeMs / 60000)}m`);

  // 📡 Notify manager if overtime or early checkout occurred
  const isEarly = totalShiftMs < 7 * 60 * 60 * 1000 && !isAutoCheckout;
  if (overtimeMs > 0 || isEarly) {
    try {
      let managerId = playerDoc.data.managerId;
      if (!managerId && playerDoc.data.supportLevel?.toLowerCase() === 'manager') {
        managerId = 'admin';
      }
      if (managerId) {
        const managerDoc = await Player.findOne({ id: managerId }).lean();
        const managerData = managerDoc?.data;
        if (managerData?.pushTokens?.length > 0) {
          const { sendPushNotification } = await import('../utils/pushNotifications.mjs').catch(() => ({ sendPushNotification: null }));
          if (sendPushNotification) {
            if (overtimeMs > 0) {
              const overtimeMinutes = Math.floor(overtimeMs / 60000);
              sendPushNotification(
                managerData.pushTokens,
                '⏰ Employee Overtime Alert',
                `${playerDoc.data.name || userId} worked ${overtimeMinutes} min overtime${isAutoCheckout ? ' (auto-checkout)' : ''}.`,
                { type: 'OVERTIME_ALERT', userId, overtimeMs }
              );
            } else if (isEarly) {
              sendPushNotification(
                managerData.pushTokens,
                '⚠️ Early Checkout Alert',
                `${playerDoc.data.name || userId} checked out early. Reason: ${justification}`,
                { type: 'EARLY_CHECKOUT_ALERT', userId, justification }
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SHIFT] Manager notification failed:', e.message);
    }

    if (overtimeMs > 0) {
      logAudit(req, 'SUPPORT_OVERTIME_DETECTED', ['players'], {
        userId,
        overtimeMs,
        overtimeMinutes: Math.floor(overtimeMs / 60000),
        isAutoCheckout: !!isAutoCheckout
      }).catch(() => {});
    }
  }

  // 📡 Notify all clients
  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { 
        id: userId, 
        shiftStatus: 'off_shift',
        shiftCheckoutAt: now.toISOString(),
        supportStatus: playerDoc.data.supportStatus || 'active'
      },
      source: 'shift_checkout',
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    checkoutTime: now.toISOString(),
    totalShiftMs,
    overtimeMs,
    shiftStatus: 'off_shift'
  });
}));

// 🕐 GET /support/shift-status — Query current shift state
router.get('/support/shift-status', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });

  const d = playerDoc.data;
  res.json({
    success: true,
    shiftStatus: d.shiftStatus || 'off_shift',
    shiftCheckinAt: d.shiftCheckinAt || null,
    shiftCheckinRounded: d.shiftCheckinRounded || null,
    shiftCheckoutAt: d.shiftCheckoutAt || null,
    shiftCheckoutDue: d.shiftCheckoutDue || null,
    shortLeaves: d.shortLeaves || []
  });
}));

// 🕐 POST /support/request-short-leave
router.post('/support/request-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { leaveId, date, startTime, endTime, reason } = req.body;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (playerDoc.data.shiftStatus !== 'on_shift') {
    return res.status(400).json({ error: 'You must be on shift to request short leave.' });
  }

  let shortLeaves = playerDoc.data.shortLeaves || [];
  let updatedLeave = null;

  if (leaveId) {
    const targetLeaveIndex = shortLeaves.findIndex(l => l.id === leaveId);
    if (targetLeaveIndex >= 0) {
      if (shortLeaves[targetLeaveIndex].status !== 'pending') {
        return res.status(400).json({ error: 'Only pending requests can be modified.' });
      }
      shortLeaves[targetLeaveIndex] = {
        ...shortLeaves[targetLeaveIndex],
        date,
        startTime,
        endTime,
        reason,
        updatedAt: new Date().toISOString()
      };
      updatedLeave = shortLeaves[targetLeaveIndex];
    } else {
      return res.status(404).json({ error: 'Leave request not found' });
    }
  } else {
    updatedLeave = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      date,
      startTime,
      endTime,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    shortLeaves.push(updatedLeave);
  }

  await Player.updateOne(
    { id: userId },
    { 
      $set: { 'data.shortLeaves': shortLeaves, lastUpdated: new Date() }
    }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: userId, shortLeaves },
      source: 'request_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true, updatedLeave });
}));

// 🕐 POST /support/cancel-short-leave
router.post('/support/cancel-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { leaveId } = req.body;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });

  const shortLeaves = playerDoc.data.shortLeaves || [];
  const targetLeaveIndex = shortLeaves.findIndex(l => l.id === leaveId);
  const targetLeave = shortLeaves[targetLeaveIndex];

  if (!targetLeave || (targetLeave.status !== 'pending' && targetLeave.status !== 'approved')) {
    return res.status(400).json({ error: 'Leave request cannot be cancelled or completed.' });
  }

  const now = new Date();
  
  if (targetLeave.status === 'approved') {
    // Agent is resuming shift after approved leave
    targetLeave.status = 'completed';
    
    // Shift now to IST (UTC + 5.5 hours)
    const nowIstMs = now.getTime() + (5.5 * 60 * 60 * 1000);
    const nowIst = new Date(nowIstMs);
    
    targetLeave.actualReturnTime = `${String(nowIst.getUTCHours()).padStart(2, '0')}:${String(nowIst.getUTCMinutes()).padStart(2, '0')}`;
    
    // Check if late or early by comparing minutes from midnight
    const [endH, endM] = targetLeave.endTime.split(':').map(Number);
    const currentIstMinutes = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
    const endMinutes = endH * 60 + endM;
    
    if (currentIstMinutes > endMinutes) {
      targetLeave.isLateReturn = true;
      targetLeave.lateDurationMinutes = currentIstMinutes - endMinutes;
      targetLeave.isEarlyReturn = false;
      targetLeave.earlyDurationMinutes = 0;
    } else {
      targetLeave.isLateReturn = false;
      targetLeave.lateDurationMinutes = 0;
      targetLeave.isEarlyReturn = true;
      targetLeave.earlyDurationMinutes = endMinutes - currentIstMinutes;
    }
  } else if (targetLeave.status === 'pending') {
    // Agent is cancelling an unapproved request
    targetLeave.status = 'cancelled';
    targetLeave.cancellationNote = 'Cancelled by employee';
    targetLeave.cancelledAt = now.toISOString();
  }

  shortLeaves[targetLeaveIndex] = targetLeave;

  await Player.updateOne(
    { id: userId },
    { 
      $set: { 'data.shortLeaves': shortLeaves, lastUpdated: now }
    }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: userId, shortLeaves: shortLeaves },
      source: 'cancel_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true, updatedLeave: targetLeave });
}));

// 🕐 POST /support/resolve-short-leave
router.post('/support/resolve-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { agentId, leaveId, action } = req.body; // action: 'approve' or 'reject'
  
  if (!adminId) return res.status(401).json({ error: 'Authentication required' });

  const adminDoc = await Player.findOne({ id: adminId }).lean();
  if (!adminDoc || !['admin', 'superadmin', 'support'].includes(adminDoc.data?.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (adminId === agentId && adminDoc.data?.role !== 'admin' && adminDoc.data?.role !== 'superadmin') {
    return res.status(403).json({ error: 'You cannot approve your own leave request. Please wait for an Admin.' });
  }

  const agentDoc = await Player.findOne({ id: agentId }).lean();
  if (!agentDoc || !agentDoc.data) return res.status(404).json({ error: 'Agent not found' });

  const shortLeaves = agentDoc.data.shortLeaves || [];
  const targetLeave = shortLeaves.find(l => l.id === leaveId);
  if (!targetLeave) {
    return res.status(400).json({ error: 'Leave request not found' });
  }

  const updatedLeaves = shortLeaves.map(l => {
    if (l.id === leaveId) {
      return { 
        ...l, 
        status: action === 'approve' ? 'approved' : 'rejected',
        resolvedByName: adminDoc.data?.name || 'Admin',
        resolvedByRole: adminDoc.data?.role === 'admin' || adminDoc.data?.role === 'superadmin' ? 'Admin' : 'Manager'
      };
    }
    return l;
  });

  await Player.updateOne(
    { id: agentId },
    { $set: { 'data.shortLeaves': updatedLeaves, lastUpdated: new Date() } }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: agentId, shortLeaves: updatedLeaves },
      source: 'resolve_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true, status: action === 'approve' ? 'approved' : 'rejected' });
}));

  

  return router;
}
