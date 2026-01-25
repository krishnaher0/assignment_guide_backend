import express from 'express';
import {
    getDevelopers,
    createDeveloper,
    updateUser,
    deleteUser,
    getProfile,
    updateProfile
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// User profile routes (Self)
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

// Admin user management routes
router.get('/developers', protect, authorize('admin'), getDevelopers);
router.post('/developers', protect, authorize('admin'), createDeveloper);
router.put('/:id', protect, authorize('admin'), updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;
