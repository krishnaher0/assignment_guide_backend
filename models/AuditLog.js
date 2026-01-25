import mongoose from 'mongoose';

const auditLogSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    action: {
        type: String,
        required: true,
        enum: [
            'login',
            'logout',
            'login_failed',
            'password_change',
            'password_reset_request',
            'password_reset_complete',
            'mfa_enabled',
            'mfa_disabled',
            'mfa_verified',
            'mfa_failed',
            'account_locked',
            'account_unlocked',
            'session_created',
            'session_revoked',
            'profile_updated',
            'email_verified',
            'security_alert',
            'suspicious_activity',
        ],
    },
    ipAddress: String,
    userAgent: String,
    location: {
        city: String,
        country: String,
        coordinates: {
            latitude: Number,
            longitude: Number,
        },
    },
    status: {
        type: String,
        enum: ['success', 'failure', 'warning'],
        default: 'success',
    },
    details: mongoose.Schema.Types.Mixed,
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
    },
}, {
    timestamps: true,
});

// Index for faster queries
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ ipAddress: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
