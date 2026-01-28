import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import bcrypt from 'bcryptjs';
import { validatePassword } from '../validators/passwordValidator.js';
import { trackLoginAttempt } from '../middleware/bruteForceProtection.js';
import geoip from 'geoip-lite';
import crypto from 'crypto';
import { sendEmail } from '../services/emailService.js';
import AuditLog from '../models/AuditLog.js';

// Helper to send token response with cookie
const sendTokenResponse = (user, statusCode, res, sessionId = null) => {
    const token = generateToken(user._id, sessionId);

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };

    res.status(statusCode)
        .cookie('token', token, options)
        .json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token, // Keep returning token for frontend (localStorage)
            sessionId
        });
};

// @desc    Get current user info
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        // req.user is set by the protect middleware
        const user = await User.findById(req.user._id).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            profileImage: user.profileImage,
            status: user.status,
            isBanned: user.isBanned,
        });
    } catch (error) {
        console.error('Get Me Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[Login] Attempt for email: ${email}`);

        const user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            console.log(`[Login] User found: ${user._id}, Verified: ${user.isEmailVerified}, Role: ${user.role}`);
        } else {
            console.log('[Login] User not found');
        }

        if (user && (await bcrypt.compare(password, user.password))) {
            // Check if account is active/banned
            if (user.isBanned) {
                await trackLoginAttempt(req, res, false);
                return res.status(403).json({ message: 'Account is banned: ' + user.banReason });
            }

            // Check for MFA
            console.log(`[Login] MFA Check - mfaEnabled: ${user.mfaEnabled}`);
            if (user.mfaEnabled) {
                console.log(`[Login] MFA required for user ${user._id}`);
                // Return partial success for MFA step
                return res.status(200).json({
                    mfaRequired: true,
                    userId: user._id,
                    message: 'MFA verification required'
                });
            }

            // Track successful login and log audit
            await trackLoginAttempt(req, res, true, user._id);

            // Update session info
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

            // Send new login alert if new location
            if (isNewLocation) {
                const time = new Date().toLocaleString();
                sendEmail(user.email, 'loginAlert', {
                    location,
                    time,
                    ip: ipAddress,
                    device: req.headers['user-agent']
                });
            }

            // Check if email is verified
            if (user.isEmailVerified === false) {
                console.log(`[Login] Email not verified for user ${user._id}`);
                // Generate new OTP if previous one expired
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpHash = crypto
                    .createHash('sha256')
                    .update(otp)
                    .digest('hex');

                user.emailVerificationOTP = otpHash;
                user.emailVerificationOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
                await user.save();

                // Send OTP email
                try {
                    await sendEmail(user.email, 'otpVerification', {
                        code: otp,
                        name: user.name
                    });
                } catch (err) {
                    console.error('OTP email send failed:', err);
                }

                return res.status(401).json({
                    message: 'Please verify your email address',
                    requiresVerification: true,
                    userId: user._id,
                    email: user.email
                });
            }

            await user.save();

            sendTokenResponse(user, 200, res, session.sessionId);
        } else {
            await trackLoginAttempt(req, res, false);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Validate required fields for manual registration
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Advanced password validation
        const passwordVal = await validatePassword(password, [name, email]);
        if (!passwordVal.isValid) {
            return res.status(400).json({
                message: 'Password does not meet security requirements',
                errors: passwordVal.complexity.errors,
                strength: passwordVal.strength,
                isCompromised: passwordVal.compromised.isCompromised
            });
        }

        const userExists = await User.findOne({ email });

        if (userExists) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Set password expiry (90 days)
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = crypto
            .createHash('sha256')
            .update(otp)
            .digest('hex');

        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            role: role || 'client', // Default to client if not specified
            authMethod: 'manual',
            passwordChangedAt: new Date(),
            passwordExpiresAt,
            isEmailVerified: false, // Require OTP verification
            emailVerificationOTP: otpHash,
            emailVerificationOTPExpires: Date.now() + 10 * 60 * 1000 // 10 minutes
        });

        if (user) {
            // Log registration event
            await AuditLog.create({
                userId: user._id,
                action: 'profile_updated', // Using existing audit action for account creation
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                status: 'success',
                details: { event: 'user_registration' }
            });

            // Send OTP email
            try {
                await sendEmail(user.email, 'otpVerification', {
                    code: otp,
                    name: user.name
                });
            } catch (err) {
                console.error('OTP email send failed:', err);
            }

            // Return success with requiresVerification flag
            res.status(201).json({
                message: 'Registration successful. Please check your email for the verification code.',
                requiresVerification: true,
                userId: user._id,
                email: user.email
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Change current user password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        // Validate new password
        const passwordVal = await validatePassword(newPassword, [user.name, user.email]);
        if (!passwordVal.isValid) {
            return res.status(400).json({
                message: 'New password does not meet security requirements',
                errors: passwordVal.complexity.errors
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.passwordChangedAt = new Date();

        // Reset expiry
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);
        user.passwordExpiresAt = passwordExpiresAt;
        user.mustChangePassword = false;

        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'password_change',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'medium'
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Verify email address
// @route   GET /api/auth/verify-email/:token
// @access  Public
export const verifyEmail = async (req, res) => {
    try {
        console.log(`[VerifyEmail] Attempting to verify token: ${req.params.token.substring(0, 10)}...`);

        const verificationTokenHash = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        console.log(`[VerifyEmail] Token hash: ${verificationTokenHash.substring(0, 20)}...`);

        // First, try to find user by token only (to check if token exists but is expired)
        const userByToken = await User.findOne({
            emailVerificationToken: verificationTokenHash
        });

        if (!userByToken) {
            console.log(`[VerifyEmail] No user found with this token hash`);
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        // Check if token is expired
        if (userByToken.emailVerificationExpires && userByToken.emailVerificationExpires < new Date()) {
            console.log(`[VerifyEmail] Token expired. Expired at: ${userByToken.emailVerificationExpires}`);
            return res.status(400).json({ message: 'Verification link has expired. Please request a new one.' });
        }

        // Token is valid and not expired
        userByToken.isEmailVerified = true;
        userByToken.emailVerificationToken = undefined;
        userByToken.emailVerificationExpires = undefined;
        await userByToken.save();
        console.log(`[VerifyEmail] User verified successfully: ${userByToken._id}`);

        await AuditLog.create({
            userId: userByToken._id,
            action: 'email_verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });

        res.json({ message: 'Email verified successfully. You can now login.' });
    } catch (error) {
        console.error('Verify Email Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Return success even if user not found to prevent enumeration
            return res.json({ message: 'If an account matches that email, a password reset link has been sent.' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour (as per plan)
        await user.save();

        const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/reset-password/${resetToken}`;

        try {
            await sendEmail(user.email, 'passwordReset', {
                resetUrl
            });
        } catch (err) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save();
            return res.status(500).json({ message: 'Email could not be sent' });
        }

        res.json({ message: 'If an account matches that email, a password reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            passwordResetToken: resetTokenHash,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        // Validate new password
        const passwordVal = await validatePassword(password, [user.name, user.email]);
        if (!passwordVal.isValid) {
            return res.status(400).json({
                message: 'Password does not meet security requirements',
                errors: passwordVal.complexity.errors
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.passwordChangedAt = new Date();
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        await AuditLog.create({
            userId: user._id,
            action: 'password_reset_complete',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });

        res.json({ message: 'Password reset successful. You can now login.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Verify OTP for email verification
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Hash the provided OTP
        const otpHash = crypto
            .createHash('sha256')
            .update(otp.toString())
            .digest('hex');

        // Find user with matching email, OTP, and non-expired OTP
        const user = await User.findOne({
            email: email.toLowerCase(),
            emailVerificationOTP: otpHash,
            emailVerificationOTPExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Mark email as verified and clear OTP
        user.isEmailVerified = true;
        user.emailVerificationOTP = undefined;
        user.emailVerificationOTPExpires = undefined;
        await user.save();

        console.log(`[VerifyOTP] User verified successfully: ${user._id}`);

        await AuditLog.create({
            userId: user._id,
            action: 'email_verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });

        // Create session
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
        if (user.activeSessions.length > 5) user.activeSessions.shift();
        await user.save();

        // Send token response to log user in
        sendTokenResponse(user, 200, res, session.sessionId);
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Resend OTP for email verification
// @route   POST /api/auth/resend-otp
// @access  Public
export const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Find unverified user
        const user = await User.findOne({
            email: email.toLowerCase(),
            isEmailVerified: false
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found or already verified' });
        }

        // Generate new 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = crypto
            .createHash('sha256')
            .update(otp)
            .digest('hex');

        // Update user with new OTP
        user.emailVerificationOTP = otpHash;
        user.emailVerificationOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        // Send OTP email
        try {
            await sendEmail(user.email, 'otpVerification', {
                code: otp,
                name: user.name
            });
        } catch (err) {
            console.error('OTP email send failed:', err);
            return res.status(500).json({ message: 'Failed to send OTP email' });
        }

        res.json({ message: 'OTP sent successfully. Please check your email.' });
    } catch (error) {
        console.error('Resend OTP Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
export const resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Return success even if user not found to prevent enumeration
            return res.json({ message: 'If an account matches that email, a verification link has been sent.' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'Email is already verified. You can login now.' });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenHash = crypto
            .createHash('sha256')
            .update(verificationToken)
            .digest('hex');

        user.emailVerificationToken = verificationTokenHash;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await user.save();

        // Send verification email
        const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/verify-email/${verificationToken}`;

        try {
            await sendEmail(user.email, 'emailVerification', {
                verifyUrl
            });
        } catch (err) {
            console.error('Email send failed:', err);
        }

        res.json({ message: 'If an account matches that email, a verification link has been sent.' });
    } catch (error) {
        console.error('Resend Verification Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
