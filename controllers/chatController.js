import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// Create a new conversation
export const createConversation = async (req, res) => {
  try {
    const { participantId, type = 'direct', relatedOrderId } = req.body;
    const userId = req.user.id;

    // Validate participants
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }

    // Check if user exists
    const participant = await User.findById(participantId);
    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    // Check if conversation already exists for direct chats
    if (type === 'direct') {
      const existingConversation = await Conversation.findOne({
        type: 'direct',
        participants: { $all: [userId, participantId] }
      });

      if (existingConversation) {
        return res.status(200).json(existingConversation);
      }
    }

    // Create new conversation
    const conversation = new Conversation({
      participants: [userId, participantId],
      type,
      relatedOrder: relatedOrderId,
      lastMessage: null,
      unreadCount: new Map([[userId, 0], [participantId, 0]])
    });

    await conversation.save();
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ message: 'Failed to create conversation', error: error.message });
  }
};

// List all conversations for a user
export const listConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, skip = 0 } = req.query;

    const conversations = await Conversation.find({
      participants: userId,
      isArchived: false
    })
      .populate('participants', 'username email avatar')
      .populate('relatedOrder', 'title status')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Conversation.countDocuments({
      participants: userId,
      isArchived: false
    });

    res.json({
      conversations,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ message: 'Failed to list conversations', error: error.message });
  }
};

// Fetch messages from a conversation
export const fetchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { limit = 30, skip = 0 } = req.query;

    // Verify user is part of conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'username email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Message.countDocuments({ conversationId });

    // Mark messages as read for this user
    await Message.updateMany(
      { conversationId, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: new Date() } } }
    );

    res.json({
      messages: messages.reverse(),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
  }
};

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, messageType = 'text', attachments = [] } = req.body;
    const userId = req.user.id;

    // Validate
    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create message
    const message = new Message({
      conversationId,
      sender: userId,
      content: content.trim(),
      messageType,
      attachments,
      readBy: [{ userId, readAt: new Date() }]
    });

    await message.save();
    await message.populate('sender', 'username email avatar');

    // Update conversation's last message
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        lastMessage: message._id,
        updatedAt: new Date()
      }
    );

    // Increment unread count for other participants
    const otherParticipants = conversation.participants.filter(id => !id.equals(userId));
    for (const participantId of otherParticipants) {
      const currentUnread = conversation.unreadCount.get(participantId.toString()) || 0;
      conversation.unreadCount.set(participantId.toString(), currentUnread + 1);
    }
    await conversation.save();

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

// Mark message as read
export const markMessageAsRead = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const userId = req.user.id;

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update message read status
    const message = await Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { readBy: { userId, readAt: new Date() } }
      },
      { new: true }
    ).populate('sender', 'username email avatar');

    // Reset unread count for this user
    conversation.unreadCount.set(userId.toString(), 0);
    await conversation.save();

    res.json(message);
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ message: 'Failed to mark message as read', error: error.message });
  }
};

// Search messages in a conversation
export const searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { query } = req.query;
    const userId = req.user.id;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({
      conversationId,
      content: { $regex: query, $options: 'i' }
    })
      .populate('sender', 'username email avatar')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ messages, query });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ message: 'Failed to search messages', error: error.message });
  }
};

// Archive a conversation
export const archiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Archive conversation
    conversation.isArchived = true;
    await conversation.save();

    res.json({ message: 'Conversation archived', conversation });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ message: 'Failed to archive conversation', error: error.message });
  }
};

// Get unread count for all conversations
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
      isArchived: false
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      const unread = conv.unreadCount.get(userId.toString()) || 0;
      totalUnread += unread;
    });

    res.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Failed to get unread count', error: error.message });
  }
};

// Edit a message
export const editMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Verify message exists and user is sender
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (!message.sender.equals(userId)) {
      return res.status(403).json({ message: 'Can only edit your own messages' });
    }

    // Update message
    message.content = content.trim();
    message.isEdited = true;
    await message.save();
    await message.populate('sender', 'username email avatar');

    res.json(message);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ message: 'Failed to edit message', error: error.message });
  }
};

// Delete a message
export const deleteMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const userId = req.user.id;

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Verify message exists and user is sender
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (!message.sender.equals(userId)) {
      return res.status(403).json({ message: 'Can only delete your own messages' });
    }

    // Mark as deleted instead of removing
    message.isDeleted = true;
    message.content = '[Message deleted]';
    await message.save();

    res.json({ message: 'Message deleted', deletedMessage: message });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Failed to delete message', error: error.message });
  }
};

