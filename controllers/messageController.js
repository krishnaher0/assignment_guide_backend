import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// ==================== CONVERSATIONS ====================

// @desc    Get all conversations for current user
// @route   GET /api/messages/conversations
// @access  Private
export const getConversations = async (req, res) => {
    try {
        const conversations = await Conversation.find({
            'participants.user': req.user._id,
            isArchived: false,
        })
            .populate('participants.user', 'name email profileImage role')
            .populate('lastMessage.sender', 'name')
            .populate('createdBy', 'name')
            .sort({ 'lastMessage.timestamp': -1, updatedAt: -1 });

        // Add unread count for each conversation
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await conv.getUnreadCount(req.user._id);
                return {
                    ...conv.toObject(),
                    unreadCount,
                };
            })
        );

        res.json(conversationsWithUnread);
    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get or create direct conversation
// @route   POST /api/messages/conversations/direct
// @access  Private
export const getOrCreateDirectConversation = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        if (userId === req.user._id.toString()) {
            return res.status(400).json({ message: 'Cannot create conversation with yourself' });
        }

        const otherUser = await User.findById(userId);
        if (!otherUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // === MESSAGING RESTRICTIONS ===
        // Clients can ONLY message admins (not workers)
        // Workers can message admins and other workers
        // Admins can message anyone

        const currentUserRole = req.user.role;
        const otherUserRole = otherUser.role;

        // Client trying to message a worker/developer - BLOCKED
        if (currentUserRole === 'client' && ['worker', 'developer'].includes(otherUserRole)) {
            return res.status(403).json({
                message: 'You can only message our support team. Workers are not directly contactable.',
                code: 'CLIENT_WORKER_RESTRICTED'
            });
        }

        // Worker trying to message a client - BLOCKED
        if (['worker', 'developer'].includes(currentUserRole) && otherUserRole === 'client') {
            return res.status(403).json({
                message: 'Workers cannot directly message clients. Please contact admin.',
                code: 'WORKER_CLIENT_RESTRICTED'
            });
        }

        const conversation = await Conversation.findOrCreateDirect(req.user._id, userId);

        res.json(conversation);
    } catch (error) {
        console.error('Create Direct Conversation Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Create group conversation
// @route   POST /api/messages/conversations/group
// @access  Private
export const createGroupConversation = async (req, res) => {
    try {
        const { name, description, participantIds } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Group name is required' });
        }

        // Build participants array with creator as admin
        const participants = [
            { user: new mongoose.Types.ObjectId(req.user._id), role: 'admin' },
        ];

        // Add other participants
        if (participantIds && participantIds.length > 0) {
            for (const id of participantIds) {
                if (id !== req.user._id.toString()) {
                    participants.push({ user: new mongoose.Types.ObjectId(id), role: 'member' });
                }
            }
        }

        // Use new + save instead of create to avoid casting issues
        const conversation = new Conversation({
            type: 'group',
            name: name.trim(),
            description: description?.trim(),
            participants: participants,
            createdBy: new mongoose.Types.ObjectId(req.user._id),
            lastMessage: {
                content: `${req.user.name} created the group`,
                sender: new mongoose.Types.ObjectId(req.user._id),
                timestamp: new Date(),
                type: 'system',
            },
        });
        await conversation.save();

        // Create system message
        await Message.create({
            conversation: conversation._id,
            sender: req.user._id,
            content: `${req.user.name} created the group "${name}"`,
            type: 'system',
        });

        const populated = await Conversation.findById(conversation._id)
            .populate('participants.user', 'name email profileImage role')
            .populate('createdBy', 'name');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Create Group Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get single conversation
// @route   GET /api/messages/conversations/:id
// @access  Private
export const getConversation = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants.user', 'name email profileImage role')
            .populate('createdBy', 'name')
            .populate('relatedOrder', 'title');

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if user is participant
        const isParticipant = conversation.participants.some(
            p => p.user._id.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const unreadCount = await conversation.getUnreadCount(req.user._id);

        res.json({ ...conversation.toObject(), unreadCount });
    } catch (error) {
        console.error('Get Conversation Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update group conversation
// @route   PUT /api/messages/conversations/:id
// @access  Private (Group Admin)
export const updateConversation = async (req, res) => {
    try {
        const { name, description, settings } = req.body;

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        if (conversation.type !== 'group') {
            return res.status(400).json({ message: 'Cannot update direct conversations' });
        }

        // Check if user is group admin
        const participant = conversation.participants.find(
            p => p.user.toString() === req.user._id.toString()
        );

        if (!participant || (participant.role !== 'admin' && req.user.role !== 'admin')) {
            return res.status(403).json({ message: 'Only group admins can update settings' });
        }

        if (name) conversation.name = name.trim();
        if (description !== undefined) conversation.description = description.trim();
        if (settings) conversation.settings = { ...conversation.settings, ...settings };

        await conversation.save();

        const updated = await Conversation.findById(conversation._id)
            .populate('participants.user', 'name email profileImage role');

        res.json(updated);
    } catch (error) {
        console.error('Update Conversation Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Add member to group
// @route   POST /api/messages/conversations/:id/members
// @access  Private
export const addGroupMember = async (req, res) => {
    try {
        const { userId } = req.body;

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ message: 'Group not found' });
        }

        // Check permissions
        const participant = conversation.participants.find(
            p => p.user.toString() === req.user._id.toString()
        );

        if (conversation.settings.onlyAdminsCanAddMembers && participant?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can add members' });
        }

        // Check if already a member
        const isAlreadyMember = conversation.participants.some(
            p => p.user.toString() === userId
        );

        if (isAlreadyMember) {
            return res.status(400).json({ message: 'User is already a member' });
        }

        const newMember = await User.findById(userId);
        if (!newMember) {
            return res.status(404).json({ message: 'User not found' });
        }

        conversation.participants.push({ user: userId, role: 'member' });
        await conversation.save();

        // Create system message
        await Message.create({
            conversation: conversation._id,
            sender: req.user._id,
            content: `${req.user.name} added ${newMember.name} to the group`,
            type: 'system',
        });

        const updated = await Conversation.findById(conversation._id)
            .populate('participants.user', 'name email profileImage role');

        res.json(updated);
    } catch (error) {
        console.error('Add Member Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Remove member from group
// @route   DELETE /api/messages/conversations/:id/members/:userId
// @access  Private (Group Admin)
export const removeGroupMember = async (req, res) => {
    try {
        const { userId } = req.params;

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ message: 'Group not found' });
        }

        // Check if user is admin
        const participant = conversation.participants.find(
            p => p.user.toString() === req.user._id.toString()
        );

        const isLeavingSelf = userId === req.user._id.toString();

        if (!isLeavingSelf && participant?.role !== 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can remove members' });
        }

        const removedMember = await User.findById(userId);

        conversation.participants = conversation.participants.filter(
            p => p.user.toString() !== userId
        );

        await conversation.save();

        // Create system message
        await Message.create({
            conversation: conversation._id,
            sender: req.user._id,
            content: isLeavingSelf
                ? `${req.user.name} left the group`
                : `${req.user.name} removed ${removedMember?.name || 'a member'} from the group`,
            type: 'system',
        });

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove Member Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark conversation as read
// @route   PUT /api/messages/conversations/:id/read
// @access  Private
export const markConversationRead = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        const participantIndex = conversation.participants.findIndex(
            p => p.user.toString() === req.user._id.toString()
        );

        if (participantIndex === -1) {
            return res.status(403).json({ message: 'Not a participant' });
        }

        conversation.participants[participantIndex].lastRead = new Date();
        await conversation.save();

        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Mark Read Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ==================== MESSAGES ====================

// @desc    Get messages in conversation
// @route   GET /api/messages/conversations/:id/messages
// @access  Private
export const getMessages = async (req, res) => {
    try {
        const { limit = 50, before } = req.query;

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if user is participant
        const isParticipant = conversation.participants.some(
            p => p.user.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const query = { conversation: req.params.id };

        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .populate('sender', 'name email profileImage role')
            .populate('replyTo', 'content sender')
            .populate('mentions', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        // Return in chronological order
        res.json({ messages: messages.reverse() });
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Send message
// @route   POST /api/messages/conversations/:id/messages
// @access  Private
export const sendMessage = async (req, res) => {
    try {
        const { content, type = 'text', attachments, codeSnippet, replyTo, mentions } = req.body;

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if user is participant
        const participant = conversation.participants.find(
            p => p.user.toString() === req.user._id.toString()
        );

        if (!participant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Check if only admins can message
        if (conversation.settings?.onlyAdminsCanMessage && participant?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can send messages' });
        }

        // Validate content
        if (!content && (!attachments || attachments.length === 0) && !codeSnippet) {
            return res.status(400).json({ message: 'Message content is required' });
        }

        const message = await Message.create({
            conversation: req.params.id,
            sender: req.user._id,
            content: content?.trim(),
            type,
            attachments: attachments || [],
            codeSnippet,
            replyTo,
            mentions: mentions || [],
        });

        const populated = await Message.findById(message._id)
            .populate('sender', 'name email profileImage role')
            .populate('replyTo', 'content sender')
            .populate('mentions', 'name');

        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            // Emit to all participants (room format is user:userId)
            conversation.participants.forEach(p => {
                io.to(`user:${p.user}`).emit('new_message', {
                    conversation: conversation._id,
                    message: populated,
                });
            });
        }

        res.status(201).json(populated);
    } catch (error) {
        console.error('Send Message Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Send message with file attachment
// @route   POST /api/messages/conversations/:id/messages/upload
// @access  Private
export const sendMessageWithAttachment = async (req, res) => {
    try {
        const { content } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const conversation = await Conversation.findById(req.params.id);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Check if user is participant
        const participant = conversation.participants.find(
            p => p.user.toString() === req.user._id.toString()
        );

        if (!participant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Build attachments array
        const attachments = files.map(file => ({
            fileName: file.originalname,
            fileUrl: `/uploads/messages/${file.filename}`,
            fileType: file.mimetype,
            fileSize: file.size,
            thumbnailUrl: file.mimetype.startsWith('image/') ? `/uploads/messages/${file.filename}` : null,
        }));

        // Determine message type based on files
        const isImage = files.every(f => f.mimetype.startsWith('image/'));
        const messageType = isImage ? 'image' : 'file';

        const message = await Message.create({
            conversation: req.params.id,
            sender: req.user._id,
            content: content?.trim() || '',
            type: messageType,
            attachments,
        });

        const populated = await Message.findById(message._id)
            .populate('sender', 'name email profileImage role');

        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            conversation.participants.forEach(p => {
                io.to(`user:${p.user}`).emit('new_message', {
                    conversation: conversation._id,
                    message: populated,
                });
            });
        }

        res.status(201).json(populated);
    } catch (error) {
        console.error('Send Message With Attachment Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Edit message
// @route   PUT /api/messages/:messageId
// @access  Private (Message Owner)
export const editMessage = async (req, res) => {
    try {
        const { content } = req.body;

        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        if (message.sender.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Can only edit your own messages' });
        }

        if (message.type !== 'text') {
            return res.status(400).json({ message: 'Can only edit text messages' });
        }

        // Store original content if first edit
        if (!message.isEdited) {
            message.originalContent = message.content;
        }

        message.content = content.trim();
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        const populated = await Message.findById(message._id)
            .populate('sender', 'name email profileImage role');

        res.json(populated);
    } catch (error) {
        console.error('Edit Message Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete message
// @route   DELETE /api/messages/:messageId
// @access  Private (Message Owner or Admin)
export const deleteMessage = async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        const isOwner = message.sender.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy = req.user._id;
        message.content = '';
        message.attachments = [];
        await message.save();

        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error('Delete Message Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    React to message
// @route   POST /api/messages/:messageId/react
// @access  Private
export const reactToMessage = async (req, res) => {
    try {
        const { emoji } = req.body;

        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Check if already reacted with same emoji
        const existingReaction = message.reactions.find(
            r => r.user.toString() === req.user._id.toString() && r.emoji === emoji
        );

        if (existingReaction) {
            // Remove reaction
            message.reactions = message.reactions.filter(
                r => !(r.user.toString() === req.user._id.toString() && r.emoji === emoji)
            );
        } else {
            // Add reaction
            message.reactions.push({ emoji, user: req.user._id });
        }

        await message.save();

        res.json({ reactions: message.reactions });
    } catch (error) {
        console.error('React Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get users for messaging (role-based filtering)
// @route   GET /api/messages/users
// @access  Private
export const getMessagingUsers = async (req, res) => {
    try {
        const currentUserRole = req.user.role;
        let roleFilter;

        // Role-based user visibility:
        // - Clients can only see admins (support team)
        // - Workers can see admins and other workers
        // - Admins can see everyone

        if (currentUserRole === 'client') {
            // Clients can only message admins
            roleFilter = ['admin'];
        } else if (['worker', 'developer'].includes(currentUserRole)) {
            // Workers can message admins and other workers
            roleFilter = ['admin', 'worker', 'developer'];
        } else {
            // Admins can message everyone
            roleFilter = ['admin', 'worker', 'developer', 'client'];
        }

        const users = await User.find({
            _id: { $ne: req.user._id },
            role: { $in: roleFilter },
            isBanned: { $ne: true },
        }).select('name email profileImage role');

        res.json(users);
    } catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
