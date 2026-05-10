import mongoose from 'mongoose';

const LeaveRequestSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: { type: String, required: true }, // 'Sick', 'Earned', 'Unpaid'
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    reason: { type: String },
    status: { type: String, default: 'Pending' }, // 'Pending', 'Approved', 'Rejected'
    appliedAt: { type: Date, default: Date.now }
});

const DocumentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, required: true }, // 'Offer Letter', 'Aadhaar', 'PAN', 'Payslip'
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const PerformanceReviewSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    managerId: { type: String },
    period: { type: String, required: true }, // e.g., 'Q1 2026'
    score: { type: Number, required: true }, // 1-5
    feedback: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const AttendanceSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: { type: String, default: 'Present' } // 'Present', 'Half-Day', 'Absent'
});

const PayslipSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    month: { type: String, required: true }, // 'March 2026'
    url: { type: String, required: true }, // Cloudinary PDF url
    uploadedAt: { type: Date, default: Date.now }
});

export const LeaveRequest = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', LeaveRequestSchema);
export const Document = mongoose.models.Document || mongoose.model('Document', DocumentSchema);
export const PerformanceReview = mongoose.models.PerformanceReview || mongoose.model('PerformanceReview', PerformanceReviewSchema);
export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);
export const Payslip = mongoose.models.Payslip || mongoose.model('Payslip', PayslipSchema);
