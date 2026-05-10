import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userEmail: { type: String },
    action: { type: String, required: true }, // 'login', 'setting_change', 'role_change'
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now }
});

const OrgSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export const OrgSetting = mongoose.model('OrgSetting', OrgSettingSchema);
