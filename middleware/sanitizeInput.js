/**
 * Custom MongoDB Input Sanitization Middleware
 * Prevents NoSQL injection attacks by removing/replacing prohibited characters
 *
 * This is a custom implementation to avoid compatibility issues with express-mongo-sanitize
 */

/**
 * Recursively sanitize an object by removing keys that start with $ or contain .
 * @param {*} obj - Object to sanitize
 * @returns {*} - Sanitized object
 */
const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized = {};
    for (const key in obj) {
        // Use Object.prototype.hasOwnProperty for objects without the method
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // Skip keys that start with $ or contain .
            if (key.startsWith('$') || key.includes('.')) {
                console.warn(`[Security] Blocked potentially malicious key: ${key}`);
                continue;
            }
            sanitized[key] = sanitizeObject(obj[key]);
        }
    }
    return sanitized;
};

/**
 * Middleware to sanitize request body, query, and params
 */
export const sanitizeInput = (req, res, next) => {
    try {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
            const sanitizedQuery = sanitizeObject(req.query);
            // Create a new query object instead of modifying the existing one
            req.sanitizedQuery = sanitizedQuery;

            // Override the query getter to return sanitized version
            Object.defineProperty(req, 'query', {
                get: function() { return this.sanitizedQuery; },
                set: function(val) { this.sanitizedQuery = sanitizeObject(val); },
                configurable: true
            });
        }

        // Sanitize URL parameters
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params);
        }

        next();
    } catch (error) {
        console.error('[Security] Error in sanitization middleware:', error);
        // Continue even if sanitization fails (fail open for availability)
        next();
    }
};

export default sanitizeInput;
