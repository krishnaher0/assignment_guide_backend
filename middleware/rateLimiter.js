import rateLimit from 'express-rate-limit';

/**
 * Login rate limiter
 * 5 attempts per 15 minutes per IP
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 5 requests per windowMs
    message: {
        message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
});

/**
 * Registration rate limiter
 * 3 registrations per hour per IP
 */
export const registerLimiter = rateLimit({
    windowMs: 60 * 1, // 1 hour
    max: 3,
    message: {
        message: 'Too many accounts created from this IP. Please try again after an hour.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Password reset request limiter
 * 3 requests per hour per IP
 */
export const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        message: 'Too many password reset requests. Please try again after an hour.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        message: 'Too many requests from this IP. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * MFA verification limiter
 * 10 attempts per 15 minutes
 */
export const mfaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: {
        message: 'Too many MFA verification attempts. Please try again after 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
