import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/authMiddleware.js';
import {
    getConversations,
    getOrCreateDirectConversation,
    createGroupConversation,
    getConversation,
    updateConversation,
    addGroupMember,
    removeGroupMember,
    markConversationRead,
    getMessages,
    sendMessage,
    sendMessageWithAttachment,
    editMessage,
    deleteMessage,
    reactToMessage,
    getMessagingUsers,
} from '../controllers/messageController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/messages');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/x-rar-compressed',
            'text/plain', 'text/csv',
            'application/json',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'), false);
        }
    }
});

// Get users available for messaging
router.get('/users', protect, getMessagingUsers);

// Conversation routes
router.get('/conversations', protect, getConversations);
router.post('/conversations/direct', protect, getOrCreateDirectConversation);
router.post('/conversations/group', protect, createGroupConversation);
router.get('/conversations/:id', protect, getConversation);
router.put('/conversations/:id', protect, updateConversation);
router.put('/conversations/:id/read', protect, markConversationRead);

// Group member routes
router.post('/conversations/:id/members', protect, addGroupMember);
router.delete('/conversations/:id/members/:userId', protect, removeGroupMember);

// Message routes
router.get('/conversations/:id/messages', protect, getMessages);
router.post('/conversations/:id/messages', protect, sendMessage);
router.post('/conversations/:id/messages/upload', protect, upload.array('files', 10), sendMessageWithAttachment);

// Individual message actions
router.put('/:messageId', protect, editMessage);
router.delete('/:messageId', protect, deleteMessage);
router.post('/:messageId/react', protect, reactToMessage);

export default router;
