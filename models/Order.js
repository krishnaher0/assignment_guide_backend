import mongoose from 'mongoose';

/**
 * Assignment Model (formerly Order)
 * Represents academic assignments submitted by students (clients)
 * Simplified workflow: pending → quoted → accepted → working → review → delivered → completed
 */
const orderSchema = mongoose.Schema({
    // Auto-generated assignment number
    assignmentNumber: {
        type: String,
        unique: true,
        sparse: true,
    },

    // Client (Student) Information
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // For guest submissions
    },
    clientName: String,
    clientEmail: String,
    clientPhone: String,

    // Assignment Details
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },

    // ACADEMIC-SPECIFIC FIELDS
    academicLevel: {
        type: String,
        enum: ['high_school', 'undergraduate', 'masters', 'phd'],
        default: 'undergraduate',
    },
    subject: {
        type: String,
        enum: [
            'computer_science', 'mathematics', 'physics', 'chemistry',
            'biology', 'english', 'business', 'economics', 'psychology',
            'engineering', 'nursing', 'law', 'history', 'sociology', 'other'
        ],
        default: 'other',
    },
    assignmentType: {
        type: String,
        enum: [
            'essay', 'research_paper', 'case_study', 'lab_report',
            'dissertation', 'thesis', 'homework', 'programming',
            'presentation', 'calculations', 'other'
        ],
        default: 'other',
    },
    wordCount: Number,
    pageCount: Number,
    citationStyle: {
        type: String,
        enum: ['apa', 'mla', 'chicago', 'harvard', 'ieee', 'none'],
        default: 'none',
    },
    requirements: String, // Detailed instructions from student

    // Reference files (rubrics, examples, briefs)
    referenceFiles: [{
        name: String,
        fileName: String,
        fileUrl: String,
        mimeType: String,
        size: Number,
        uploadedAt: { type: Date, default: Date.now },
    }],

    // Legacy field - just file URLs as strings
    files: [String],

    // DEADLINE (Critical for academic work)
    deadline: {
        type: Date,
        required: true,
    },
    urgency: {
        type: String,
        enum: ['standard', 'priority', 'urgent', 'rush'],
        default: 'standard',
    },
    // standard: 7+ days, priority: 3-7 days, urgent: 1-3 days, rush: <24 hours

    // SIMPLIFIED STATUS (7 core states)
    status: {
        type: String,
        enum: [
            'pending',      // New submission, awaiting admin review
            'quoted',       // Admin sent price quote to client
            'accepted',     // Client accepted quote and paid
            'working',      // Workers actively completing assignment
            'review',       // Work complete, admin reviewing quality
            'delivered',    // Client received final deliverables
            'completed',    // Assignment closed successfully
            'rejected',     // Admin rejected (invalid/inappropriate)
            'declined',     // Client declined quote
            'cancelled'     // Cancelled by either party
        ],
        default: 'pending',
    },

    // Service type (legacy - keep for backwards compatibility)
    service: String,

    // SIMPLIFIED WORKER ASSIGNMENT
    assignedWorkers: [{
        worker: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        assignedAt: { type: Date, default: Date.now },
        modules: [String], // What part they're working on
        progress: { type: Number, default: 0, min: 0, max: 100 },
        isComplete: { type: Boolean, default: false },
        completedAt: Date,
    }],

    // Legacy fields for backwards compatibility
    assignedDeveloper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    assignedDevelopers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],

    // Keep team for backwards compatibility during migration
    team: [{
        developer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        role: {
            type: String,
            enum: ['lead', 'senior', 'developer', 'qa', 'support'],
            default: 'developer',
        },
        responsibilities: String,
        modules: [{
            title: String,
            description: String,
            status: {
                type: String,
                enum: ['pending', 'in-progress', 'completed', 'blocked'],
                default: 'pending',
            },
            progress: { type: Number, default: 0, min: 0, max: 100 },
        }],
        individualProgress: { type: Number, default: 0, min: 0, max: 100 },
        progressNotes: [{
            note: String,
            progress: Number,
            createdAt: { type: Date, default: Date.now },
        }],
        joinedAt: { type: Date, default: Date.now },
        status: {
            type: String,
            enum: ['active', 'removed', 'completed'],
            default: 'active',
        },
    }],

    // Overall Progress
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
    },
    progressNotes: [{
        note: String,
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        addedAt: { type: Date, default: Date.now },
        // Legacy fields
        developerName: String,
        percentage: Number,
        notes: String,
        updatedAt: { type: Date, default: Date.now },
    }],

    // SUBTASKS - Checklist-based progress tracking
    subtasks: [{
        title: {
            type: String,
            required: true,
        },
        description: String,
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed', 'blocked'],
            default: 'pending',
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        isRequired: {
            type: Boolean,
            default: false, // Admin-created subtasks are required, dev-created are optional
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        dueDate: Date,
        completedAt: Date,
        createdAt: {
            type: Date,
            default: Date.now,
        },
    }],

    // BLOCKERS - Track what's blocking progress
    blockers: [{
        title: {
            type: String,
            required: true,
        },
        description: String,
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
        },
        reportedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        status: {
            type: String,
            enum: ['open', 'in-progress', 'resolved'],
            default: 'open',
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        resolution: String,
        createdAt: {
            type: Date,
            default: Date.now,
        },
        resolvedAt: Date,
    }],

    // PRICING
    budget: {
        type: String,
        default: 'TBD',
    },
    quotedAmount: Number,
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'NPR' },

    // PAYMENT (Simplified)
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'pending_verification', 'paid'],
        default: 'unpaid',
    },
    paymentMethod: {
        type: String,
        enum: ['esewa', 'qr', 'bank_transfer', 'manual'],
        default: 'esewa',
    },
    paymentProof: {
        fileName: String,
        fileUrl: String,
        uploadedAt: Date,
    },
    paidAmount: { type: Number, default: 0 },
    paidAt: Date,
    transactionId: String,
    paymentVerifiedAt: Date,
    paymentVerifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Legacy QR payment fields
    qrPaymentProof: String,
    qrPaymentSubmittedAt: Date,

    // REVISIONS
    revisionCount: { type: Number, default: 0 },
    maxRevisions: { type: Number, default: 2 },
    revisionRequests: [{
        request: String,
        requestedAt: { type: Date, default: Date.now },
        resolvedAt: Date,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    }],

    // DELIVERABLES
    deliverables: [{
        fileName: String,
        fileUrl: String,
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        version: { type: Number, default: 1 },
        isFinal: { type: Boolean, default: false },
    }],

    // Legacy deliverable fields
    developerReleases: [{
        developer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        releasedAt: Date,
        deliverables: [{
            title: String,
            fileUrl: String,
            fileType: String,
        }],
        notes: String,
    }],
    finalDeliverables: [{
        title: String,
        description: String,
        fileUrl: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        uploadedAt: { type: Date, default: Date.now },
    }],

    // References
    quote: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quote',
    },
    acceptedQuote: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quote',
    },
    contract: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contract',
    },

    // Hold status
    isOnHold: { type: Boolean, default: false },
    holdReason: String,

    // Legacy team requests (kept for migration)
    teamRequests: [{
        type: { type: String },
        description: String,
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, default: 'pending' },
        adminResponse: String,
        createdAt: { type: Date, default: Date.now },
        respondedAt: Date,
    }],

    // Timestamps
    submittedAt: { type: Date, default: Date.now },
    quotedAt: Date,
    acceptedAt: Date,
    startedAt: Date,
    completedAt: Date,
    deliveredAt: Date,

}, {
    timestamps: true,
});

// Virtual: Time remaining until deadline
orderSchema.virtual('timeRemaining').get(function() {
    if (!this.deadline) return null;
    return this.deadline - new Date();
});

// Virtual: Is overdue
orderSchema.virtual('isOverdue').get(function() {
    if (!this.deadline) return false;
    return new Date() > this.deadline && !['completed', 'delivered', 'cancelled'].includes(this.status);
});

// Virtual: Days until deadline
orderSchema.virtual('daysUntilDeadline').get(function() {
    if (!this.deadline) return null;
    const diff = this.deadline - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Pre-save: Generate assignment number
orderSchema.pre('save', async function() {
    if (!this.assignmentNumber && this.isNew) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Order').countDocuments();
        this.assignmentNumber = `ASN-${year}-${String(count + 1).padStart(4, '0')}`;
    }
});

// Ensure virtuals are included in JSON
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

const Order = mongoose.model('Order', orderSchema);

export default Order;
