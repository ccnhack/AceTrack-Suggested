import express from 'express';
import { LeaveRequest, Document, PerformanceReview, Attendance, Payslip } from '../models/HRModels.mjs';
import { OrgSetting } from '../models/AdminCoreModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export default function createHrRoutes() {
    const router = express.Router();
    
    router.use(apiKeyGuard);
    router.use(authGuard);

    // Leaves
    // Leaves
    router.get('/leaves', async (req, res) => {
        try {
            let query = { userId: req.user.id };
            
            if (req.userRole === 'admin') {
                query = {}; // Admins see all leaves
            } else if (req.user.supportLevel === 'Manager') {
                // Fetch users who report to this manager
                const { Player } = await import('../models/index.mjs');
                const reports = await Player.find({ "data.managerId": req.user.id }, 'id');
                const reportIds = reports.map(r => r.id);
                
                // Manager sees their own leaves + their reports' leaves
                query = { userId: { $in: [req.user.id, ...reportIds] } };
            }

            const leaves = await LeaveRequest.find(query).sort({ appliedAt: -1 });
            res.json({ success: true, leaves });
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

            // TODO: Ensure req.user is authorized (Admin or their Manager)
            if (req.userRole !== 'admin' && req.user.supportLevel !== 'Manager') {
                return res.status(403).json({ success: false, message: 'Unauthorized' });
            }

            const leave = await LeaveRequest.findByIdAndUpdate(
                id,
                { status, managerComment, updatedAt: new Date() },
                { new: true }
            );

            if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

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
            const query = req.userRole === 'admin' ? {} : { userId: req.user.id };
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
            const query = req.userRole === 'admin' ? {} : { userId: req.user.id };
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
            const query = req.userRole === 'admin' ? {} : { userId: req.user.id };
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
            const query = req.userRole === 'admin' ? {} : { userId: req.user.id };
            const documents = await Document.find(query).sort({ uploadedAt: -1 });
            res.json({ success: true, documents });
        } catch (error) {
            console.error("Error fetching documents:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    return router;
}
