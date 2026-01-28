import { doubleCsrf } from 'csrf-csrf';

/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern with csrf-csrf library
 *
 * How it works:
 * 1. Server generates a random CSRF token
 * 2. Token is sent to client in HTTP-only cookie AND as response data
 * 3. Client must include token in request header for state-changing operations
 * 4. Server validates that cookie token matches header token
 */

const doubleCsrfOptions = {
    getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
    cookieName: process.env.NODE_ENV === 'production' ? '__Host-csrf' : 'csrf',
    cookieOptions: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    // Session identifier function - uses IP + User Agent as session identifier
    getSessionIdentifier: (req) => {
        return req.user?._id?.toString() || req.ip || 'anonymous';
    },
};

// Initialize double CSRF protection
const {
    invalidCsrfTokenError,
    generateCsrfToken,
    validateRequest,
    doubleCsrfProtection,
} = doubleCsrf(doubleCsrfOptions);

/**
 * Middleware to generate and attach CSRF token
 * Use this on routes that need to provide a token to the client
 */
export const csrfTokenGenerator = (req, res, next) => {
    try {
        const csrfToken = generateCsrfToken(req, res);
        req.csrfToken = csrfToken;
        next();
    } catch (error) {
        console.error('[CSRF] Token generation error:', error);
        console.error('[CSRF] Error details:', error.message, error.stack);
        res.status(500).json({ message: 'CSRF token generation failed', error: error.message });
    }
};

/**
 * Middleware to validate CSRF token
 * Use this on routes that need CSRF protection
 */
export const csrfProtection = doubleCsrfProtection;

/**
 * Error handler for CSRF token validation failures
 */
export const csrfErrorHandler = (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN' || err.message?.includes('invalid csrf token')) {
        console.warn('[CSRF] Invalid token attempt:', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            userId: req.user?._id
        });

        return res.status(403).json({
            message: 'Invalid CSRF token. Please refresh the page and try again.',
            code: 'CSRF_INVALID'
        });
    }
    next(err);
};

export default {
    csrfTokenGenerator,
    csrfProtection,
    csrfErrorHandler,
};
