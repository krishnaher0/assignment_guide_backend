import express from 'express';
import {
    createQuote,
    getQuotes,
    getQuoteById,
    getQuotesByOrder,
    updateQuote,
    sendQuote,
    acceptQuote,
    rejectQuote,
    requestNegotiation,
    reviseQuote,
    deleteQuote,
    getMyQuotes,
    getQuoteStats
} from '../controllers/quoteController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin routes
router.post('/', protect, authorize('admin'), createQuote);
router.get('/', protect, authorize('admin'), getQuotes);
router.get('/stats', protect, authorize('admin'), getQuoteStats);
router.put('/:id', protect, authorize('admin'), updateQuote);
router.post('/:id/send', protect, authorize('admin'), sendQuote);
router.post('/:id/revise', protect, authorize('admin'), reviseQuote);
router.delete('/:id', protect, authorize('admin'), deleteQuote);

// Client routes
router.get('/my-quotes', protect, authorize('client'), getMyQuotes);
router.post('/:id/accept', protect, authorize('client'), acceptQuote);
router.post('/:id/reject', protect, authorize('client'), rejectQuote);
router.post('/:id/negotiate', protect, authorize('client'), requestNegotiation);

// Shared routes (access controlled in controller)
router.get('/order/:orderId', protect, getQuotesByOrder);
router.get('/:id', protect, getQuoteById);

export default router;
