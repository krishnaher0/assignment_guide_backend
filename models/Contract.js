import mongoose from 'mongoose';

// Auto-generate contract number
const generateContractNumber = async () => {
    const year = new Date().getFullYear();
    const lastContract = await mongoose.model('Contract')
        .findOne({ contractNumber: new RegExp(`^CTR-${year}-`) })
        .sort({ createdAt: -1 });

    let sequence = 1;
    if (lastContract) {
        const lastSequence = parseInt(lastContract.contractNumber.split('-')[2]);
        sequence = lastSequence + 1;
    }

    return `CTR-${year}-${String(sequence).padStart(4, '0')}`;
};

const signatureSchema = new mongoose.Schema({
    signedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    signedByName: String,
    signedByEmail: String,
    signedAt: Date,
    ipAddress: String,
    userAgent: String,
    signatureType: {
        type: String,
        enum: ['digital_acceptance', 'drawn_signature'],
        default: 'digital_acceptance',
    },
    signatureData: String, // For drawn signatures (base64)
    agreed: {
        type: Boolean,
        default: false,
    },
});

const amendmentSchema = new mongoose.Schema({
    amendmentNumber: Number,
    description: String,
    changes: String,
    previousValue: String,
    newValue: String,
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    approvedAt: Date,
});

const contractSchema = new mongoose.Schema({
    // References
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },
    quote: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quote',
        required: true,
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Contract identification
    contractNumber: {
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
        enum: ['draft', 'pending_signature', 'active', 'completed', 'terminated', 'expired'],
        default: 'draft',
    },

    // Parties
    serviceProvider: {
        name: {
            type: String,
            default: 'CodeSupport',
        },
        address: String,
        email: String,
        phone: String,
        registrationNumber: String,
    },
    clientDetails: {
        name: String,
        email: String,
        phone: String,
        address: String,
        company: String,
    },

    // Project Details (from Quote)
    projectDetails: {
        title: String,
        description: String,
        scope: String,
        deliverables: [{
            title: String,
            description: String,
            estimatedDelivery: String,
        }],
    },

    // Financial Terms (from Quote)
    financialTerms: {
        totalAmount: Number,
        currency: {
            type: String,
            default: 'NPR',
        },
        paymentStructure: {
            type: String,
            enum: ['full_upfront', 'milestone', '50_50', 'custom'],
        },
        milestones: [{
            title: String,
            description: String,
            percentage: Number,
            amount: Number,
            dueDescription: String,
            status: {
                type: String,
                enum: ['pending', 'invoiced', 'paid'],
                default: 'pending',
            },
            paidAt: Date,
        }],
        paymentMethods: [String],
        lateFeePercentage: {
            type: Number,
            default: 2,
        },
    },

    // Timeline
    timeline: {
        effectiveDate: Date,
        estimatedStartDate: Date,
        estimatedCompletionDate: Date,
        actualStartDate: Date,
        actualCompletionDate: Date,
        estimatedDuration: {
            value: Number,
            unit: {
                type: String,
                enum: ['days', 'weeks', 'months'],
            },
        },
    },

    // Terms and Conditions
    terms: {
        // Scope & Changes
        scopeOfWork: {
            type: String,
            default: 'The Service Provider agrees to deliver the project as specified in the Project Details section. Any changes to the scope must be agreed upon in writing by both parties and may result in additional charges.',
        },
        changeRequests: {
            type: String,
            default: 'Any changes to the project scope, timeline, or deliverables must be submitted in writing. The Service Provider will assess the impact and provide a revised quote if necessary.',
        },

        // Revisions
        revisionPolicy: String,
        additionalRevisionRate: String,

        // Payment
        paymentTerms: String,
        lateFeePolicy: {
            type: String,
            default: 'Late payments will incur a fee of 2% per week on the outstanding balance.',
        },
        refundPolicy: {
            type: String,
            default: 'Refunds are available for work not yet started. For work in progress, refunds will be prorated based on completed work.',
        },

        // Intellectual Property
        intellectualProperty: String,
        ownershipTransfer: {
            type: String,
            default: 'Full ownership of all deliverables will transfer to the Client upon receipt of complete payment.',
        },

        // Confidentiality
        confidentiality: String,
        ndaClause: {
            type: String,
            default: 'Both parties agree to maintain confidentiality of all project-related information and not disclose it to third parties without written consent.',
        },

        // Liability
        limitationOfLiability: {
            type: String,
            default: 'The Service Provider\'s liability is limited to the total amount paid under this contract. Neither party shall be liable for indirect, incidental, or consequential damages.',
        },
        warranty: {
            type: String,
            default: 'The Service Provider warrants that all work will be performed in a professional manner. A 30-day warranty period applies to fix any bugs or issues in the delivered work.',
        },

        // Termination
        terminationByClient: {
            type: String,
            default: 'The Client may terminate this contract with 7 days written notice. Client will be charged for all work completed plus 20% of remaining project value.',
        },
        terminationByProvider: {
            type: String,
            default: 'The Service Provider may terminate this contract if payment is overdue by more than 14 days or if the Client fails to provide required materials/feedback.',
        },

        // Dispute Resolution
        disputeResolution: {
            type: String,
            default: 'Any disputes arising from this contract will be resolved through good-faith negotiation. If unresolved, disputes will be submitted to binding arbitration.',
        },
        governingLaw: {
            type: String,
            default: 'This contract shall be governed by the laws of Nepal.',
        },

        // Force Majeure
        forceMajeure: {
            type: String,
            default: 'Neither party shall be liable for delays or failures in performance resulting from circumstances beyond their reasonable control.',
        },

        // Additional Terms
        additionalTerms: String,
    },

    // Signatures
    clientSignature: signatureSchema,
    providerSignature: signatureSchema,

    // Amendments
    amendments: [amendmentSchema],

    // Invoice Settings
    autoSendInvoices: {
        type: Boolean,
        default: false, // If true, invoices are sent immediately; if false, created as drafts
    },

    // Tracking
    sentAt: Date,
    viewedAt: Date,
    signedAt: Date,
    activatedAt: Date,
    completedAt: Date,
    terminatedAt: Date,
    terminationReason: String,

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Pre-save middleware
contractSchema.pre('save', async function() {
    if (!this.contractNumber) {
        this.contractNumber = await generateContractNumber();
    }
});

// Check if contract is signed by both parties
contractSchema.methods.isFullySigned = function() {
    return this.clientSignature?.agreed && this.providerSignature?.agreed;
};

// Check if contract is active
contractSchema.methods.isActive = function() {
    return this.status === 'active' && this.isFullySigned();
};

// Indexes (contractNumber already indexed via unique: true)
contractSchema.index({ order: 1 });
contractSchema.index({ quote: 1 });
contractSchema.index({ client: 1 });
contractSchema.index({ status: 1 });
contractSchema.index({ 'clientDetails.email': 1 });

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
