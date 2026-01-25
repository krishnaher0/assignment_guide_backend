import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import * as otpService from '../services/otpService.js';
import bcrypt from 'bcryptjs';
import generateToken from '../utils/generateToken.js';
import geoip from 'geoip-lite';
import { trackLoginAttempt } from '../middleware/bruteForceProtection.js';

/**
 * @desc    Initialize MFA setup for user
 * @route   POST /api/mfa/setup
 * @access  Private
 */
export const setupMFA = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.mfaEnabled) {
            return res.status(400).json({ message: 'MFA is already enabled' });
        }

        // Generate secret
        const { secret, otpauthUrl } = otpService.generateTOTPSecret(user.email);

        // Save temporary secret (unverified)
        user.mfaSecret = otpService.encryptSecret(secret);
        await user.save();

        // Generate QR code
        const qrCodeDataUrl = await otpService.generateQRCode(otpauthUrl);

        res.json({
            secret, // Usually only QR code is needed, but we provide secret for manual entry
            qrCode: qrCodeDataUrl,
            otpauthUrl
        });
    } catch (error) {
        console.error('MFA Setup Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Verify and complete MFA setup
 * @route   POST /api/mfa/verify-setup
 * @access  Private
 */
export const verifyMFASetup = async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user._id);

        if (!user || !user.mfaSecret) {
            return res.status(400).json({ message: 'MFA setup not initialized' });
        }

        const isValid = otpService.verifyTOTPToken(token, user.mfaSecret);

        if (!isValid) {
            return res.status(400).json({ message: 'Invalid verification token' });
        }

        // Generate backup codes
        const backupCodes = otpService.generateBackupCodes();
        const hashedBackupCodes = await otpService.hashBackupCodes(backupCodes);

        // Enable MFA
        user.mfaEnabled = true;
        user.mfaBackupCodes = hashedBackupCodes;
        await user.save();

        // Log the event
        await AuditLog.create({
            userId: user._id,
            action: 'mfa_enabled',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'medium'
        });

        res.json({
            message: 'MFA enabled successfully',
            backupCodes // Share codes once with the user
        });
    } catch (error) {
        console.error('MFA Verify Setup Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Verify MFA during login
 * @route   POST /api/mfa/verify-login
 * @access  Public (Requires partial session/temp token)
 */
export const verifyMFALogin = async (req, res) => {
    try {
        const { userId, token, isBackupCode } = req.body;

        if (!userId || !token) {
            return res.status(400).json({ message: 'User ID and token are required' });
        }

        const user = await User.findById(userId);

        if (!user || !user.mfaEnabled) {
            return res.status(400).json({ message: 'MFA not enabled for this account' });
        }

        let isValid = false;

        if (isBackupCode) {
            const result = await otpService.verifyBackupCode(token, user.mfaBackupCodes);
            if (result.isValid) {
                isValid = true;
                // Remove used backup code
                user.mfaBackupCodes.splice(result.index, 1);
                await user.save();
            }
        } else {
            isValid = otpService.verifyTOTPToken(token, user.mfaSecret);
        }

        if (!isValid) {
            await AuditLog.create({
                userId: user._id,
                action: 'mfa_failed',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                status: 'failure',
                severity: 'medium',
                details: { method: isBackupCode ? 'backup_code' : 'totp' }
            });

            return res.status(401).json({ message: 'Invalid verification code' });
        }

        // Successful MFA verification
        await AuditLog.create({
            userId: user._id,
            action: 'mfa_verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'low'
        });

        // Update session info (similar to standard login)
        const ipAddress = req.ip || req.connection.remoteAddress;
        const geo = geoip.lookup(ipAddress);
        const location = geo ? `${geo.city}, ${geo.country}` : 'Unknown';

        const session = {
            sessionId: Math.random().toString(36).substring(2, 15),
            deviceInfo: req.headers['user-agent'],
            ipAddress,
            location,
            lastActivity: new Date()
        };

        user.activeSessions.push(session);
        // Limit to 5 concurrent sessions
        if (user.activeSessions.length > 5) {
            user.activeSessions.shift();
        }

        // Track login location
        const isNewLocation = !user.loginLocations.some(loc => loc.city === (geo?.city || 'Unknown'));
        user.loginLocations.push({
            ipAddress,
            location,
            city: geo?.city || 'Unknown',
            country: geo?.country || 'Unknown',
            timestamp: new Date(),
            isNewLocation
        });

        await user.save();

        // Track successful login
        await trackLoginAttempt(req, res, true, user._id);

        // Set cookie
        const options = {
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        };
        const jwtToken = generateToken(user._id);

        res.cookie('token', jwtToken, options).json({
            message: 'MFA verified successfully',
            success: true,
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: jwtToken,
        });
    } catch (error) {
        console.error('MFA Verify Login Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Disable MFA
 * @route   POST /api/mfa/disable
 * @access  Private
 */
export const disableMFA = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify password before disabling MFA
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        user.mfaEnabled = false;
        user.mfaSecret = undefined;
        user.mfaBackupCodes = [];
        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'mfa_disabled',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'high'
        });

        res.json({ message: 'MFA disabled successfully' });
    } catch (error) {
        console.error('MFA Disable Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Regenerate backup codes
 * @route   POST /api/mfa/regenerate-codes
 * @access  Private
 */
export const regenerateBackupCodes = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user._id);

        if (!user || !user.mfaEnabled) {
            return res.status(400).json({ message: 'MFA is not enabled' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        const backupCodes = otpService.generateBackupCodes();
        const hashedBackupCodes = await otpService.hashBackupCodes(backupCodes);

        user.mfaBackupCodes = hashedBackupCodes;
        await user.save();

        res.json({
            message: 'Backup codes regenerated successfully',
            backupCodes
        });
    } catch (error) {
        console.error('MFA Regenerate Codes Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * @desc    Get MFA status
 * @route   GET /api/mfa/status
 * @access  Private
 */
export const getMFAStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('mfaEnabled');
        res.json({
            mfaEnabled: user.mfaEnabled
        });
    } catch (error) {
        console.error('MFA Status Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
