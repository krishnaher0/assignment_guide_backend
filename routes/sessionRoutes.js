import express from 'express';
import {
    getActiveSessions,
    revokeSession,
    revokeAllOtherSessions,
    revokeAllSessions,
    getLoginHistory
} from '../controllers/sessionController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getActiveSessions);
router.get('/history', getLoginHistory);
router.delete('/logout-others', revokeAllOtherSessions);
router.delete('/logout-all', revokeAllSessions);
router.delete('/:id', revokeSession);

export default router;
