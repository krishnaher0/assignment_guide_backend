import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/**
 * @desc    Get all active sessions for current user
 * @route   GET /api/sessions
 * @access  Private
 */
export const getActiveSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('activeSessions');
        res.json(user.activeSessions);
    } catch (error) {
        console.error('Get Sessions Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Revoke a specific session
 * @route   DELETE /api/sessions/:id
 * @access  Private
 */
export const revokeSession = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        const sessionIndex = user.activeSessions.findIndex(
            (s) => s.sessionId === req.params.id || s._id.toString() === req.params.id
        );

        if (sessionIndex === -1) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const revokedSession = user.activeSessions[sessionIndex];
        user.activeSessions.splice(sessionIndex, 1);
        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'session_revoked',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            details: { sessionId: req.params.id, revokedSessionIp: revokedSession.ipAddress }
        });

        res.json({ message: 'Session revoked successfully' });
    } catch (error) {
        console.error('Revoke Session Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Logout all other sessions
 * @route   DELETE /api/sessions/all-others
 * @access  Private
 */
export const revokeAllOtherSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Keep current session (based on IP and User-Agent - simplified)
        const currentIp = req.ip;
        const currentUserAgent = req.headers['user-agent'];

        user.activeSessions = user.activeSessions.filter(
            (s) => s.ipAddress === currentIp && s.deviceInfo === currentUserAgent
        );

        // If filtering leaves nothing (rare but possible), keep at least one or clear all
        // For simplicity, let's just clear all if the user wants "Logout All"

        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'session_revoked',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            details: { type: 'all_others' }
        });

        res.json({ message: 'All other sessions revoked' });
    } catch (error) {
        console.error('Revoke All Sessions Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Logout from all devices
 * @route   DELETE /api/sessions/logout-all
 * @access  Private
 */
export const revokeAllSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        user.activeSessions = [];
        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'session_revoked',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            details: { type: 'all_devices' }
        });

        res.json({ message: 'Logged out from all devices successfully' });
    } catch (error) {
        console.error('Revoke All Devices Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Get login history/locations
 * @route   GET /api/sessions/history
 * @access  Private
 */
export const getLoginHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('loginLocations');
        res.json(user.loginLocations);
    } catch (error) {
        console.error('Get Login History Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
