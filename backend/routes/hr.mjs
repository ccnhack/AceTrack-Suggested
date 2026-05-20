import express from 'express';
import { LeaveRequest, Document, PerformanceReview, Attendance, Payslip } from '../models/HRModels.mjs';
import { OrgSetting } from '../models/AdminCoreModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export default function createHrRoutes() {
    const router = express.Router();
    
    router.use(apiKeyGuard);
    router.use(authGuard);

    // Leaves
    const buildHRQuery = async (req) => {
        if (req.userRole === 'admin') return {};
        if (req.user.supportLevel === 'Manager') {
            const { Player } = await import('../models/index.mjs');
            const reports = await Player.find({ "data.managerId": req.user.id }, 'id');
            return { userId: { $in: [req.user.id, ...reports.map(r => r.id)] } };
        }
        return { userId: req.user.id };
    };

    // Leaves
    router.get('/leaves', async (req, res) => {
        try {
            const query = await buildHRQuery(req);

            const leaves = await LeaveRequest.find(query).sort({ appliedAt: -1 }).lean();

            // 🛡️ [NAME ENRICHMENT] (v2.6.446): Attach employee names to leave records
            // so the manager UI can show "John Doe requested Earned Leave" instead of just a userId
            const uniqueUserIds = [...new Set(leaves.map(l => l.userId))];
            const { Player } = await import('../models/index.mjs');
            const employeeDocs = await Player.find({ id: { $in: uniqueUserIds } }, 'id data.name data.designation').lean();
            const nameMap = {};
            for (const doc of employeeDocs) {
                nameMap[doc.id] = { name: doc.data?.name || 'Unknown', designation: doc.data?.designation || '' };
            }
            const enrichedLeaves = leaves.map(l => ({
                ...l,
                employeeName: nameMap[l.userId]?.name || l.userId,
                employeeDesignation: nameMap[l.userId]?.designation || ''
            }));

            res.json({ success: true, leaves: enrichedLeaves });
        } catch (error) {
            console.error("Error fetching leaves:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    router.post('/leaves', async (req, res) => {
        try {
            const { type, startDate, endDate, reason } = req.body;
            const leave = await LeaveRequest.create({
                userId: req.user.id,
                type, startDate, endDate, reason
            });
            
            // Notify the manager
            const { Player } = await import('../models/index.mjs');
            const { addInAppNotification } = await import('../helpers/utils.mjs');
            
            const employeeDoc = await Player.findOne({ id: req.user.id });
            const managerId = employeeDoc?.data?.managerId;
            
            if (managerId) {
                const managerDoc = await Player.findOne({ id: managerId });
                if (managerDoc && managerDoc.data) {
                    const manager = managerDoc.data;
                    manager.notifications = manager.notifications || [];
                    addInAppNotification(manager, `New Leave Request`, `${employeeDoc.data.name} applied for ${type} leave from ${startDate}.`);
                    await Player.updateOne({ id: managerId }, { $set: { "data.notifications": manager.notifications } });
                }
            } else {
                // If no manager, maybe notify admin (optional, handled by frontend real-time later)
            }

            res.json({ success: true, leave });
        } catch (error) {
            console.error("Error creating leave:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Leave Approvals (Admin or Manager)
    const approveOrRejectLeave = async (req, res, status) => {
        try {
            const { id } = req.params;
            const { managerComment } = req.body;

            const leave = await LeaveRequest.findById(id);
            if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

            // 🛡️ [RBAC GUARD] Ensure req.user is authorized (Admin or their specific Manager)
            if (req.userRole !== 'admin') {
                if (req.user.supportLevel !== 'Manager') {
                    return res.status(403).json({ success: false, message: 'Unauthorized' });
                }
                const { Player } = await import('../models/index.mjs');
                const employeeDoc = await Player.findOne({ id: leave.userId }, 'data.managerId');
                if (!employeeDoc || employeeDoc.data?.managerId !== req.user.id) {
                    return res.status(403).json({ success: false, message: 'Unauthorized: You are not the manager of this employee' });
                }
            }

            leave.status = status;
            if (managerComment) leave.managerComment = managerComment;
            leave.updatedAt = new Date();
            await leave.save();

            // Notify the employee
            const { Player } = await import('../models/index.mjs');
            const { addInAppNotification } = await import('../helpers/utils.mjs');
            
            const employeeDoc = await Player.findOne({ id: leave.userId });
            if (employeeDoc && employeeDoc.data) {
                const employee = employeeDoc.data;
                employee.notifications = employee.notifications || [];
                addInAppNotification(employee, `Leave ${status}`, `Your ${leave.type} leave from ${leave.startDate} was ${status.toLowerCase()}.`);
                await Player.updateOne({ id: leave.userId }, { $set: { "data.notifications": employee.notifications } });
            }

            res.json({ success: true, leave });
        } catch (error) {
            console.error(`Error ${status.toLowerCase()} leave:`, error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    };

    router.put('/leaves/:id/approve', (req, res) => approveOrRejectLeave(req, res, 'Approved'));
    router.put('/leaves/:id/reject', (req, res) => approveOrRejectLeave(req, res, 'Rejected'));


    // Policies
    router.get('/policies', async (req, res) => {
        try {
            const policies = await OrgSetting.find({ key: { $regex: /^policy_/i } });
            res.json({ success: true, policies });
        } catch (error) {
            console.error("Error fetching policies:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Reviews
    router.get('/reviews', async (req, res) => {
        try {
            const query = await buildHRQuery(req);
            const reviews = await PerformanceReview.find(query).sort({ createdAt: -1 });
            res.json({ success: true, reviews });
        } catch (error) {
            console.error("Error fetching reviews:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Attendance
    router.get('/attendance', async (req, res) => {
        try {
            const query = await buildHRQuery(req);
            const records = await Attendance.find(query).sort({ date: -1 }).limit(30);
            res.json({ success: true, attendance: records });
        } catch (error) {
            console.error("Error fetching attendance:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    router.post('/attendance/check-in', async (req, res) => {
        try {
            const date = new Date().toISOString().split('T')[0];
            const record = await Attendance.findOneAndUpdate(
                { userId: req.user.id, date },
                { checkIn: new Date() },
                { upsert: true, new: true }
            );
            res.json({ success: true, record });
        } catch (error) {
            console.error("Error checking in:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    router.post('/attendance/check-out', async (req, res) => {
        try {
            const date = new Date().toISOString().split('T')[0];
            const record = await Attendance.findOneAndUpdate(
                { userId: req.user.id, date },
                { checkOut: new Date() },
                { new: true }
            );
            res.json({ success: true, record });
        } catch (error) {
            console.error("Error checking out:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Payslips
    router.get('/payslips', async (req, res) => {
        try {
            const query = await buildHRQuery(req);
            const payslips = await Payslip.find(query).sort({ uploadedAt: -1 });
            res.json({ success: true, payslips });
        } catch (error) {
            console.error("Error fetching payslips:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Documents
    router.get('/documents', async (req, res) => {
        try {
            const query = await buildHRQuery(req);
            const documents = await Document.find(query).sort({ uploadedAt: -1 });
            res.json({ success: true, documents });
        } catch (error) {
            console.error("Error fetching documents:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    return router;
}
