import express from 'express';
import {
    loginUser,
    registerUser,
    getMe,
    changePassword,
    verifyEmail,
    forgotPassword,
    resetPassword,
    verifyOTP,
    resendOTP
} from '../controllers/authController.js';
import { passwordResetLimiter } from '../middleware/rateLimiter.js';
import { protect } from '../middleware/authMiddleware.js';
import { checkAccountLockout, checkIPBlock } from '../middleware/bruteForceProtection.js';
import {
    loginValidator,
    registerValidator,
    forgotPasswordValidator,
    resetPasswordValidator
} from '../validators/authValidators.js';

const router = express.Router();

router.post('/login', checkIPBlock, loginValidator, checkAccountLockout, loginUser);
router.post('/register', registerValidator, registerUser);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', checkIPBlock, forgotPasswordValidator, passwordResetLimiter, forgotPassword);
router.put('/reset-password/:token', resetPasswordValidator, resetPassword);

export default router;

