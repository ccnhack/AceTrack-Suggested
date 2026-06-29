/**
 * ═══════════════════════════════════════════════════════════════
 * 🔧 Admin Core Routes (v2.6.772)
 * Thin HTTP handlers — shift analytics logic in services/ShiftAnalyticsService.mjs
 * ═══════════════════════════════════════════════════════════════
 */
import express from 'express';
import { AuditLog, OrgSetting } from '../models/AdminCoreModels.mjs';
import { Player as User } from '../models/index.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';
import * as ShiftAnalytics from '../services/ShiftAnalyticsService.mjs';

export default function createAdminCoreRoutes() {
    const router = express.Router();
    
    router.use(apiKeyGuard);
    router.use(authGuard);

    const requireAdmin = (req, res, next) => {
        if (req.userRole !== 'admin') return res.status(403).json({ success: false, message: 'Access denied: Admins only' });
        next();
    };

    const requireAdminOrSupport = (req, res, next) => {
        if (req.userRole !== 'admin' && req.userRole !== 'support') return res.status(403).json({ success: false, message: 'Access denied: Admins or Support only' });
        next();
    };

    const respond = (res, result) => {
        const { status, ...body } = result;
        return res.status(status).json(body);
    };

    // ─── Audit Logs ──────────────────────────────────────────
    router.get('/audit-logs', requireAdmin, async (req, res) => {
        try {
            const { startDate, endDate, search } = req.query;
            let query = {};

            if (startDate || endDate) {
                query.timestamp = {};
                if (startDate) query.timestamp.$gte = new Date(startDate);
                if (endDate) query.timestamp.$lte = new Date(endDate);
                const start = new Date(startDate);
                const end = endDate ? new Date(endDate) : new Date();
                const diffDays = (end - start) / (1000 * 60 * 60 * 24);
                if (diffDays > 3 && !search) {
                    return res.status(400).json({ success: false, message: 'Date range cannot exceed 3 days without specific search filters (Action, Email, or IP).' });
                }
            }

            if (search) {
                const searchRegex = new RegExp(search, 'i');
                query.$or = [
                    { action: searchRegex }, { userEmail: searchRegex },
                    { ipAddress: searchRegex }, { "details.key": searchRegex }, { "details.value": searchRegex }
                ];
            }

            const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(200);
            res.json({ success: true, logs });
        } catch (error) {
            console.error("Error fetching audit logs:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Org Settings ────────────────────────────────────────
    router.get('/settings', requireAdmin, async (req, res) => {
        try {
            const settings = await OrgSetting.find();
            res.json({ success: true, settings });
        } catch (error) {
            console.error("Error fetching org settings:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    router.post('/settings', requireAdmin, async (req, res) => {
        try {
            const { key, value } = req.body;
            const setting = await OrgSetting.findOneAndUpdate(
                { key }, { value, updatedBy: req.user.id, updatedAt: new Date() },
                { upsert: true, new: true }
            );
            await AuditLog.create({ userId: req.user.id, userEmail: req.user.email, action: 'setting_change', details: { key, value }, ipAddress: req.ip });
            res.json({ success: true, setting });
        } catch (error) {
            console.error("Error saving org setting:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Team Directory ──────────────────────────────────────
    router.get('/team-directory', async (req, res) => {
        try {
            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }

            const team = await User.find({ "data.role": { $in: ['admin', 'support'] } })
                .select('id data.name data.email data.role data.designation data.avatar data.phone data.username data.devices data.supportStatus data.supportLevel data.isLive lastUpdated')
                .lean();

            const mappedTeam = team.map(u => {
                const userId = u.id || u._id?.toString() || '';
                const isLive = !!u.data?.isLive;

                let lastActive = u.data?.lastActive || 0;
                if (u.data?.devices && Array.isArray(u.data.devices)) {
                    lastActive = Math.max(lastActive, ...u.data.devices.map(d => d.lastActive || 0), 0);
                }

                const dbStatus = (u.data?.supportStatus || '').toLowerCase();
                const dbLevel = (u.data?.supportLevel || '').toUpperCase();
                const isExEmployee = dbStatus === 'terminated' || dbStatus === 'left' || dbLevel === 'EX-EMPLOYEE';

                return {
                    id: userId, name: u.data?.name || 'Unknown', email: u.data?.email || '',
                    role: u.data?.role || 'user',
                    designation: isExEmployee ? 'Ex-Employee' : (u.data?.designation || ''),
                    avatar: u.data?.avatar || '', phone: u.data?.phone || '', username: u.data?.username || '',
                    managerId: u.data?.managerId || '', teamLeadId: u.data?.teamLeadId || '',
                    supportLevel: u.data?.supportLevel || '',
                    supportStatus: u.data?.supportStatus || (isLive ? 'active' : 'offline'),
                    isExEmployee, isLive: isExEmployee ? false : isLive,
                    lastActive: lastActive || u.lastUpdated || 0,
                    status: isExEmployee ? 'left' : (isLive ? 'active' : 'offline'),
                    devices: u.data?.devices || [],
                };
            });
            res.json({ success: true, team: mappedTeam });
        } catch (error) {
            console.error("Error fetching team directory:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Update Hierarchy ────────────────────────────────────
    router.post('/team-directory/:id/hierarchy', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { managerId, teamLeadId } = req.body;
            const employeeDoc = await User.findOne({ id: String(id) });
            if (!employeeDoc) return res.status(404).json({ success: false, message: 'Employee not found' });

            const updateFields = { lastUpdated: Date.now() };
            if (managerId !== undefined) updateFields["data.managerId"] = managerId;
            if (teamLeadId !== undefined) updateFields["data.teamLeadId"] = teamLeadId;

            await User.updateOne({ id: String(id) }, { $set: updateFields });
            await AuditLog.create({ userId: req.user.id, userEmail: req.user.email, action: 'update_hierarchy', details: { employeeId: id, managerId, teamLeadId }, ipAddress: req.ip });
            res.json({ success: true, message: 'Hierarchy updated successfully' });
        } catch (error) {
            console.error("Error updating hierarchy:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Shift History (delegated) ───────────────────────────
    router.get('/shift-history', requireAdminOrSupport, async (req, res) => {
        try {
            const result = await ShiftAnalytics.getShiftHistory(req.query, req.userId, req.userRole);
            respond(res, result);
        } catch (error) {
            console.error("Error fetching shift history:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Attendance Patterns (delegated) ─────────────────────
    router.get('/shift-attendance-patterns', requireAdminOrSupport, async (req, res) => {
        try {
            const result = await ShiftAnalytics.getAttendancePatterns(req.userId, req.userRole);
            respond(res, result);
        } catch (error) {
            console.error('Error fetching attendance patterns:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Shift Anomalies (delegated) ─────────────────────────
    router.get('/shift-anomalies', requireAdmin, async (req, res) => {
        try {
            const result = await ShiftAnalytics.getShiftAnomalies();
            respond(res, result);
        } catch (error) {
            console.error('Error fetching anomalies:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Overtime Justification (delegated) ──────────────────
    router.post('/overtime-justify', requireAdminOrSupport, async (req, res) => {
        try {
            const result = await ShiftAnalytics.justifyOvertime(req.body.shiftLogId, req.body.justification, req.userId);
            respond(res, result);
        } catch (error) {
            console.error('Error justifying overtime:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ─── Update Shift Schedule (delegated) ───────────────────
    router.post('/update-shift-schedule', requireAdminOrSupport, async (req, res) => {
        try {
            const result = await ShiftAnalytics.updateShiftSchedule(req.body.agentId, req.body.scheduledShiftStart, req.body.scheduledShiftEnd, req.userId);
            respond(res, result);
        } catch (error) {
            console.error('Error updating shift schedule:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    return router;
}
