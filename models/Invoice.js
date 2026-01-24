import mongoose from 'mongoose';

// Auto-generate invoice number
const generateInvoiceNumber = async () => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const lastInvoice = await mongoose.model('Invoice')
        .findOne({ invoiceNumber: new RegExp(`^INV-${year}${month}-`) })
        .sort({ createdAt: -1 });

    let sequence = 1;
    if (lastInvoice) {
        const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
        sequence = lastSequence + 1;
    }

    return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

const lineItemSchema = new mongoose.Schema({
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
});

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        unique: true,
    },

    // References
    contract: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contract',
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Client details (snapshot)
    clientDetails: {
        name: String,
        email: String,
        phone: String,
        address: String,
        company: String,
    },

    // Invoice details
    title: {
        type: String,
        required: true,
    },
    description: String,

    // Line items
    lineItems: [lineItemSchema],

    // Financials
    subtotal: {
        type: Number,
        required: true,
    },
    taxRate: {
        type: Number,
        default: 0,
    },
    taxAmount: {
        type: Number,
        default: 0,
    },
    discountAmount: {
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

    // Status
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
        default: 'draft',
    },

    // Dates
    issueDate: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
        required: true,
    },
    paidAt: Date,
    sentAt: Date,
    viewedAt: Date,

    // Payment info
    paymentMethod: String,
    paymentReference: String,
    paymentNotes: String,

    // Milestone reference (if invoice is for a milestone)
    milestone: {
        title: String,
        index: Number,
    },

    // Notes
    notes: String,
    termsAndConditions: {
        type: String,
        default: 'Payment is due within the specified due date. Late payments may incur additional charges.',
    },

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Pre-save middleware
invoiceSchema.pre('save', async function() {
    if (!this.invoiceNumber) {
        this.invoiceNumber = await generateInvoiceNumber();
    }

    // Calculate totals
    if (this.lineItems && this.lineItems.length > 0) {
        this.subtotal = this.lineItems.reduce((sum, item) => sum + item.amount, 0);
        this.taxAmount = this.subtotal * (this.taxRate / 100);
        this.total = this.subtotal + this.taxAmount - (this.discountAmount || 0);
    }

    // Check if overdue
    if (this.status === 'sent' && new Date() > this.dueDate) {
        this.status = 'overdue';
    }
});

// Indexes (invoiceNumber already indexed via unique: true)
invoiceSchema.index({ client: 1 });
invoiceSchema.index({ contract: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
