import express from 'express';
import {
    initiatePayment,
    verifyPayment,
    getPaymentStatus,
    submitQRPayment,
    rejectQRPayment,
    uploadPaymentProof,
    generateReceipt
} from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// eSewa payment
router.post('/initiate', protect, initiatePayment);
router.post('/verify', protect, verifyPayment);

// QR payment (fallback)
router.post('/qr-submit', protect, submitQRPayment);
router.put('/:orderId/reject-qr', protect, authorize('admin'), rejectQRPayment);

// Payment proof upload
router.post('/upload-proof', protect, upload.single('file'), uploadPaymentProof);

// Receipt generation
router.post('/generate-receipt', protect, generateReceipt);

// Payment history (returns orders with payment info)
router.get('/history', protect, async (req, res) => {
    try {
        const Order = (await import('../models/Order.js')).default;
        const orders = await Order.find({
            client: req.user._id,
            paymentStatus: { $in: ['paid', 'pending_verification'] }
        }).select('title paymentStatus paidAmount quotedAmount paidAt transactionId paymentMethod').sort({ paidAt: -1 });
        res.json(orders);
    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({ message: 'Failed to fetch payment history' });
    }
});

// Status
router.get('/:orderId', protect, getPaymentStatus);

export default router;
