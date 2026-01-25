import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendToUser, sendToRole } from '../config/socket.js';

// Create a notification and emit via socket
export const createNotification = async (recipientId, type, title, message, relatedId, relatedModel, actionUrl, metadata = {}) => {
  try {
    const notification = new Notification({
      recipient: recipientId,
      type,
      title,
      message,
      relatedId,
      relatedModel,
      actionUrl,
      metadata,
      isRead: false,
      priority: getPriorityByType(type)
    });

    await notification.save();

    // Emit real-time notification via Socket.io
    try {
      sendToUser(recipientId.toString(), 'notification', {
        notification: notification.toObject(),
        type: 'new'
      });
    } catch (socketError) {
      console.error('Socket emit error:', socketError);
      // Don't throw - notification was saved successfully
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Notify a specific client (convenience wrapper)
export const notifyClient = async (clientId, type, title, message, relatedId, actionUrl, metadata = {}) => {
  if (!clientId) return null;
  try {
    return await createNotification(
      clientId,
      type,
      title,
      message,
      relatedId,
      'Order',
      actionUrl,
      metadata
    );
  } catch (error) {
    console.error('Error notifying client:', error.message);
    return null; // Non-blocking
  }
};

// Create notification for all admins
export const notifyAllAdmins = async (type, title, message, relatedId, relatedModel, actionUrl, metadata = {}) => {
  try {
    const admins = await User.find({ role: 'admin' });
    const notifications = [];

    for (const admin of admins) {
      const notification = await createNotification(
        admin._id,
        type,
        title,
        message,
        relatedId,
        relatedModel,
        actionUrl,
        metadata
      );
      notifications.push(notification);
    }

    return notifications;
  } catch (error) {
    console.error('Error notifying admins:', error);
    throw error;
  }
};

// Get priority based on notification type
function getPriorityByType(type) {
  const highPriorityTypes = [
    'payment_due',
    'task_urgent',
    'system_alert',
    'contract_ready',        // High priority - needs client action
    'contract_signed',       // High priority - admin needs to know
    'amendment_requested',   // High priority - needs admin review
  ];
  const mediumPriorityTypes = [
    'task_assigned',
    'rate_negotiation',
    'developer_approved',
    'contract_viewed',       // Medium - informational for admin
    'contract_active',       // Medium - status update
    'contract_completed',    // Medium - status update
    'amendment_response',    // Medium - client info
  ];

  if (highPriorityTypes.includes(type)) return 'high';
  if (mediumPriorityTypes.includes(type)) return 'medium';
  return 'low';
}

// Get all notifications for a user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, skip = 0, unreadOnly = false } = req.query;

    let filter = { recipient: userId };
    if (unreadOnly === 'true') {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Notification.countDocuments(filter);

    res.json({
      notifications,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ message: 'Failed to get notifications', error: error.message });
  }
};

// Get unread notification count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Failed to get unread count', error: error.message });
  }
};

// Mark a notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read', error: error.message });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    res.json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read', error: error.message });
  }
};

// Delete a notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification', error: error.message });
  }
};

// Clear all notifications
export const clearAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.deleteMany({ recipient: userId });

    res.json({
      message: 'All notifications cleared',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ message: 'Failed to clear notifications', error: error.message });
  }
};

// Get notifications by type
export const getNotificationsByType = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, limit = 20, skip = 0 } = req.query;

    if (!type) {
      return res.status(400).json({ message: 'Notification type is required' });
    }

    const notifications = await Notification.find({
      recipient: userId,
      type
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Notification.countDocuments({
      recipient: userId,
      type
    });

    res.json({
      notifications,
      total,
      type,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error getting notifications by type:', error);
    res.status(500).json({ message: 'Failed to get notifications by type', error: error.message });
  }
};

// Get notifications by priority
export const getNotificationsByPriority = async (req, res) => {
  try {
    const userId = req.user.id;
    const { priority, limit = 20, skip = 0 } = req.query;

    if (!priority) {
      return res.status(400).json({ message: 'Priority is required (high, medium, low)' });
    }

    const notifications = await Notification.find({
      recipient: userId,
      priority
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Notification.countDocuments({
      recipient: userId,
      priority
    });

    res.json({
      notifications,
      total,
      priority,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error getting notifications by priority:', error);
    res.status(500).json({ message: 'Failed to get notifications by priority', error: error.message });
  }
};

// Get notification statistics
export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const mongoose = await import('mongoose');

    const stats = {
      total: await Notification.countDocuments({ recipient: userId }),
      unread: await Notification.countDocuments({ recipient: userId, isRead: false }),
      byType: {},
      byPriority: {}
    };

    // Count by type
    const typeAggregation = await Notification.aggregate([
      { $match: { recipient: new mongoose.default.Types.ObjectId(userId) } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    typeAggregation.forEach(item => {
      stats.byType[item._id] = item.count;
    });

    // Count by priority
    const priorityAggregation = await Notification.aggregate([
      { $match: { recipient: new mongoose.default.Types.ObjectId(userId) } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    priorityAggregation.forEach(item => {
      stats.byPriority[item._id] = item.count;
    });

    res.json(stats);
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({ message: 'Failed to get notification stats', error: error.message });
  }
};


