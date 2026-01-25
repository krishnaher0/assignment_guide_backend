import express from 'express';
import {
  createConversation,
  listConversations,
  archiveConversation,
  getUnreadCount,
  fetchMessages,
  sendMessage,
  markMessageAsRead,
  searchMessages,
  editMessage,
  deleteMessage
} from '../controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Conversation routes
router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.patch('/conversations/:conversationId/archive', archiveConversation);
router.get('/unread-count', getUnreadCount);

// Message routes
router.get('/conversations/:conversationId/messages', fetchMessages);
router.post('/conversations/:conversationId/messages', sendMessage);
router.put('/conversations/:conversationId/messages/:messageId/read', markMessageAsRead);
router.get('/conversations/:conversationId/search', searchMessages);
router.put('/conversations/:conversationId/messages/:messageId', editMessage);
router.delete('/conversations/:conversationId/messages/:messageId', deleteMessage);

export default router;
