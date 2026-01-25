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

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.put('/reset-password/:token', resetPassword);

export default router;

