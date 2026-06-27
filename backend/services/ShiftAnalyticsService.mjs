/**
 * ═══════════════════════════════════════════════════════════════
 * 📊 ShiftAnalyticsService.mjs (v2.6.772)
 * Extracted from routes/admin_core.mjs — Monolith Decomposition Phase 1B
 *
 * Pure business logic for shift history, attendance patterns, and anomalies.
 * ═══════════════════════════════════════════════════════════════
 */
import { AuditLog, OrgSetting } from '../models/AdminCoreModels.mjs';
import { Player as User, PlayerSession, ActivityHeartbeat } from '../models/index.mjs';

const MAX_BREAK_DURATION_MS = 90 * 60 * 1000;
const DEFAULT_SHIFT_START = '09:00';
const DEFAULT_SHIFT_END = '18:00';
const OVERTIME_JUSTIFY_THRESHOLD_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getIstDateString(ts) {
  const d = new Date(ts);
  d.setTime(d.getTime() + (5.5 * 60 * 60 * 1000));
  return d.toISOString().split('T')[0];
}

async function buildPlayerMap(userIds, fields = 'id data.name data.avatar data.email data.supportLevel data.managerId data.isLive data.liveSessionStart data.shortLeaves data.scheduledShiftStart data.scheduledShiftEnd') {
  const playerDocs = await User.find({ id: { $in: userIds } }).select(fields).lean();
  const playerMap = {};
  const managerIds = new Set();

  for (const p of playerDocs) {
    const managerId = p.data?.managerId || '';
    if (managerId) managerIds.add(managerId);
    playerMap[p.id] = {
      name: p.data?.name || p.id,
      avatar: p.data?.avatar || '',
      email: p.data?.email || '',
      supportLevel: p.data?.supportLevel || '',
      managerId,
      shortLeaves: p.data?.shortLeaves || [],
      scheduledStart: p.data?.scheduledShiftStart || DEFAULT_SHIFT_START,
      scheduledEnd: p.data?.scheduledShiftEnd || DEFAULT_SHIFT_END,
      isLive: p.data?.isLive,
      liveSessionStart: p.data?.liveSessionStart,
    };
  }

  // Fetch manager names
  const managerDocs = managerIds.size > 0 ? await User.find({ id: { $in: [...managerIds] } }).select('id data.name').lean() : [];
  const managerMap = {};
  for (const m of managerDocs) {
    managerMap[m.id] = m.data?.name || m.id;
  }

  return { playerMap, managerMap };
}

function buildActiveTimeCalculator(playerSessions, activityHeartbeats, playerMap) {
  return (uid, shiftStartTs, shiftEndTs) => {
    if (!shiftStartTs) return { totalMs: 0, intervals: [] };
    const shiftStart = new Date(shiftStartTs).getTime();
    const shiftEnd = shiftEndTs ? new Date(shiftEndTs).getTime() : Date.now();

    // Try ActivityHeartbeat first
    const heartbeats = activityHeartbeats
      .filter(h => h.userId === uid && new Date(h.timestamp).getTime() >= shiftStart && new Date(h.timestamp).getTime() <= shiftEnd)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (heartbeats.length > 0) {
      let intervals = [];
      let currentStart = new Date(heartbeats[0].timestamp).getTime();
      let currentEnd = currentStart;

      for (let i = 1; i < heartbeats.length; i++) {
        const ts = new Date(heartbeats[i].timestamp).getTime();
        if (ts - currentEnd <= 60000) {
          currentEnd = ts;
        } else {
          intervals.push([currentStart, currentEnd + 30000]);
          currentStart = ts;
          currentEnd = ts;
        }
      }
      intervals.push([currentStart, Math.min(currentEnd + 30000, Date.now())]);
      const totalMs = intervals.reduce((sum, interval) => sum + (interval[1] - interval[0]), 0);
      return { totalMs, intervals };
    }

    // Fallback: Legacy PlayerSession calculation
    let intervals = playerSessions
      .filter(s => s.userId === uid)
      .map(s => {
        const st = new Date(s.startTime).getTime();
        const et = s.endTime ? new Date(s.endTime).getTime() : Date.now();
        return [Math.max(shiftStart, st), Math.min(shiftEnd, et)];
      })
      .filter(i => i[0] < i[1]);

    const pData = playerMap[uid];
    if (pData?.isLive && pData?.liveSessionStart) {
      const st = new Date(pData.liveSessionStart).getTime();
      const et = Date.now();
      const clippedStart = Math.max(shiftStart, st);
      const clippedEnd = Math.min(shiftEnd, et);
      if (clippedStart < clippedEnd) intervals.push([clippedStart, clippedEnd]);
    }

    if (intervals.length === 0) return { totalMs: 0, intervals: [] };
    intervals.sort((a, b) => a[0] - b[0]);
    let merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      let current = intervals[i];
      let last = merged[merged.length - 1];
      if (current[0] <= last[1]) {
        last[1] = Math.max(last[1], current[1]);
      } else {
        merged.push(current);
      }
    }
    const totalMs = merged.reduce((sum, interval) => sum + (interval[1] - interval[0]), 0);
    return { totalMs, intervals: merged };
  };
}

