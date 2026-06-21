import express from 'express';
import { AuditLog, OrgSetting } from '../models/AdminCoreModels.mjs';
import { Player as User, PlayerSession } from '../models/index.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

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

        for (const log of logs) {
            const uid = log.details?.userId || log.userId;
            if (!uid) continue;
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
                    activeDurationMs: calculateActiveTime(uid, actualCheckinTime, actualCheckoutTime),
                    overtimeMs,
                    isAutoCheckout: !!log.details?.isAutoCheckout,
                    isEarlyCheckout: totalShiftMs < SEVEN_HOURS_MS && !log.details?.isAutoCheckout,
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

        // 🛡️ Filter shifts for managers: only show their own shifts or their reportees' shifts
        let filteredShifts = shifts;
        if (req.userRole !== 'admin') {
            filteredShifts = shifts.filter(s => s.userId === req.userId || s.managerId === req.userId);
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

    return router;
}
