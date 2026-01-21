import express from 'express';
import { getDevelopers, createDeveloper, updateUser, deleteUser } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/developers', protect, authorize('admin'), getDevelopers);
router.post('/developers', protect, authorize('admin'), createDeveloper);
router.put('/:id', protect, authorize('admin'), updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;
