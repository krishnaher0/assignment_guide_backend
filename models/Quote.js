import mongoose from 'mongoose';

// Auto-generate quote number
const generateQuoteNumber = async () => {
    const year = new Date().getFullYear();
    const lastQuote = await mongoose.model('Quote')
        .findOne({ quoteNumber: new RegExp(`^QT-${year}-`) })
        .sort({ createdAt: -1 });

    let sequence = 1;
    if (lastQuote) {
        const lastSequence = parseInt(lastQuote.quoteNumber.split('-')[2]);
        sequence = lastSequence + 1;
    }

    return `QT-${year}-${String(sequence).padStart(4, '0')}`;
};

const lineItemSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: ['development', 'design', 'testing', 'deployment', 'consultation', 'maintenance', 'documentation', 'other'],
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1,
    },
    unit: {
        type: String,
        enum: ['hours', 'days', 'fixed', 'pages', 'modules', 'features'],
        default: 'fixed',
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
});

const deliverableSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    estimatedDelivery: String, // e.g., "Week 1", "Day 3"
});

const milestoneSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    percentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
    },
    amount: {
        type: Number,
        required: true,
    },
    dueDescription: String, // e.g., "Upon project start", "After design approval"
});

const revisionSchema = new mongoose.Schema({
    version: {
        type: Number,
        required: true,
    },
    changes: {
        type: String,
        required: true,
    },
    previousTotal: Number,
    newTotal: Number,
    revisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    revisedAt: {
        type: Date,
        default: Date.now,
    },
});

const quoteSchema = new mongoose.Schema({
    // Reference
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },

    // Quote identification
    quoteNumber: {
        type: String,
        unique: true,
    },
    version: {
        type: Number,
        default: 1,
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'revised', 'negotiating'],
        default: 'draft',
    },

    // Pricing breakdown
    lineItems: [lineItemSchema],

    // Calculations
    subtotal: {
        type: Number,
        default: 0,
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'none'],
        default: 'none',
    },
    discountValue: {
        type: Number,
        default: 0,
    },
    discountAmount: {
        type: Number,
        default: 0,
    },
    taxRate: {
        type: Number,
        default: 0, // Percentage
    },
    taxAmount: {
        type: Number,
        default: 0,
    },
    total: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'NPR',
    },

    // Project details
    projectTitle: {
        type: String,
        required: true,
    },
    projectSummary: {
        type: String,
        required: true,
    },

    // Deliverables
    deliverables: [deliverableSchema],

    // Timeline
    estimatedDuration: {
        value: Number,
        unit: {
            type: String,
            enum: ['days', 'weeks', 'months'],
            default: 'days',
        },
    },
    estimatedStartDate: Date,
    estimatedCompletionDate: Date,

    // Payment terms
    paymentTerms: {
        type: {
            type: String,
            enum: ['full_upfront', 'milestone', '50_50', 'custom'],
            default: 'milestone',
        },
        milestones: [milestoneSchema],
        notes: String,
    },

    // Terms & Conditions
    termsAndConditions: {
        revisionPolicy: {
            type: String,
            default: 'Up to 2 rounds of revisions included. Additional revisions charged at standard hourly rate.',
        },
        paymentPolicy: {
            type: String,
            default: 'Payment due within 7 days of invoice. Late payments may incur additional charges.',
        },
        cancellationPolicy: {
            type: String,
            default: 'Cancellation after project start will be charged for work completed plus 20% of remaining project value.',
        },
        intellectualProperty: {
            type: String,
            default: 'Full intellectual property rights transfer to client upon complete payment.',
        },
        confidentiality: {
            type: String,
            default: 'All project details and deliverables are treated as confidential.',
        },
        additionalTerms: String,
    },

    // Validity
    validUntil: {
        type: Date,
        required: true,
    },

    // Notes
    internalNotes: String, // Admin only
    clientNotes: String, // Visible to client

    // Tracking
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    sentAt: Date,
    viewedAt: Date,
    respondedAt: Date,

    // Client response
    clientResponse: {
        decision: {
            type: String,
            enum: ['accepted', 'rejected', 'negotiation_requested'],
        },
        feedback: String,
        negotiationNotes: String,
        respondedAt: Date,
    },

    // Revision history
    revisionHistory: [revisionSchema],

    // If this is a revision of another quote
    previousQuote: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quote',
    },
}, {
    timestamps: true,
});

// Pre-save middleware to generate quote number
quoteSchema.pre('save', async function() {
    if (!this.quoteNumber) {
        this.quoteNumber = await generateQuoteNumber();
    }

    // Calculate totals
    this.subtotal = this.lineItems.reduce((sum, item) => sum + item.amount, 0);

    // Calculate discount
    if (this.discountType === 'percentage') {
        this.discountAmount = (this.subtotal * this.discountValue) / 100;
    } else if (this.discountType === 'fixed') {
        this.discountAmount = this.discountValue;
    } else {
        this.discountAmount = 0;
    }

    // Calculate tax
    const afterDiscount = this.subtotal - this.discountAmount;
    this.taxAmount = (afterDiscount * this.taxRate) / 100;

    // Calculate total
    this.total = afterDiscount + this.taxAmount;
});

// Check if quote is expired
quoteSchema.methods.isExpired = function() {
    return new Date() > this.validUntil && this.status === 'sent';
};

// Virtual for formatted quote number with version
quoteSchema.virtual('displayNumber').get(function() {
    return this.version > 1 ? `${this.quoteNumber}-v${this.version}` : this.quoteNumber;
});

// Index for quick lookups (quoteNumber already indexed via unique: true)
quoteSchema.index({ order: 1, status: 1 });
quoteSchema.index({ createdBy: 1 });

const Quote = mongoose.model('Quote', quoteSchema);

export default Quote;
