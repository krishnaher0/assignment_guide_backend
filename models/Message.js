import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
    },

    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // Message content
    content: {
        type: String,
        trim: true,
    },

    // Message type
    type: {
        type: String,
        enum: ['text', 'file', 'image', 'system', 'code'],
        default: 'text',
    },

    // File attachments
    attachments: [{
        fileName: String,
        fileUrl: String,
        fileType: String, // mime type
        fileSize: Number, // in bytes
        thumbnailUrl: String, // for images
    }],

    // Code snippet (for code type)
    codeSnippet: {
        language: String,
        code: String,
    },

    // Reply to another message
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },

    // Reactions
    reactions: [{
        emoji: String,
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    }],

    // Read by (for group chats)
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        readAt: {
            type: Date,
            default: Date.now,
        },
    }],

    // Edit history
    isEdited: {
        type: Boolean,
        default: false,
    },
    editedAt: Date,
    originalContent: String,

    // Deleted status (soft delete)
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: Date,
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Pinned in conversation
    isPinned: {
        type: Boolean,
        default: false,
    },

    // Mentions
    mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],

}, {
    timestamps: true,
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ 'mentions': 1 });

// Update conversation's lastMessage after saving
messageSchema.post('save', async function() {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(this.conversation, {
        lastMessage: {
            content: this.isDeleted ? 'Message deleted' : (this.content || (this.attachments?.length ? 'Sent an attachment' : '')),
            sender: this.sender,
            timestamp: this.createdAt,
            type: this.type,
        },
    });
});

// Delete existing model if it exists to prevent caching issues
if (mongoose.models.Message) {
    delete mongoose.models.Message;
}

const Message = mongoose.model('Message', messageSchema);

export default Message;
