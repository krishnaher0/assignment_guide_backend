import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
    createInvoice,
    getInvoices,
    getMyInvoices,
    getInvoiceById,
    sendInvoice,
    markInvoicePaid,
    updateInvoice,
    deleteInvoice,
    getInvoiceStats,
} from '../controllers/invoiceController.js';

const router = express.Router();

// Admin routes
router.post('/', protect, authorize('admin'), createInvoice);
router.get('/', protect, authorize('admin'), getInvoices);
router.get('/stats', protect, authorize('admin'), getInvoiceStats);
router.post('/:id/send', protect, authorize('admin'), sendInvoice);
router.post('/:id/mark-paid', protect, authorize('admin'), markInvoicePaid);
router.put('/:id', protect, authorize('admin'), updateInvoice);
router.delete('/:id', protect, authorize('admin'), deleteInvoice);

// Client routes
router.get('/my-invoices', protect, getMyInvoices);

// Shared routes
router.get('/:id', protect, getInvoiceById);

export default router;
