import { validationResult } from 'express-validator';

/**
 * Middleware to handle validation results
 * If there are errors, return 400 with formatted error messages
 */
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param || err.path, // handle different express-validator versions
                message: err.msg
            }))
        });
    }
    next();
};
