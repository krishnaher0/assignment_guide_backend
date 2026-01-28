import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';

/**
 * @desc    Get all audit logs with pagination and filters
 * @route   GET /api/audit
 * @access  Admin
 */
export const getAuditLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            action,
            userId,
            status,
            severity,
            startDate,
            endDate,
            search
        } = req.query;

        // Build filter query
        const filter = {};

        if (action) filter.action = action;
        if (userId) filter.userId = userId;
        if (status) filter.status = status;
        if (severity) filter.severity = severity;

        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Search in multiple fields
        if (search) {
            filter.$or = [
                { action: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } },
                { city: { $regex: search, $options: 'i' } },
                { country: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;

        // Get logs with user population
        const logs = await AuditLog.find(filter)
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        // Get total count
        const total = await AuditLog.countDocuments(filter);

        res.json({
            logs,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalLogs: total,
            hasMore: skip + logs.length < total
        });
    } catch (error) {
        console.error('Get Audit Logs Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Get single audit log by ID
 * @route   GET /api/audit/:id
 * @access  Admin
 */
export const getAuditLogById = async (req, res) => {
    try {
        const log = await AuditLog.findById(req.params.id)
            .populate('userId', 'name email role profileImage');

        if (!log) {
            return res.status(404).json({ message: 'Audit log not found' });
        }

        res.json(log);
    } catch (error) {
        console.error('Get Audit Log Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Get audit log statistics
 * @route   GET /api/audit/stats
 * @access  Admin
 */
export const getAuditLogStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get counts by action
        const actionStats = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Get counts by status
        const statusStats = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Get counts by severity
        const severityStats = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);

        // Get recent critical events
        const criticalEvents = await AuditLog.find({
            ...dateFilter,
            severity: 'critical'
        })
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(10);

        // Get failed login attempts
        const failedLogins = await AuditLog.countDocuments({
            ...dateFilter,
            action: 'login_failed'
        });

        // Get account lockouts
        const lockouts = await AuditLog.countDocuments({
            ...dateFilter,
            action: 'account_locked'
        });

        // Get successful logins
        const successfulLogins = await AuditLog.countDocuments({
            ...dateFilter,
            action: 'login',
            status: 'success'
        });

        // Get MFA events
        const mfaEvents = await AuditLog.countDocuments({
            ...dateFilter,
            action: { $in: ['mfa_enabled', 'mfa_verified', 'mfa_failed'] }
        });

        // Get top IP addresses
        const topIPs = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$ipAddress', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Get activity timeline (events per day for last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const timeline = await AuditLog.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            actionStats,
            statusStats,
            severityStats,
            criticalEvents,
            summary: {
                failedLogins,
                lockouts,
                successfulLogins,
                mfaEvents
            },
            topIPs,
            timeline
        });
    } catch (error) {
        console.error('Get Audit Stats Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Get audit logs for specific user
 * @route   GET /api/audit/user/:userId
 * @access  Admin
 */
export const getUserAuditLogs = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        // Verify user exists
        const user = await User.findById(userId).select('name email role');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const skip = (page - 1) * limit;

        const logs = await AuditLog.find({ userId })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await AuditLog.countDocuments({ userId });

        res.json({
            user,
            logs,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalLogs: total
        });
    } catch (error) {
        console.error('Get User Audit Logs Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Export audit logs to CSV
 * @route   GET /api/audit/export
 * @access  Admin
 */
export const exportAuditLogs = async (req, res) => {
    try {
        const { startDate, endDate, action, status, severity } = req.query;

        // Build filter
        const filter = {};
        if (action) filter.action = action;
        if (status) filter.status = status;
        if (severity) filter.severity = severity;

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Get logs
        const logs = await AuditLog.find(filter)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(10000); // Limit to 10k records for export

        // Convert to CSV
        const csvHeader = 'Date,Time,User,Email,Action,Status,Severity,IP Address,Location,Details\n';

        const csvRows = logs.map(log => {
            const date = new Date(log.createdAt);
            const dateStr = date.toISOString().split('T')[0];
            const timeStr = date.toTimeString().split(' ')[0];
            const user = log.userId ? log.userId.name : 'N/A';
            const email = log.userId ? log.userId.email : 'N/A';
            const location = log.city && log.country ? `${log.city}, ${log.country}` : 'Unknown';
            const details = log.details ? JSON.stringify(log.details).replace(/"/g, '""') : '';

            return `"${dateStr}","${timeStr}","${user}","${email}","${log.action}","${log.status}","${log.severity}","${log.ipAddress}","${location}","${details}"`;
        }).join('\n');

        const csv = csvHeader + csvRows;

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);

        res.send(csv);
    } catch (error) {
        console.error('Export Audit Logs Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
