import express from 'express';
import { AuditLog, OrgSetting } from '../models/AdminCoreModels.mjs';
import { Player as User } from '../models/index.mjs';
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

// GET /api/v1/admin-core/audit-logs
router.get('/audit-logs', requireAdmin, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
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
            .select('data.id data.name data.email data.role data.designation data.avatar data.phone data.username')
            .lean();
            
        // Map data back to flat structure for the frontend
        const mappedTeam = team.map(u => ({
            id: u.data?.id || u._id?.toString() || '',
            name: u.data?.name || 'Unknown',
            email: u.data?.email || '',
            role: u.data?.role || 'user',
            designation: u.data?.designation || '',
            avatar: u.data?.avatar || '',
            phone: u.data?.phone || '',
            username: u.data?.username || ''
        }));
            
        res.json({ success: true, team: mappedTeam });
    } catch (error) {
        console.error("Error fetching team directory:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

    return router;
}
