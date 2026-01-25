import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  getNotificationsByType,
  getNotificationsByPriority,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all notifications
router.get('/', getNotifications);

// Get unread count
router.get('/unread-count', getUnreadCount);

// Get notifications by type
router.get('/by-type', getNotificationsByType);

// Get notifications by priority
router.get('/by-priority', getNotificationsByPriority);

// Get notification statistics
router.get('/stats', getNotificationStats);

// Mark notification as read
router.put('/:notificationId/read', markAsRead);

// Mark all as read
router.put('/mark-all/read', markAllAsRead);

// Delete a notification
router.delete('/:notificationId', deleteNotification);

// Clear all notifications
router.delete('/', clearAllNotifications);

export default router;
