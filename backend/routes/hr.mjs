import express from 'express';
import { LeaveRequest, Document, PerformanceReview, Attendance, Payslip } from '../models/HRModels.mjs';
import { OrgSetting } from '../models/AdminCoreModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export default function createHrRoutes() {
    const router = express.Router();
    
    router.use(apiKeyGuard);
    router.use(authGuard);

    // Leaves
    router.get('/leaves', async (req, res) => {
        try {
            const query = req.userRole === 'admin' ? {} : { userId: req.user.id };
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
            res.json({ success: true, leave });
        } catch (error) {
            console.error("Error creating leave:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

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
