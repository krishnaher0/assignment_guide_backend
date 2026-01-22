import express from 'express';
import {
    getDeveloperStats,
    getDeveloperTasks,
    getProfile,
    updateProfile,
    updateStatus,
    updateTaskProgress,
    updateTaskStatus,
    releaseTask,
    getTaskReleaseStatus,
    uploadDeliverables
} from '../controllers/developerController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Dashboard
router.get('/stats', protect, authorize('developer', 'admin'), getDeveloperStats);
router.get('/tasks', protect, authorize('developer', 'admin'), getDeveloperTasks);

// Profile
router.get('/profile', protect, authorize('developer'), getProfile);
router.put('/profile', protect, authorize('developer'), updateProfile);
router.put('/status', protect, authorize('developer'), updateStatus);

// Task management
router.put('/tasks/:taskId/progress', protect, authorize('developer'), updateTaskProgress);
router.put('/tasks/:taskId/status', protect, authorize('developer'), updateTaskStatus);

// Task release (completion acknowledgment)
router.put('/tasks/:taskId/release', protect, authorize('developer'), releaseTask);
router.get('/tasks/:taskId/release-status', protect, authorize('developer'), getTaskReleaseStatus);

// Deliverables upload
router.post('/tasks/:taskId/deliverables', protect, authorize('developer'), uploadDeliverables);

export default router;
