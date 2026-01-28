import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import geoip from 'geoip-lite';

/**
 * Check if account is locked due to failed login attempts
 */
export const checkAccountLockout = async (req, res, next) => {
    try {
        const { email, userId } = req.body;

        if (!email && !userId) {
            return next();
        }

        const query = email ? { email: email.toLowerCase() } : { _id: userId };
        const user = await User.findOne(query);

        if (!user) {
            // Don't reveal if account exists
            return next();
        }

        // Check if account is locked
        if (user.loginAttempts && user.loginAttempts.lockedUntil) {
            const now = new Date();
            const lockedUntil = new Date(user.loginAttempts.lockedUntil);

            if (now < lockedUntil) {
                const minutesRemaining = Math.ceil((lockedUntil - now) / (1000 * 60));

                return res.status(423).json({
                    message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minutes.`,
                    lockedUntil: user.loginAttempts.lockedUntil,
                });
            } else {
                // Lock period has expired, reset attempts
                user.loginAttempts.count = 0;
                user.loginAttempts.lockedUntil = null;
                await user.save();
            }
        }

        // Attach user to request for next middleware
        req.userForLockout = user;
        next();
    } catch (error) {
        console.error('Account lockout check error:', error);
        next();
    }
};

/**
 * Track failed login attempts and implement progressive delays
 */
export const trackLoginAttempt = async (req, res, loginSuccess, userId = null) => {
    try {
        const { email } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent') || 'Unknown';

        // Get geolocation from IP
        const geo = geoip.lookup(ipAddress);
        const location = geo
            ? {
                city: geo.city,
                country: geo.country,
                coordinates: {
                    latitude: geo.ll[0],
                    longitude: geo.ll[1],
                },
            }
            : null;

        if (loginSuccess) {
            // Reset IP-based failures on success
            resetIPFailures(ipAddress);

            // Reset login attempts on successful login
            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    user.loginAttempts = {
                        count: 0,
                        lastAttempt: null,
                        lockedUntil: null,
                    };
                    await user.save();

                    // Log successful login
                    await AuditLog.create({
                        userId: user._id,
                        action: 'login',
                        ipAddress,
                        userAgent,
                        location,
                        status: 'success',
                        details: {
                            email,
                        },
                    });
                }
            }
        } else {
            // Increment failed login attempts
            const user = req.userForLockout || (await User.findOne({ email: email.toLowerCase() }));

            // Track IP-based failures (even for non-existent users)
            trackIPFailures(ipAddress);

            if (user) {
                const maxAttempts = 5;
                const lockoutDuration = 5 * 60 * 1000; // 5 minutes (user requirement)

                if (!user.loginAttempts) {
                    user.loginAttempts = { count: 0 };
                }

                user.loginAttempts.count += 1;
                user.loginAttempts.lastAttempt = new Date();

                // Lock account after max attempts
                if (user.loginAttempts.count >= maxAttempts) {
                    user.loginAttempts.lockedUntil = new Date(Date.now() + lockoutDuration);

                    // Log account lockout
                    await AuditLog.create({
                        userId: user._id,
                        action: 'account_locked',
                        ipAddress,
                        userAgent,
                        location,
                        status: 'warning',
                        severity: 'high',
                        details: {
                            reason: 'Multiple failed login attempts',
                            attemptCount: user.loginAttempts.count,
                        },
                    });
                }

                await user.save();

                // Log failed login attempt
                await AuditLog.create({
                    userId: user._id,
                    action: 'login_failed',
                    ipAddress,
                    userAgent,
                    location,
                    status: 'failure',
                    severity: user.loginAttempts.count >= maxAttempts - 1 ? 'high' : 'medium',
                    details: {
                        email,
                        attemptCount: user.loginAttempts.count,
                    },
                });

                // Progressive delay based on attempt count
                const delay = Math.min(Math.pow(2, user.loginAttempts.count) * 1000, 16000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    } catch (error) {
        console.error('Login attempt tracking error:', error);
    }
};

/**
 * IP-based blocking for excessive failures
 * Stores in memory (could use Redis in production)
 */
const ipBlockList = new Map();

export const checkIPBlock = (req, res, next) => {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const blockData = ipBlockList.get(ipAddress);

    if (blockData) {
        const now = new Date();
        if (now < blockData.blockedUntil) {
            const minutesRemaining = Math.ceil((blockData.blockedUntil - now) / (1000 * 60));
            return res.status(429).json({
                message: `This IP address has been temporarily blocked due to multiple failed login attempts. Please try again in ${minutesRemaining} minutes.`,
            });
        } else {
            // Block expired
            ipBlockList.delete(ipAddress);
        }
    }

    next();
};

export const resetIPFailures = (ipAddress) => {
    ipBlockList.delete(ipAddress);
};

export const trackIPFailures = (ipAddress) => {
    const maxFailures = 5; // User requirement
    const blockDuration = 10 * 60 * 1000; // 10 minutes (user requirement)

    const current = ipBlockList.get(ipAddress) || { failureCount: 0, blockedUntil: null };
    current.failureCount += 1;
    current.lastAttempt = new Date();

    if (current.failureCount >= maxFailures) {
        current.blockedUntil = new Date(Date.now() + blockDuration);
    }

    ipBlockList.set(ipAddress, current);
};
