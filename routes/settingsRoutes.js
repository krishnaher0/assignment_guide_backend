import express from 'express';
import {
    getQRCodeSettings,
    updateQRCodeSettings,
    uploadQRCode,
    getAllSettings,
    updateSetting
} from '../controllers/settingsController.js';
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

// Public route - get QR code for payment
router.get('/qr-code', getQRCodeSettings);

// Admin routes
router.put('/qr-code', protect, authorize('admin'), updateQRCodeSettings);
router.post('/qr-code/upload', protect, authorize('admin'), upload.single('file'), uploadQRCode);
router.get('/', protect, authorize('admin'), getAllSettings);
router.put('/:key', protect, authorize('admin'), updateSetting);

export default router;
