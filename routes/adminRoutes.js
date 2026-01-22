import express from 'express';
import {
    getDashboardStats,
    // New simplified endpoints
    sendQuote,
    assignWorkers,
    moveToReview,
    deliverTask,
    completeTask,
    rejectTask,
    verifyPayment,
    updateProgress,
    // Legacy endpoints (kept for backwards compatibility)
    assignTaskToDeveloper,
    assignTaskToMultipleDevelopers,
    initializeTask,
    assignDevelopersToTask,
    releaseToClient,
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================================
// NEW SIMPLIFIED WORKFLOW ROUTES
// ============================================

// Dashboard
router.get('/stats', protect, authorize('admin'), getDashboardStats);

// Quote: pending → quoted
router.put('/tasks/:taskId/quote', protect, authorize('admin'), sendQuote);

// Assign workers: accepted → working
router.put('/tasks/:taskId/assign-workers', protect, authorize('admin'), assignWorkers);

// Move to review: working → review
router.put('/tasks/:taskId/review', protect, authorize('admin'), moveToReview);

// Deliver: review → delivered
router.put('/tasks/:taskId/deliver', protect, authorize('admin'), deliverTask);

// Complete: delivered → completed
router.put('/tasks/:taskId/complete', protect, authorize('admin'), completeTask);

// Reject: pending → rejected
router.put('/tasks/:taskId/reject', protect, authorize('admin'), rejectTask);

// Update progress
router.put('/tasks/:taskId/progress', protect, authorize('admin'), updateProgress);

// Payment verification
router.put('/tasks/:taskId/verify-payment', protect, authorize('admin'), verifyPayment);

// Fix draft quotes (one-time fix for quotes created before status fix)
router.put('/fix-draft-quotes', protect, authorize('admin'), async (req, res) => {
    try {
        const Quote = (await import('../models/Quote.js')).default;
        const result = await Quote.updateMany(
            { status: 'draft' },
            { $set: { status: 'sent' } }
        );
        res.json({ message: `Fixed ${result.modifiedCount} draft quotes`, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fix quotes', error: error.message });
    }
});

// ============================================
// LEGACY ROUTES (kept for backwards compatibility)
// ============================================

// Task assignment (legacy)
router.put('/tasks/:taskId/assign', protect, authorize('admin'), assignTaskToDeveloper);
router.put('/tasks/:taskId/assign-multiple', protect, authorize('admin'), assignTaskToMultipleDevelopers);
router.put('/tasks/:taskId/assign-developers', protect, authorize('admin'), assignDevelopersToTask);

// Task workflow (legacy)
router.put('/tasks/:taskId/initialize', protect, authorize('admin'), initializeTask);
router.put('/tasks/:taskId/release-to-client', protect, authorize('admin'), releaseToClient);

export default router;
