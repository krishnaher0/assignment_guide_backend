import express from 'express';
import {
    setupMFA,
    verifyMFASetup,
    verifyMFALogin,
    disableMFA,
    regenerateBackupCodes,
    getMFAStatus
} from '../controllers/mfaController.js';
import { protect } from '../middleware/authMiddleware.js';
import { mfaLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (MFA verification during login)
router.post('/verify-login', mfaLimiter, verifyMFALogin);

// Protected routes
router.use(protect);

router.get('/status', getMFAStatus);
router.post('/setup', setupMFA);
router.post('/verify-setup', verifyMFASetup);
router.post('/disable', disableMFA);
router.post('/regenerate-codes', regenerateBackupCodes);

export default router;
