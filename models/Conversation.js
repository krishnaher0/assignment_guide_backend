import mongoose from 'mongoose';

// Define participant sub-schema separately for clarity
const participantSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member',
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
    lastRead: {
        type: Date,
        default: Date.now,
    },
    notifications: {
        type: Boolean,
        default: true,
    },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct',
    },
    name: {
        type: String,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    avatar: {
        type: String,
    },
    participants: [participantSchema],
    settings: {
        onlyAdminsCanMessage: {
            type: Boolean,
            default: false,
        },
        onlyAdminsCanAddMembers: {
            type: Boolean,
            default: false,
        },
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastMessage: {
        content: String,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        timestamp: Date,
        type: {
            type: String,
            enum: ['text', 'file', 'image', 'system'],
            default: 'text',
        },
    },
    relatedOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
    },
    isPinned: {
        type: Boolean,
        default: false,
    },
    isArchived: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

// Indexes
conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ 'lastMessage.timestamp': -1 });
conversationSchema.index({ type: 1 });

// Method to get unread count
conversationSchema.methods.getUnreadCount = async function(userId) {
    const Message = mongoose.model('Message');
    const participant = this.participants.find(p =>
        p.user && p.user.toString() === userId.toString()
    );
    if (!participant) return 0;

    return await Message.countDocuments({
        conversation: this._id,
        createdAt: { $gt: participant.lastRead },
        sender: { $ne: userId },
    });
};

// Static method to find or create direct conversation
conversationSchema.statics.findOrCreateDirect = async function(user1Id, user2Id) {
    const id1 = new mongoose.Types.ObjectId(user1Id);
    const id2 = new mongoose.Types.ObjectId(user2Id);

    // Find existing direct conversation
    let conversation = await this.findOne({
        type: 'direct',
        $and: [
            { 'participants.user': id1 },
            { 'participants.user': id2 }
        ]
    }).populate('participants.user', 'name email profileImage role');

    // Check it has exactly 2 participants
    if (conversation && conversation.participants.length !== 2) {
        conversation = null;
    }

    if (!conversation) {
        conversation = new this({
            type: 'direct',
            participants: [
                { user: id1, role: 'member' },
                { user: id2, role: 'member' },
            ],
        });
        await conversation.save();
        await conversation.populate('participants.user', 'name email profileImage role');
    }

    return conversation;
};

// Delete existing model if it exists to prevent caching issues
if (mongoose.models.Conversation) {
    delete mongoose.models.Conversation;
}

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
