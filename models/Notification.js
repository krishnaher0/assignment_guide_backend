import mongoose from 'mongoose';

const notificationSchema = mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: [
            // Existing types
            'task_assigned',
            'task_updated',
            'payment_received',
            'developer_applied',
            'developer_approved',
            'rate_negotiation',
            'message_received',
            'progress_updated',
            'task_completed',
            'payment_due',
            'application_status',
            // Order workflow types
            'order_submitted',       // New order from client
            'order_initialized',     // Admin initialized project
            'order_quoted',          // Admin set quote
            'order_accepted',        // Client accepted quote
            'order_declined',        // Client declined quote
            'order_started',         // Admin started project
            'order_delivered',       // Admin delivered to client
            'order_completed',       // Order completed
            'developers_assigned',   // Developers assigned to task
            'revision_requested',    // Client requested revision
            // Team types
            'team_joined',           // Developer added to team
            'team_removed',          // Developer removed from team
            // Worker/Developer types
            'task_review',           // Task submitted for review
            'deliverables_uploaded', // Worker uploaded deliverables
            // Quote types
            'quote_received',        // Client received quote
            'quote_viewed',          // Client viewed quote
            'quote_accepted',        // Client accepted quote
            'quote_rejected',        // Client rejected quote
            'quote_negotiation',     // Client requested negotiation
            // Payment types
            'payment_pending',       // Client submitted payment proof
            'payment_verified',      // Admin verified payment
            'payment_proof_uploaded', // Payment proof uploaded
            'qr_payment_submitted',  // Client submitted QR payment proof
            'release_required',      // Dev needs to release
            'released_to_admin',     // All devs released
            // Contract types
            'contract_ready',        // Contract ready for client signature
            'contract_viewed',       // Client viewed the contract
            'contract_signed',       // Client signed the contract
            'contract_active',       // Contract is now active
            'contract_completed',    // Contract completed
            'contract_terminated',   // Contract terminated
            'amendment_requested',   // Client requested amendment
            'amendment_response',    // Admin responded to amendment
        ],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        // Can reference Order, User, Conversation, DeveloperApplication
    },
    relatedModel: {
        type: String,
        enum: ['Order', 'User', 'Conversation', 'DeveloperApplication', 'Payment', 'Contract', 'Quote', 'Invoice'],
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: Date,
    actionUrl: String,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
    },
    metadata: mongoose.Schema.Types.Mixed,
}, {
    timestamps: true,
});

// Index for efficient queries
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
