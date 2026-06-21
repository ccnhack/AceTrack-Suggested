import express from 'express';
import { AuditLog, OrgSetting } from '../models/AdminCoreModels.mjs';
import { Player as User, PlayerSession } from '../models/index.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

const MAX_BREAK_DURATION_MS = 90 * 60 * 1000; // 90 minutes max break per day
const DEFAULT_SHIFT_START = '09:00'; // 9:00 AM IST
const DEFAULT_SHIFT_END = '18:00';   // 6:00 PM IST
const OVERTIME_JUSTIFY_THRESHOLD_MS = 30 * 60 * 1000; // 30 min overtime needs justification

export default function createAdminCoreRoutes() {
    const router = express.Router();
    
    // Apply global guards for this router
    router.use(apiKeyGuard);
    router.use(authGuard);

    const requireAdmin = (req, res, next) => {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied: Admins only' });
        }
        next();
    };

    const requireAdminOrSupport = (req, res, next) => {
        if (req.userRole !== 'admin' && req.userRole !== 'support') {
            return res.status(403).json({ success: false, message: 'Access denied: Admins or Support only' });
        }
        next();
    };

// GET /api/v1/admin-core/audit-logs
router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
            
            // Enforce 3-day limit if no search criteria is provided
            const start = new Date(startDate);
            const end = endDate ? new Date(endDate) : new Date();
            const diffDays = (end - start) / (1000 * 60 * 60 * 24);
            
            if (diffDays > 3 && !search) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Date range cannot exceed 3 days without specific search filters (Action, Email, or IP).' 
                });
            }
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { action: searchRegex },
                { userEmail: searchRegex },
                { ipAddress: searchRegex },
                { "details.key": searchRegex },
                { "details.value": searchRegex }
            ];
        }

        const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(200);
        res.json({ success: true, logs });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/v1/admin-core/settings
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const settings = await OrgSetting.find();
        res.json({ success: true, settings });
    } catch (error) {
        console.error("Error fetching org settings:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/v1/admin-core/settings
router.post('/settings', requireAdmin, async (req, res) => {
    try {
        const { key, value } = req.body;
        const setting = await OrgSetting.findOneAndUpdate(
            { key },
            { value, updatedBy: req.user.id, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        
        // Log this change
        await AuditLog.create({
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'setting_change',
            details: { key, value },
            ipAddress: req.ip
        });

        res.json({ success: true, setting });
    } catch (error) {
        console.error("Error saving org setting:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/v1/admin-core/team-directory (Both Admin and Support can view team)
router.get('/team-directory', async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'support') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Fetch users who are either admin or support
        const team = await User.find({ "data.role": { $in: ['admin', 'support'] } })
            .select('id data.name data.email data.role data.designation data.avatar data.phone data.username data.devices data.supportStatus data.supportLevel data.isLive lastUpdated')
            .lean();
            
        // Map data back to flat structure for the frontend
        const mappedTeam = team.map(u => {
            const userId = u.id || u._id?.toString() || '';
            const normalizedId = userId.toLowerCase();
            const isLive = !!u.data?.isLive;

            // 🛡️ [PRESENCE_ENRICHMENT] (v2.6.393): Find most recent device activity
            let lastActive = u.data?.lastActive || 0;
            if (u.data?.devices && Array.isArray(u.data.devices)) {
                lastActive = Math.max(lastActive, ...u.data.devices.map(d => d.lastActive || 0), 0);
            }

            const dbStatus = (u.data?.supportStatus || '').toLowerCase();
            const dbLevel = (u.data?.supportLevel || '').toUpperCase();
            const isExEmployee = dbStatus === 'terminated' || dbStatus === 'left' || dbLevel === 'EX-EMPLOYEE';

            return {
                id: userId,
                name: u.data?.name || 'Unknown',
                email: u.data?.email || '',
                role: u.data?.role || 'user',
                designation: isExEmployee ? 'Ex-Employee' : (u.data?.designation || ''),
                avatar: u.data?.avatar || '',
                phone: u.data?.phone || '',
                username: u.data?.username || '',
                managerId: u.data?.managerId || '',
                teamLeadId: u.data?.teamLeadId || '',
                supportLevel: u.data?.supportLevel || '',
                supportStatus: u.data?.supportStatus || (isLive ? 'active' : 'offline'),
                isExEmployee,
                isLive: isExEmployee ? false : isLive,
                lastActive: lastActive || u.lastUpdated || 0,
                status: isExEmployee ? 'left' : (isLive ? 'active' : 'offline'),
            };
        });
        res.json({ success: true, team: mappedTeam });
    } catch (error) {
        console.error("Error fetching team directory:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/v1/admin-core/team-directory/:id/hierarchy
router.post('/team-directory/:id/hierarchy', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { managerId, teamLeadId } = req.body;

        const employeeDoc = await User.findOne({ id: String(id) });
        if (!employeeDoc) return res.status(404).json({ success: false, message: 'Employee not found' });

        const updateFields = { lastUpdated: Date.now() };
        if (managerId !== undefined) updateFields["data.managerId"] = managerId;
        if (teamLeadId !== undefined) updateFields["data.teamLeadId"] = teamLeadId;

        // Update the employee's data with their reporting manager and team lead
        await User.updateOne(
            { id: String(id) }, 
            { $set: updateFields }
        );
        
        // Log this change
        await AuditLog.create({
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'update_hierarchy',
            details: { employeeId: id, managerId, teamLeadId },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Hierarchy updated successfully' });
    } catch (error) {
        console.error("Error updating hierarchy:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/v1/admin-core/shift-history
router.get('/shift-history', requireAdminOrSupport, async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.query;
        if (!startDate) {
            return res.status(400).json({ success: false, message: 'startDate is required (YYYY-MM-DD)' });
        }

        // Parse dates assuming IST (UTC+5:30) to prevent night shifts spilling into the next/previous day
        const start = new Date(`${startDate}T00:00:00+05:30`);
        const endStr = endDate || startDate;
        const end = new Date(`${endStr}T23:59:59.999+05:30`);

        // Enforce max 31-day range
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > 31) {
            return res.status(400).json({ success: false, message: 'Date range cannot exceed 31 days.' });
        }

        const query = {
            action: { $in: ['SUPPORT_SHIFT_CHECKIN', 'SUPPORT_SHIFT_CHECKOUT'] },
            timestamp: { $gte: start, $lte: end }
        };
        if (userId) query.userId = userId;

        const logs = await AuditLog.find(query).sort({ timestamp: 1 }).limit(2000).lean();

        // Build a map of player names for enrichment
        const userIds = [...new Set(logs.map(l => l.details?.userId || l.userId))];
        const playerDocs = await User.find({ id: { $in: userIds } }).select('id data.name data.avatar data.email data.supportLevel data.managerId data.isLive data.liveSessionStart data.shortLeaves').lean();
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
                shortLeaves: p.data?.shortLeaves || []
            };
        }
        // Fetch manager names
        const managerDocs = managerIds.size > 0 ? await User.find({ id: { $in: [...managerIds] } }).select('id data.name').lean() : [];
        const managerMap = {};
        for (const m of managerDocs) {
            managerMap[m.id] = m.data?.name || m.id;
        }

        const playerSessions = await PlayerSession.find({
            userId: { $in: userIds },
            $or: [
               { startTime: { $gte: start, $lte: end } },
               { endTime: { $gte: start, $lte: end } }
            ]
        }).lean();

        const calculateActiveTime = (uid, shiftStartTs, shiftEndTs) => {
            if (!shiftStartTs) return 0;
            const shiftStart = new Date(shiftStartTs).getTime();
            const shiftEnd = shiftEndTs ? new Date(shiftEndTs).getTime() : Date.now();
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
                if (clippedStart < clippedEnd) {
                    intervals.push([clippedStart, clippedEnd]);
                }
            }

            if (intervals.length === 0) return 0;
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
            return merged.reduce((sum, interval) => sum + (interval[1] - interval[0]), 0);
        };

        // Pair checkins with checkouts per user per day
        const shifts = [];
        const checkinMap = {}; // userId -> [pending checkins]

        // Utility to get IST date string (YYYY-MM-DD) from a timestamp
        const getIstDateString = (ts) => {
            const d = new Date(ts);
            d.setTime(d.getTime() + (5.5 * 60 * 60 * 1000)); // Add 5.5 hours for IST
            return d.toISOString().split('T')[0];
        };

        // Utility to generate segments from a shift period and player's short leaves
        const calculateSegments = (uid, checkinTime, checkoutTime, shiftDateStr) => {
            const startTs = new Date(checkinTime).getTime();
            const endTs = checkoutTime ? new Date(checkoutTime).getTime() : Date.now();
            let totalShiftMs = checkoutTime ? (endTs - startTs) : null;
            
            const leaves = playerMap[uid]?.shortLeaves || [];
            // Find leaves for this shift's date
            const shiftLeaves = leaves.filter(l => 
                l.date === shiftDateStr && 
                (l.status === 'approved' || l.status === 'completed')
            );
            
            const segments = [];
            let currentCursor = startTs;
            let isOnBreak = false;
            
            // Sort leaves by start time
            shiftLeaves.sort((a, b) => {
                const aMins = a.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m);
                const bMins = b.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m);
                return aMins - bMins;
            });

            for (const l of shiftLeaves) {
                // Parse leave times
                const [startH, startM] = l.startTime.split(':').map(Number);
                const dStart = new Date(checkinTime);
                dStart.setUTCHours(startH - 5);
                dStart.setUTCMinutes(startM - 30); // simplistic IST to UTC conversion
                // Actually safer to construct in IST
                const leaveStartIso = `${shiftDateStr}T${l.startTime}:00+05:30`;
                const leaveStartTs = new Date(leaveStartIso).getTime();
                
                let leaveEndTs;
                if (l.status === 'completed' && l.actualReturnTime) {
                    const leaveEndIso = `${shiftDateStr}T${l.actualReturnTime}:00+05:30`;
                    leaveEndTs = new Date(leaveEndIso).getTime();
                } else if (l.status === 'approved') {
                    leaveEndTs = Date.now(); // Still on break
                    isOnBreak = true;
                }
                
                if (!leaveEndTs) continue;
                
                // Clip leave to shift boundaries
                const clippedStart = Math.max(startTs, leaveStartTs);
                const clippedEnd = Math.min(endTs, leaveEndTs);
                
                if (clippedStart < clippedEnd) {
                    // Create preceding active segment
                    if (clippedStart > currentCursor) {
                        segments.push({
                            type: 'shift',
                            start: currentCursor,
                            end: clippedStart,
                            durationMs: clippedStart - currentCursor
                        });
                    }
                    
                    // Create break segment
                    const breakDurationMs = clippedEnd - clippedStart;
                    if (totalShiftMs !== null) {
                        totalShiftMs -= breakDurationMs;
                    }
                    
                    segments.push({
                        type: 'break',
                        start: clippedStart,
                        end: clippedEnd,
                        durationMs: breakDurationMs,
                        justification: l.reason || 'Short Leave',
                        lateDurationMinutes: l.lateDurationMinutes || null
                    });
                    
                    currentCursor = clippedEnd;
                }
            }
            
            // Final active segment
            if (currentCursor < endTs && !isOnBreak) {
                segments.push({
                    type: 'shift',
                    start: currentCursor,
                    end: checkoutTime ? endTs : null,
                    durationMs: checkoutTime ? (endTs - currentCursor) : null
                });
            }
            
            // Sort segments descending
            segments.sort((a, b) => b.start - a.start);
            
            return { segments, totalShiftMs, isOnBreak };
        };

        for (const log of logs) {
            const uid = log.details?.userId || log.userId;
            if (!uid) continue;

            if (log.action === 'SUPPORT_SHIFT_CHECKIN') {
                if (!checkinMap[uid]) checkinMap[uid] = [];
                checkinMap[uid].push(log);
            } else if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
                const pending = checkinMap[uid];
                const checkinLog = pending && pending.length > 0 ? pending.shift() : null;

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
                    checkinTime: actualCheckinTime,
                    checkinRounded: checkinLog?.details?.roundedTime || log.details?.checkinRounded || null,
                    checkoutTime: actualCheckoutTime,
                    totalShiftMs,
                    segments,
                    isOnBreak,
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
                    date: dateStr
                });
            }
        }

        // Handle orphan checkins (checked in but never checked out within the range)
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
                    checkinTime: actualCheckinTime,
                    checkinRounded: orphan.details?.roundedTime || null,
                    checkoutTime: null,
                    totalShiftMs: null,
                    segments: res.segments,
                    isOnBreak: res.isOnBreak,
                    activeDurationMs: calculateActiveTime(uid, actualCheckinTime, null),
                    overtimeMs: 0,
                    isAutoCheckout: false,
                    isEarlyCheckout: false,
                    justification: null,
                    date: dateStr
                });
            }
        }

        // 🛡️ Filter shifts for managers: only show their reportees' shifts (NOT their own)
        let filteredShifts = shifts;
        if (req.userRole !== 'admin') {
            filteredShifts = shifts.filter(s => s.managerId === req.userId);
        }

        // Sort by date desc, then checkin time desc
        filteredShifts.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return new Date(b.checkinTime || 0) - new Date(a.checkinTime || 0);
        });

        // Summary stats
        const uniqueWorkers = new Set(filteredShifts.map(s => s.userId)).size;
        const completedShifts = filteredShifts.filter(s => s.checkoutTime);
        const avgDurationMs = completedShifts.length > 0
            ? completedShifts.reduce((sum, s) => sum + (s.totalShiftMs || 0), 0) / completedShifts.length
            : 0;
        const totalOvertimeMs = completedShifts.reduce((sum, s) => sum + (s.overtimeMs || 0), 0);
        const earlyCheckouts = completedShifts.filter(s => s.isEarlyCheckout).length;

        res.json({
            success: true,
            shifts: filteredShifts,
            summary: {
                totalWorkers: uniqueWorkers,
                totalShifts: filteredShifts.length,
                completedShifts: completedShifts.length,
                avgDurationMs,
                totalOvertimeMs,
                earlyCheckouts
            }
        });
    } catch (error) {
        console.error("Error fetching shift history:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 📊 ATTENDANCE PATTERNS (30 Days)
// ═══════════════════════════════════════════════════════════════
router.get('/shift-attendance-patterns', requireAdminOrSupport, async (req, res) => {
    try {
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
                name: p.data?.name || p.id,
                avatar: p.data?.avatar || '',
                supportLevel: p.data?.supportLevel || '',
                managerId: p.data?.managerId || '',
                shortLeaves: p.data?.shortLeaves || [],
                scheduledStart: p.data?.scheduledShiftStart || DEFAULT_SHIFT_START,
                scheduledEnd: p.data?.scheduledShiftEnd || DEFAULT_SHIFT_END
            };
        }

        // Build per-user stats
        const patterns = {};
        for (const log of logs) {
            const uid = log.details?.userId || log.userId;
            if (!uid) continue;
            if (!patterns[uid]) {
                patterns[uid] = {
                    userId: uid,
                    name: playerMap[uid]?.name || uid,
                    avatar: playerMap[uid]?.avatar || '',
                    supportLevel: playerMap[uid]?.supportLevel || '',
                    managerId: playerMap[uid]?.managerId || '',
                    scheduledStart: playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START,
                    scheduledEnd: playerMap[uid]?.scheduledEnd || DEFAULT_SHIFT_END,
                    daysWorked: new Set(),
                    lateCheckins: 0,
                    autoCheckouts: 0,
                    earlyCheckouts: 0,
                    totalShiftMs: 0,
                    shiftCount: 0,
                    totalBreakMs: 0,
                    lateReturns: 0
                };
            }

            const p = patterns[uid];
            const dateStr = new Date(new Date(log.timestamp).getTime() + 5.5 * 3600000).toISOString().split('T')[0];
            p.daysWorked.add(dateStr);

            if (log.action === 'SUPPORT_SHIFT_CHECKIN') {
                p.shiftCount++;
                // Check if late check-in
                const schedStart = playerMap[uid]?.scheduledStart || DEFAULT_SHIFT_START;
                const [schedH, schedM] = schedStart.split(':').map(Number);
                const checkinIST = new Date(new Date(log.timestamp).getTime() + 5.5 * 3600000);
                const checkinH = checkinIST.getUTCHours();
                const checkinM = checkinIST.getUTCMinutes();
                if (checkinH > schedH || (checkinH === schedH && checkinM > schedM + 10)) {
                    p.lateCheckins++;
                }
            }

            if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
                if (log.details?.isAutoCheckout) p.autoCheckouts++;
                const totalMs = log.details?.totalShiftMs || 0;
                if (totalMs > 0 && totalMs < 7 * 3600000 && !log.details?.isAutoCheckout) p.earlyCheckouts++;
                p.totalShiftMs += totalMs;
            }
        }

        // Calculate break stats from shortLeaves
        for (const uid of Object.keys(patterns)) {
            const leaves = playerMap[uid]?.shortLeaves || [];
            const recentLeaves = leaves.filter(l => {
                const ld = new Date(l.date);
                return ld >= start && ld <= end;
            });
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

        // Filter for managers
        let result = Object.values(patterns).map(p => ({
            ...p,
            daysWorked: p.daysWorked.size,
            avgShiftMs: p.shiftCount > 0 ? Math.round(p.totalShiftMs / p.shiftCount) : 0,
            attendanceRate: Math.round((p.daysWorked.size / 30) * 100)
        }));

        if (req.userRole !== 'admin') {
            result = result.filter(p => p.managerId === req.userId);
        }

        result.sort((a, b) => b.lateCheckins - a.lateCheckins);

        res.json({ success: true, patterns: result });
    } catch (error) {
        console.error('Error fetching attendance patterns:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ⚠️ ANOMALY ALERTS (Admin Only)
// ═══════════════════════════════════════════════════════════════
router.get('/shift-anomalies', requireAdmin, async (req, res) => {
    try {
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
            playerMap[p.id] = {
                name: p.data?.name || p.id,
                avatar: p.data?.avatar || '',
                supportLevel: p.data?.supportLevel || '',
                shortLeaves: p.data?.shortLeaves || []
            };
        }

        // Build per-user anomaly counters
        const userStats = {};
        for (const log of logs) {
            const uid = log.details?.userId || log.userId;
            if (!uid) continue;
            if (!userStats[uid]) userStats[uid] = { autoCheckouts: 0, overtimeMs: 0, breakExceededDays: new Set() };

            if (log.action === 'SUPPORT_SHIFT_CHECKOUT') {
                if (log.details?.isAutoCheckout) userStats[uid].autoCheckouts++;
                const totalMs = log.details?.totalShiftMs || 0;
                if (totalMs > 8 * 3600000) userStats[uid].overtimeMs += (totalMs - 8 * 3600000);
            }
        }

        // Check break policy violations from shortLeaves
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

        // Count late returns from shortLeaves
        for (const uid of Object.keys(userStats)) {
            const leaves = playerMap[uid]?.shortLeaves || [];
            userStats[uid].lateReturns = leaves.filter(l => {
                const ld = new Date(l.date);
                return ld >= start && ld <= end && l.isLateReturn;
            }).length;
        }

        // Build anomaly alerts
        const anomalies = [];
        for (const [uid, stats] of Object.entries(userStats)) {
            if (stats.autoCheckouts >= 2) {
                anomalies.push({
                    type: 'excessive_auto_checkouts',
                    severity: stats.autoCheckouts >= 3 ? 'critical' : 'warning',
                    agentId: uid,
                    agentName: playerMap[uid]?.name || uid,
                    agentAvatar: playerMap[uid]?.avatar || '',
                    details: `${stats.autoCheckouts} auto-checkouts in the past 7 days`,
                    occurrences: stats.autoCheckouts
                });
            }
            if (stats.breakExceededDays.size >= 2) {
                anomalies.push({
                    type: 'break_policy_violation',
                    severity: stats.breakExceededDays.size >= 3 ? 'critical' : 'warning',
                    agentId: uid,
                    agentName: playerMap[uid]?.name || uid,
                    agentAvatar: playerMap[uid]?.avatar || '',
                    details: `Break exceeded 90 min on ${stats.breakExceededDays.size} days`,
                    occurrences: stats.breakExceededDays.size
                });
            }
            if (stats.lateReturns >= 3) {
                anomalies.push({
                    type: 'chronic_late_returns',
                    severity: stats.lateReturns >= 5 ? 'critical' : 'warning',
                    agentId: uid,
                    agentName: playerMap[uid]?.name || uid,
                    agentAvatar: playerMap[uid]?.avatar || '',
                    details: `${stats.lateReturns} late returns from breaks in 7 days`,
                    occurrences: stats.lateReturns
                });
            }
            if (stats.overtimeMs > 2 * 3600000) {
                const hrs = Math.round(stats.overtimeMs / 3600000 * 10) / 10;
                anomalies.push({
                    type: 'excessive_overtime',
                    severity: stats.overtimeMs > 4 * 3600000 ? 'critical' : 'warning',
                    agentId: uid,
                    agentName: playerMap[uid]?.name || uid,
                    agentAvatar: playerMap[uid]?.avatar || '',
                    details: `${hrs}h overtime accumulated in 7 days`,
                    occurrences: Math.ceil(hrs)
                });
            }
        }

        anomalies.sort((a, b) => {
            const sevOrder = { critical: 0, warning: 1 };
            return (sevOrder[a.severity] || 1) - (sevOrder[b.severity] || 1);
        });

        res.json({ success: true, anomalies });
    } catch (error) {
        console.error('Error fetching anomalies:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ✅ OVERTIME JUSTIFICATION
// ═══════════════════════════════════════════════════════════════
router.post('/overtime-justify', requireAdminOrSupport, async (req, res) => {
    try {
        const { shiftLogId, justification } = req.body;
        if (!shiftLogId || !justification) {
            return res.status(400).json({ success: false, message: 'shiftLogId and justification are required' });
        }

        const log = await AuditLog.findById(shiftLogId);
        if (!log) {
            return res.status(404).json({ success: false, message: 'Shift log not found' });
        }

        log.details = log.details || {};
        log.details.overtimeJustification = justification;
        log.details.overtimeJustifiedBy = req.userId;
        log.details.overtimeJustifiedAt = new Date().toISOString();
        await log.save();

        res.json({ success: true, message: 'Overtime justified successfully' });
    } catch (error) {
        console.error('Error justifying overtime:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ⏰ UPDATE AGENT SHIFT SCHEDULE
// ═══════════════════════════════════════════════════════════════
router.post('/update-shift-schedule', requireAdminOrSupport, async (req, res) => {
    try {
        const { agentId, scheduledShiftStart, scheduledShiftEnd } = req.body;
        if (!agentId) return res.status(400).json({ success: false, message: 'agentId is required' });

        const player = await User.findOne({ id: agentId });
        if (!player) return res.status(404).json({ success: false, message: 'Agent not found' });

        if (scheduledShiftStart) player.data.scheduledShiftStart = scheduledShiftStart;
        if (scheduledShiftEnd) player.data.scheduledShiftEnd = scheduledShiftEnd;
        player.markModified('data');
        await player.save();

        await AuditLog.create({
            action: 'SHIFT_SCHEDULE_UPDATED',
            userId: req.userId,
            timestamp: new Date(),
            details: { agentId, scheduledShiftStart, scheduledShiftEnd, updatedBy: req.userId }
        });

        res.json({ success: true, message: 'Shift schedule updated' });
    } catch (error) {
        console.error('Error updating shift schedule:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

    return router;
}
