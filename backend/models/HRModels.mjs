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

export const LeaveRequest = mongoose.model('LeaveRequest', LeaveRequestSchema);
export const Document = mongoose.model('Document', DocumentSchema);
export const PerformanceReview = mongoose.model('PerformanceReview', PerformanceReviewSchema);
