import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
    generateContract,
    getContracts,
    getContractById,
    getMyContracts,
    signContract,
    updateContract,
    requestAmendment,
    respondToAmendment,
    terminateContract,
    completeContract,
    getContractStats,
} from '../controllers/contractController.js';

const router = express.Router();

// Stats (admin only)
router.get('/stats', protect, authorize('admin'), getContractStats);

// Client routes
router.get('/my-contracts', protect, getMyContracts);

// Admin routes
router.post('/generate', protect, authorize('admin'), generateContract);
router.get('/', protect, authorize('admin'), getContracts);

// Shared routes (with access control in controller)
router.get('/:id', protect, getContractById);
router.put('/:id', protect, authorize('admin'), updateContract);

// Client signing
router.post('/:id/sign', protect, signContract);

// Amendments
router.post('/:id/amendment', protect, requestAmendment);
router.put('/:id/amendment/:amendmentId', protect, authorize('admin'), respondToAmendment);

// Contract lifecycle (admin only)
router.post('/:id/terminate', protect, authorize('admin'), terminateContract);
router.post('/:id/complete', protect, authorize('admin'), completeContract);

export default router;