function buildSegmentCalculator(calculateActiveTime, playerMap) {
  return (uid, checkinTime, checkoutTime, shiftDateStr) => {
    const startTs = new Date(checkinTime).getTime();
    const endTs = checkoutTime ? new Date(checkoutTime).getTime() : Date.now();
    let totalShiftMs = checkoutTime ? (endTs - startTs) : null;

    const leaves = playerMap[uid]?.shortLeaves || [];
    const shiftLeaves = leaves.filter(l =>
      l.date === shiftDateStr && (l.status === 'approved' || l.status === 'completed')
    );

    const segments = [];
    let currentCursor = startTs;
    let isOnBreak = false;

    shiftLeaves.sort((a, b) => {
      const aMins = a.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m);
      const bMins = b.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m);
      return aMins - bMins;
    });

    for (const l of shiftLeaves) {
      const leaveStartIso = `${shiftDateStr}T${l.startTime}:00+05:30`;
      const leaveStartTs = new Date(leaveStartIso).getTime();

      let leaveEndTs;
      if (l.status === 'completed' && l.actualReturnTime) {
        const leaveEndIso = `${shiftDateStr}T${l.actualReturnTime}:00+05:30`;
        leaveEndTs = new Date(leaveEndIso).getTime();
      } else if (l.status === 'approved') {
        leaveEndTs = Date.now();
        isOnBreak = true;
      }

      if (!leaveEndTs) continue;

      const clippedStart = Math.max(startTs, leaveStartTs);
      const clippedEnd = Math.min(endTs, leaveEndTs);

      if (clippedStart < clippedEnd) {
        if (clippedStart > currentCursor) {
          const activeData = calculateActiveTime(uid, currentCursor, clippedStart);
          segments.push({
            type: 'shift', start: currentCursor, end: clippedStart,
            durationMs: clippedStart - currentCursor,
            activeDurationMs: activeData.totalMs, activeIntervals: activeData.intervals
          });
        }

        const breakDurationMs = clippedEnd - clippedStart;
        if (totalShiftMs !== null) totalShiftMs -= breakDurationMs;

        segments.push({
          type: 'break', start: clippedStart, end: clippedEnd,
          durationMs: breakDurationMs,
          justification: l.reason || 'Short Leave',
          lateDurationMinutes: l.lateDurationMinutes || null,
          resolvedByName: l.resolvedByName || null,
          resolvedByRole: l.resolvedByRole || null
        });

        currentCursor = clippedEnd;
      }
    }

    if (currentCursor < endTs && !isOnBreak) {
      const activeData = calculateActiveTime(uid, currentCursor, checkoutTime ? endTs : null);
      segments.push({
        type: 'shift', start: currentCursor, end: checkoutTime ? endTs : null,
        durationMs: checkoutTime ? (endTs - currentCursor) : null,
        activeDurationMs: activeData.totalMs, activeIntervals: activeData.intervals
      });
    }

    segments.sort((a, b) => b.start - a.start);
    return { segments, totalShiftMs, isOnBreak };
  };
}

// ─────────────────────────────────────────────────────────────
// getShiftHistory
// ─────────────────────────────────────────────────────────────

