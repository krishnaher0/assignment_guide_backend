import express from 'express';
import { csrfTokenGenerator } from '../middleware/csrfProtection.js';

const router = express.Router();

/**
 * @route   GET /api/csrf-token
 * @desc    Get CSRF token for client
 * @access  Public (but token is session-specific)
 */
router.get('/csrf-token', csrfTokenGenerator, (req, res) => {
    res.json({
        csrfToken: req.csrfToken.token || req.csrfToken,
        message: 'CSRF token generated successfully'
    });
});

export default router;
