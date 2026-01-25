import express from 'express';
import {
    getOrders,
    updateOrder,
    createOrder,
    getCustomerOrders,
    getOrderById,
    createPublicOrder,
    acceptQuote,
    declineQuote,
    requestRevision,
    uploadPaymentProof,
    // Subtask endpoints
    addSubtask,
    updateSubtask,
    deleteSubtask,
    // Blocker endpoints
    addBlocker,
    updateBlocker,
    resolveBlocker,
    deleteBlocker,
} from '../controllers/orderController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Guest submissions (no auth required)
router.post('/public', createPublicOrder);

// ============================================
// CLIENT ROUTES
// ============================================

// Create new order
router.post('/', protect, authorize('client'), createOrder);

// Get my orders
router.get('/customer/my-orders', protect, authorize('client'), getCustomerOrders);

// Quote response (accept/decline)
router.post('/:id/accept-quote', protect, authorize('client'), acceptQuote);
router.post('/:id/decline-quote', protect, authorize('client'), declineQuote);

// Request revision on delivered assignment
router.post('/:id/revision', protect, authorize('client'), requestRevision);

// Upload payment proof
router.post('/:id/payment-proof', protect, authorize('client'), uploadPaymentProof);

// ============================================
// ADMIN ROUTES
// ============================================

// Get all orders
router.get('/', protect, authorize('admin'), getOrders);

// Update order
router.put('/:id', protect, authorize('admin'), updateOrder);

// ============================================
// SHARED ROUTES
// ============================================

// Get single order (both client and admin can view)
router.get('/:id', protect, getOrderById);

// ============================================
// SUBTASK ROUTES (Admin & Developers)
// ============================================

// Add subtask
router.post('/:id/subtasks', protect, authorize('admin', 'developer'), addSubtask);

// Update subtask
router.put('/:id/subtasks/:subtaskId', protect, authorize('admin', 'developer'), updateSubtask);

// Delete subtask
router.delete('/:id/subtasks/:subtaskId', protect, authorize('admin', 'developer'), deleteSubtask);

// ============================================
// BLOCKER ROUTES (Admin & Developers)
// ============================================

// Report blocker
router.post('/:id/blockers', protect, authorize('admin', 'developer'), addBlocker);

// Update blocker
router.put('/:id/blockers/:blockerId', protect, authorize('admin', 'developer'), updateBlocker);

// Resolve blocker (Admin only - but controller handles this)
router.post('/:id/blockers/:blockerId/resolve', protect, authorize('admin'), resolveBlocker);

// Delete blocker (Admin only)
router.delete('/:id/blockers/:blockerId', protect, authorize('admin'), deleteBlocker);

export default router;