export async function getShiftHistory(query, requesterId, requesterRole) {
  const { startDate, endDate, userId } = query;
  if (!startDate) return { status: 400, success: false, message: 'startDate is required (YYYY-MM-DD)' };

  const start = new Date(`${startDate}T00:00:00+05:30`);
  const endStr = endDate || startDate;
  const end = new Date(`${endStr}T23:59:59.999+05:30`);

  const diffDays = (end - start) / (1000 * 60 * 60 * 24);
  if (diffDays > 31) return { status: 400, success: false, message: 'Date range cannot exceed 31 days.' };

  const logQuery = {
    action: { $in: ['SUPPORT_SHIFT_CHECKIN', 'SUPPORT_SHIFT_CHECKOUT'] },
    timestamp: { $gte: start, $lte: end }
  };
  if (userId) logQuery.userId = userId;

  const logs = await AuditLog.find(logQuery).sort({ timestamp: 1 }).limit(2000).lean();

  const userIds = [...new Set(logs.map(l => l.details?.userId || l.userId))];
  const { playerMap, managerMap } = await buildPlayerMap(userIds);

  const playerSessions = await PlayerSession.find({
    userId: { $in: userIds },
    $or: [
      { startTime: { $gte: start, $lte: end } },
      { endTime: { $gte: start, $lte: end } }
    ]
  }).lean();

  const activityHeartbeats = await ActivityHeartbeat.find({
    userId: { $in: userIds },
    timestamp: { $gte: start, $lte: end }
  }).lean();

  const calculateActiveTime = buildActiveTimeCalculator(playerSessions, activityHeartbeats, playerMap);
  const calculateSegments = buildSegmentCalculator(calculateActiveTime, playerMap);

  // Pair checkins with checkouts
  const shifts = [];
  const checkinMap = {};

  for (const log of logs) {
    const uid = log.details?.userId || log.userId;
    if (!uid) continue;

    if (log.action === 'SUPPORT_SHIFT_CHECKIN') {
      if (!checkinMap[uid]) checkinMap[uid] = [];
      checkinMap[uid].push(log);
    } else if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
      const pending = checkinMap[uid];
      const checkinLog = pending?.length > 0 ? pending.shift() : null;

      const actualCheckinTime = checkinLog?.details?.actualTime || checkinLog?.timestamp || log.details?.checkinRounded || null;
      const actualCheckoutTime = log.details?.checkoutTime || log.timestamp;
      const dateStr = getIstDateString(log.timestamp);

      let totalShiftMs = 0;
      let segments = [];
      let isOnBreak = false;

      if (actualCheckinTime && actualCheckoutTime) {
        const res = calculateSegments(uid, actualCheckinTime, actualCheckoutTime, dateStr);
        totalShiftMs = res.totalShiftMs;
        segments = res.segments;
        isOnBreak = res.isOnBreak;
      }

      const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
      const SEVEN_HOURS_MS = 7 * 60 * 60 * 1000;
      const overtimeMs = Math.max(0, totalShiftMs - EIGHT_HOURS_MS);
      const mgrId = playerMap[uid]?.managerId || '';

      shifts.push({
        userId: uid,
        name: playerMap[uid]?.name || uid,
        avatar: playerMap[uid]?.avatar || '',
        email: playerMap[uid]?.email || '',
        supportLevel: playerMap[uid]?.supportLevel || '',
        managerId: mgrId,
        managerName: mgrId ? (managerMap[mgrId] || mgrId) : '',
        scheduledStart: checkinLog?.details?.scheduledStart || log.details?.scheduledStart || playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START,
        scheduledEnd: checkinLog?.details?.scheduledEnd || log.details?.scheduledEnd || playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END,
        checkinTime: actualCheckinTime,
        checkinRounded: checkinLog?.details?.roundedTime || log.details?.checkinRounded || null,
        checkoutTime: actualCheckoutTime,
        totalShiftMs, segments, isOnBreak,
        totalBreakMs: segments.filter(s => s.type === 'break').reduce((sum, s) => sum + (s.durationMs || 0), 0),
        breakExceeded: segments.filter(s => s.type === 'break').reduce((sum, s) => sum + (s.durationMs || 0), 0) > MAX_BREAK_DURATION_MS,
        activeDurationMs: calculateActiveTime(uid, actualCheckinTime, actualCheckoutTime),
        overtimeMs,
        overtimeStatus: overtimeMs > OVERTIME_JUSTIFY_THRESHOLD_MS ? (log.details?.overtimeJustification ? 'justified' : 'pending_justification') : null,
        overtimeJustification: log.details?.overtimeJustification || null,
        isAutoCheckout: !!log.details?.isAutoCheckout,
        isEarlyCheckout: totalShiftMs < SEVEN_HOURS_MS && !log.details?.isAutoCheckout,
        isLateCheckin: false,
        justification: log.details?.justification || null,
        date: dateStr,
        shiftLogId: log._id
      });
    }
  }

  // Handle orphan checkins
  for (const uid of Object.keys(checkinMap)) {
    for (const orphan of checkinMap[uid]) {
      const mgrId = playerMap[uid]?.managerId || '';
      const actualCheckinTime = orphan.details?.actualTime || orphan.details?.roundedTime || orphan.timestamp;
      const dateStr = getIstDateString(orphan.timestamp);
      const res = calculateSegments(uid, actualCheckinTime, null, dateStr);

      shifts.push({
        userId: uid,
        name: playerMap[uid]?.name || uid,
        avatar: playerMap[uid]?.avatar || '',
        email: playerMap[uid]?.email || '',
        supportLevel: playerMap[uid]?.supportLevel || '',
        managerId: mgrId,
        managerName: mgrId ? (managerMap[mgrId] || mgrId) : '',
        scheduledStart: orphan.details?.scheduledStart || playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START,
        scheduledEnd: orphan.details?.scheduledEnd || playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END,
        checkinTime: actualCheckinTime,
        checkinRounded: orphan.details?.roundedTime || null,
        checkoutTime: null, totalShiftMs: null,
        segments: res.segments, isOnBreak: res.isOnBreak,
        activeDurationMs: calculateActiveTime(uid, actualCheckinTime, null),
        overtimeMs: 0, isAutoCheckout: false, isEarlyCheckout: false,
        justification: null, date: dateStr
      });
    }
  }

  // Filter for managers
  let filteredShifts = shifts;
  if (requesterRole !== 'admin') {
    filteredShifts = shifts.filter(s => s.managerId === requesterId);
  }

  filteredShifts.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return new Date(b.checkinTime || 0) - new Date(a.checkinTime || 0);
  });

  const uniqueWorkers = new Set(filteredShifts.map(s => s.userId)).size;
  const completedShifts = filteredShifts.filter(s => s.checkoutTime);
  const avgDurationMs = completedShifts.length > 0
    ? completedShifts.reduce((sum, s) => sum + (s.totalShiftMs || 0), 0) / completedShifts.length
    : 0;
  const totalOvertimeMs = completedShifts.reduce((sum, s) => sum + (s.overtimeMs || 0), 0);
  const earlyCheckouts = completedShifts.filter(s => s.isEarlyCheckout).length;

  return {
    status: 200, success: true,
    shifts: filteredShifts,
    summary: { totalWorkers: uniqueWorkers, totalShifts: filteredShifts.length, completedShifts: completedShifts.length, avgDurationMs, totalOvertimeMs, earlyCheckouts }
  };
}

