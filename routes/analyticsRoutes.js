import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
    getDashboardAnalytics,
    getRevenueAnalytics,
    getClientAnalytics,
    getProjectAnalytics,
} from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/dashboard', protect, authorize('admin'), getDashboardAnalytics);
router.get('/revenue', protect, authorize('admin'), getRevenueAnalytics);
router.get('/clients', protect, authorize('admin'), getClientAnalytics);
router.get('/projects', protect, authorize('admin'), getProjectAnalytics);

export default router;
