import express from 'express';
import {
    getTeamDetails,
    addTeamMember,
    removeTeamMember,
    updateTeamMember,
    changeLeadDeveloper,
    updateMyProgress,
    assignModule,
    submitTeamRequest,
    respondToTeamRequest
} from '../controllers/teamController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get team details (Developer or Admin)
router.get('/:taskId', protect, getTeamDetails);

// Admin only routes
router.post('/:taskId/add', protect, authorize('admin'), addTeamMember);
router.delete('/:taskId/remove/:developerId', protect, authorize('admin'), removeTeamMember);
router.put('/:taskId/change-lead', protect, authorize('admin'), changeLeadDeveloper);
router.put('/:taskId/request/:requestId', protect, authorize('admin'), respondToTeamRequest);

// Lead or Admin routes
router.put('/:taskId/member/:developerId', protect, authorize('developer', 'admin'), updateTeamMember);

// Developer routes
router.put('/:taskId/my-progress', protect, authorize('developer'), updateMyProgress);
router.post('/:taskId/assign-module', protect, authorize('developer'), assignModule);
router.post('/:taskId/request', protect, authorize('developer'), submitTeamRequest);

export default router;