// ─────────────────────────────────────────────────────────────
// getAttendancePatterns
// ─────────────────────────────────────────────────────────────

export async function getAttendancePatterns(requesterId, requesterRole) {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const logs = await AuditLog.find({
    action: { $in: ['SUPPORT_SHIFT_CHECKIN', 'SUPPORT_SHIFT_CHECKOUT'] },
    timestamp: { $gte: start, $lte: end }
  }).sort({ timestamp: 1 }).lean();

  const userIds = [...new Set(logs.map(l => l.details?.userId || l.userId))];
  const playerDocs = await User.find({ id: { $in: userIds } }).select('id data.name data.avatar data.supportLevel data.managerId data.shortLeaves data.scheduledShiftStart data.scheduledShiftEnd').lean();
  const playerMap = {};
  for (const p of playerDocs) {
    playerMap[p.id] = {
      name: p.data?.name || p.id, avatar: p.data?.avatar || '',
      supportLevel: p.data?.supportLevel || '', managerId: p.data?.managerId || '',
      shortLeaves: p.data?.shortLeaves || [],
      scheduledStart: p.data?.scheduledShiftStart || DEFAULT_SHIFT_START,
      scheduledEnd: p.data?.scheduledShiftEnd || DEFAULT_SHIFT_END
    };
  }

  const patterns = {};
  for (const log of logs) {
    const uid = log.details?.userId || log.userId;
    if (!uid) continue;
    if (!patterns[uid]) {
      patterns[uid] = {
        userId: uid, name: playerMap[uid]?.name || uid, avatar: playerMap[uid]?.avatar || '',
        supportLevel: playerMap[uid]?.supportLevel || '', managerId: playerMap[uid]?.managerId || '',
        scheduledStart: playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START,
        scheduledEnd: playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END,
        daysWorked: new Set(), lateCheckins: 0, autoCheckouts: 0, earlyCheckouts: 0,
        totalShiftMs: 0, shiftCount: 0, totalBreakMs: 0, lateReturns: 0
      };
    }

    const p = patterns[uid];
    const dateStr = new Date(new Date(log.timestamp).getTime() + 5.5 * 3600000).toISOString().split('T')[0];
    p.daysWorked.add(dateStr);

    if (log.action === 'SUPPORT_SHIFT_CHECKIN') {
      p.shiftCount++;
      const schedStart = log.details?.scheduledStart || playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START;
      const [schedH, schedM] = schedStart.split(':').map(Number);
      const checkinIST = new Date(new Date(log.timestamp).getTime() + 5.5 * 3600000);
      const checkinH = checkinIST.getUTCHours();
      const checkinM = checkinIST.getUTCMinutes();
      if (checkinH > schedH || (checkinH === schedH && checkinM > schedM + 10)) {
        p.lateCheckins++;
        if (!p.lateCheckinDates) p.lateCheckinDates = [];
        const lateMins = ((checkinH - schedH) * 60) + (checkinM - schedM);
        const timeStr = `${checkinH.toString().padStart(2, '0')}:${checkinM.toString().padStart(2, '0')}`;
        const schedEnd = log.details?.scheduledEnd || playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END;
        const entryStr = `${dateStr}|${timeStr}|${lateMins}|${schedStart}-${schedEnd}`;
        if (!p.lateCheckinDates.includes(entryStr)) p.lateCheckinDates.push(entryStr);
      }
    }

    if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
      if (log.details?.isAutoCheckout) {
        p.autoCheckouts++;
        if (!p.autoCheckoutDates) p.autoCheckoutDates = [];
        if (!p.autoCheckoutDates.includes(dateStr)) p.autoCheckoutDates.push(dateStr);
      }
      const totalMs = log.details?.totalShiftMs || 0;
      if (totalMs > 0 && totalMs < 7 * 3600000 && !log.details?.isAutoCheckout) {
        p.earlyCheckouts++;
        if (!p.earlyCheckoutDates) p.earlyCheckoutDates = [];
        const schedEnd = log.details?.scheduledEnd || playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END;
        const [eSchedH, eSchedM] = schedEnd.split(':').map(Number);
        const checkoutIST = new Date(new Date(log.timestamp).getTime() + 5.5 * 3600000);
        const checkoutH = checkoutIST.getUTCHours();
        const checkoutM = checkoutIST.getUTCMinutes();
        let earlyMins = ((eSchedH - checkoutH) * 60) + (eSchedM - checkoutM);
        if (earlyMins < 0) earlyMins = 0;
        const timeStr = `${checkoutH.toString().padStart(2, '0')}:${checkoutM.toString().padStart(2, '0')}`;
        const schedStartForEarly = log.details?.scheduledStart || playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START;
        const entryStr = `${dateStr}|${timeStr}|${earlyMins}|${schedStartForEarly}-${schedEnd}`;
        if (!p.earlyCheckoutDates.find(e => e.startsWith(dateStr))) p.earlyCheckoutDates.push(entryStr);
      }
      p.totalShiftMs += totalMs;
    }
  }

  // Break stats
  for (const uid of Object.keys(patterns)) {
    const leaves = playerMap[uid]?.shortLeaves || [];
    const recentLeaves = leaves.filter(l => { const ld = new Date(l.date); return ld >= start && ld <= end; });
    for (const l of recentLeaves) {
      if (l.status === 'completed' && l.actualReturnTime && l.startTime) {
        const [sh, sm] = l.startTime.split(':').map(Number);
        const [eh, em] = l.actualReturnTime.split(':').map(Number);
        const breakMs = ((eh * 60 + em) - (sh * 60 + sm)) * 60000;
        if (breakMs > 0) patterns[uid].totalBreakMs += breakMs;
      }
      if (l.isLateReturn) patterns[uid].lateReturns++;
    }
  }

  let result = Object.values(patterns).map(p => ({
    ...p, daysWorked: p.daysWorked.size,
    avgShiftMs: p.shiftCount > 0 ? Math.round(p.totalShiftMs / p.shiftCount) : 0,
    attendanceRate: Math.round((p.daysWorked.size / 30) * 100)
  }));

  if (requesterRole !== 'admin') {
    result = result.filter(p => p.managerId === requesterId);
  }

  result.sort((a, b) => b.lateCheckins - a.lateCheckins);
  return { status: 200, success: true, patterns: result };
}

// ─────────────────────────────────────────────────────────────
// getShiftAnomalies
// ─────────────────────────────────────────────────────────────

export async function getShiftAnomalies() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const logs = await AuditLog.find({
    action: { $in: ['SUPPORT_SHIFT_CHECKIN', 'SUPPORT_SHIFT_CHECKOUT'] },
    timestamp: { $gte: start, $lte: end }
  }).sort({ timestamp: 1 }).lean();

  const userIds = [...new Set(logs.map(l => l.details?.userId || l.userId))];
  const playerDocs = await User.find({ id: { $in: userIds } }).select('id data.name data.avatar data.supportLevel data.shortLeaves').lean();
  const playerMap = {};
  for (const p of playerDocs) {
    playerMap[p.id] = { name: p.data?.name || p.id, avatar: p.data?.avatar || '', supportLevel: p.data?.supportLevel || '', shortLeaves: p.data?.shortLeaves || [] };
  }

  const userStats = {};
  const anomalies = [];
  const pendingCheckins = {};

  for (const log of logs) {
    const uid = log.details?.userId || log.userId;
    if (!uid) continue;
    if (!userStats[uid]) userStats[uid] = { autoCheckouts: 0, overtimeMs: 0, breakExceededDays: new Set() };

    if (log.action === 'SUPPORT_SHIFT_CHECKIN') {
      if (pendingCheckins[uid]) {
        anomalies.push({ type: 'overlapping_checkin', severity: 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `Consecutive check-in without check-out on ${getIstDateString(log.timestamp)}`, occurrences: 1 });
      }
      pendingCheckins[uid] = log;
    } else if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
      if (log.details?.isAutoCheckout) userStats[uid].autoCheckouts++;
      const totalMs = log.details?.totalShiftMs || 0;
      if (totalMs > 8 * 3600000) {
        userStats[uid].overtimeMs += (totalMs - 8 * 3600000);
        if (!log.details?.overtimeJustification) {
          anomalies.push({ type: 'pending_overtime', severity: 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `Pending overtime justification for shift on ${getIstDateString(log.timestamp)}`, occurrences: 1 });
        }
      }
      pendingCheckins[uid] = null;
    }
  }

  // Orphan checkins
  const nowMs = Date.now();
  for (const [uid, log] of Object.entries(pendingCheckins)) {
    if (log) {
      const ageMs = nowMs - new Date(log.timestamp).getTime();
      if (ageMs > 14 * 3600000) {
        anomalies.push({ type: 'orphan_checkin', severity: 'critical', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `Checked in ${Math.floor(ageMs / 3600000)}h ago but never checked out`, occurrences: 1 });
      }
    }
  }

  // Break policy violations
  for (const uid of Object.keys(userStats)) {
    const leaves = playerMap[uid]?.shortLeaves || [];
    const dailyBreaks = {};
    for (const l of leaves) {
      if (l.status === 'completed' && l.actualReturnTime && l.startTime) {
        const ld = new Date(l.date);
        if (ld < start || ld > end) continue;
        const [sh, sm] = l.startTime.split(':').map(Number);
        const [eh, em] = l.actualReturnTime.split(':').map(Number);
        const breakMs = ((eh * 60 + em) - (sh * 60 + sm)) * 60000;
        if (!dailyBreaks[l.date]) dailyBreaks[l.date] = 0;
        dailyBreaks[l.date] += breakMs;
      }
    }
    for (const [date, totalMs] of Object.entries(dailyBreaks)) {
      if (totalMs > MAX_BREAK_DURATION_MS) userStats[uid].breakExceededDays.add(date);
    }
  }

  // Late returns
  for (const uid of Object.keys(userStats)) {
    const leaves = playerMap[uid]?.shortLeaves || [];
    userStats[uid].lateReturns = leaves.filter(l => { const ld = new Date(l.date); return ld >= start && ld <= end && l.isLateReturn; }).length;
  }

  // Build anomaly alerts
  for (const [uid, stats] of Object.entries(userStats)) {
    if (stats.autoCheckouts >= 2) {
      anomalies.push({ type: 'excessive_auto_checkouts', severity: stats.autoCheckouts >= 3 ? 'critical' : 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `${stats.autoCheckouts} auto-checkouts in the past 7 days`, occurrences: stats.autoCheckouts });
    }
    if (stats.breakExceededDays.size >= 2) {
      anomalies.push({ type: 'break_policy_violation', severity: stats.breakExceededDays.size >= 3 ? 'critical' : 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `Break exceeded 90 min on ${stats.breakExceededDays.size} days`, occurrences: stats.breakExceededDays.size });
    }
    if (stats.lateReturns >= 3) {
      anomalies.push({ type: 'chronic_late_returns', severity: stats.lateReturns >= 5 ? 'critical' : 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `${stats.lateReturns} late returns from breaks in 7 days`, occurrences: stats.lateReturns });
    }
    if (stats.overtimeMs > 2 * 3600000) {
      const hrs = Math.round(stats.overtimeMs / 3600000 * 10) / 10;
      anomalies.push({ type: 'excessive_overtime', severity: stats.overtimeMs > 4 * 3600000 ? 'critical' : 'warning', agentId: uid, agentName: playerMap[uid]?.name || uid, agentAvatar: playerMap[uid]?.avatar || '', details: `${hrs}h overtime accumulated in 7 days`, occurrences: Math.ceil(hrs) });
    }
  }

  anomalies.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1 };
    return (sevOrder[a.severity] || 1) - (sevOrder[b.severity] || 1);
  });

  return { status: 200, success: true, anomalies };
}

// ─────────────────────────────────────────────────────────────
// justifyOvertime
// ─────────────────────────────────────────────────────────────

export async function justifyOvertime(shiftLogId, justification, userId) {
  if (!shiftLogId || !justification) return { status: 400, success: false, message: 'shiftLogId and justification are required' };

  const log = await AuditLog.findById(shiftLogId);
  if (!log) return { status: 404, success: false, message: 'Shift log not found' };

  log.details = log.details || {};
  log.details.overtimeJustification = justification;
  log.details.overtimeJustifiedBy = userId;
  log.details.overtimeJustifiedAt = new Date().toISOString();
  await log.save();

  return { status: 200, success: true, message: 'Overtime justified successfully' };
}

// ─────────────────────────────────────────────────────────────
// updateShiftSchedule
// ─────────────────────────────────────────────────────────────

export async function updateShiftSchedule(agentId, scheduledShiftStart, scheduledShiftEnd, updatedBy) {
  if (!agentId) return { status: 400, success: false, message: 'agentId is required' };

  const player = await User.findOne({ id: agentId });
  if (!player) return { status: 404, success: false, message: 'Agent not found' };

  if (scheduledShiftStart) player.data.scheduledShiftStart = scheduledShiftStart;
  if (scheduledShiftEnd) player.data.scheduledShiftEnd = scheduledShiftEnd;
  player.markModified('data');
  await player.save();

  await AuditLog.create({
    action: 'SHIFT_SCHEDULE_UPDATED',
    userId: updatedBy,
    timestamp: new Date(),
    details: { agentId, scheduledShiftStart, scheduledShiftEnd, updatedBy }
  });

  return { status: 200, success: true, message: 'Shift schedule updated' };
}
