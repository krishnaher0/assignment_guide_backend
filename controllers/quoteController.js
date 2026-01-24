import Quote from '../models/Quote.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import { createNotification } from './notificationController.js';
import { sendEmail } from '../services/emailService.js';

// Helper: Notify client about quote
const notifyClient = async (clientId, type, title, message, quoteId, orderId) => {
    if (!clientId) return;
    try {
        await createNotification(
            clientId,
            type,
            title,
            message,
            quoteId,
            'Quote',
            `/dashboard/client/quotes/${quoteId}`,
            { orderId }
        );
    } catch (error) {
        console.error('Error notifying client:', error);
    }
};

// Helper: Notify admins
const notifyAdmins = async (type, title, message, quoteId, orderId) => {
    try {
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                type,
                title,
                message,
                quoteId,
                'Quote',
                `/admin/quotes/${quoteId}`,
                { orderId }
            );
        }
    } catch (error) {
        console.error('Error notifying admins:', error);
    }
};

// @desc    Create a new quote
// @route   POST /api/quotes
// @access  Private/Admin
export const createQuote = async (req, res) => {
    try {
        console.log('Create Quote - Request Body:', JSON.stringify(req.body, null, 2));

        const {
            orderId,
            projectTitle,
            projectSummary,
            lineItems,
            deliverables,
            estimatedDuration,
            estimatedStartDate,
            estimatedCompletionDate,
            paymentTerms,
            termsAndConditions,
            validUntil,
            discountType,
            discountValue,
            taxRate,
            clientNotes,
            internalNotes,
        } = req.body;

        // Validate user
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Validate orderId
        if (!orderId) {
            return res.status(400).json({ message: 'Order ID is required' });
        }

        // Validate order exists
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if there's already an active quote for this order
        const existingQuote = await Quote.findOne({
            order: orderId,
            status: { $in: ['draft', 'sent', 'viewed', 'negotiating'] }
        });

        if (existingQuote) {
            return res.status(400).json({
                message: 'An active quote already exists for this order',
                existingQuoteId: existingQuote._id
            });
        }

        // Validate lineItems exists
        if (!lineItems || !Array.isArray(lineItems)) {
            return res.status(400).json({ message: 'Line items are required' });
        }

        // Calculate line item amounts - filter out empty items
        const processedLineItems = lineItems
            .filter(item => item && item.description && item.unitPrice > 0)
            .map(item => ({
                ...item,
                amount: (item.quantity || 1) * item.unitPrice
            }));

        if (processedLineItems.length === 0) {
            return res.status(400).json({ message: 'At least one line item with description and price is required' });
        }

        // Filter out empty deliverables
        const processedDeliverables = (deliverables || [])
            .filter(d => d.title && d.title.trim() !== '');

        // Process payment milestones - filter empty ones and calculate amounts
        let processedPaymentTerms = paymentTerms || { type: 'milestone', milestones: [] };
        if (processedPaymentTerms.milestones) {
            const subtotalForMilestones = processedLineItems.reduce((sum, item) => sum + item.amount, 0);
            processedPaymentTerms.milestones = processedPaymentTerms.milestones
                .filter(m => m.title && m.title.trim() !== '')
                .map(m => ({
                    ...m,
                    amount: m.amount || (subtotalForMilestones * (m.percentage || 0) / 100)
                }));
        }

        // Calculate total for validation
        const subtotal = processedLineItems.reduce((sum, item) => sum + item.amount, 0);
        let total = subtotal;

        if (discountType === 'percentage') {
            total -= (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
            total -= discountValue;
        }

        if (taxRate) {
            total += (total * taxRate) / 100;
        }

        // Ensure total is a valid number
        if (isNaN(total) || total < 0) {
            total = subtotal;
        }

        console.log('Calculated values:', { subtotal, total, processedLineItems: processedLineItems.length });

        // Ensure required fields have values
        const finalProjectTitle = projectTitle || order.title || 'Untitled Project';
        const finalProjectSummary = projectSummary || order.description || 'Project description';

        const quote = await Quote.create({
            order: orderId,
            projectTitle: finalProjectTitle,
            projectSummary: finalProjectSummary,
            lineItems: processedLineItems,
            deliverables: processedDeliverables,
            estimatedDuration,
            estimatedStartDate,
            estimatedCompletionDate,
            paymentTerms: processedPaymentTerms,
            termsAndConditions,
            validUntil: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
            discountType: discountType || 'none',
            discountValue: discountValue || 0,
            taxRate: taxRate || 0,
            total,
            clientNotes,
            internalNotes,
            createdBy: req.user._id,
            status: 'sent', // Set to 'sent' so client can accept it
        });

        // Update order status to quoted
        order.status = 'quoted';
        order.quotedAt = new Date();
        order.quotedAmount = total;
        order.quote = quote._id;
        await order.save();

        const populatedQuote = await Quote.findById(quote._id)
            .populate('order', 'title clientName clientEmail')
            .populate('createdBy', 'name email');

        // Send response first
        res.status(201).json({
            message: 'Quote created successfully',
            quote: populatedQuote
        });

        // Notify client about the quote (non-blocking)
        if (order.client) {
            notifyClient(
                order.client,
                'order_quoted',
                'Quote Ready for Review',
                `Your quote for "${finalProjectTitle}" is ready. Total: NPR ${total.toLocaleString()}`,
                quote._id,
                order._id
            ).catch(err => console.error('Quote notification error:', err.message));
        }

        // Send email notification
        const clientEmail = order.clientEmail || (order.client ? (await User.findById(order.client))?.email : null);
        if (clientEmail) {
            const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
            sendEmail(clientEmail, 'quoteReady', {
                clientName: order.clientName || 'Valued Customer',
                assignmentTitle: finalProjectTitle,
                quotedAmount: total,
                assignmentType: order.assignmentType || 'Assignment',
                deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : 'As agreed',
                wordCount: order.wordCount,
                acceptUrl: `${baseUrl}/dashboard/client/quotes/${quote._id}`,
                viewUrl: `${baseUrl}/dashboard/client/quotes/${quote._id}`,
            }).catch(err => console.error('Quote email error:', err.message));
        }

        return;
    } catch (error) {
        console.error('Create Quote Error:', error);
        // Check for Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: messages.join(', '), errors: error.errors });
        }
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get all quotes (admin)
// @route   GET /api/quotes
// @access  Private/Admin
export const getQuotes = async (req, res) => {
    try {
        const { status, orderId, limit = 50 } = req.query;

        let query = {};
        if (status) query.status = status;
        if (orderId) query.order = orderId;

        const quotes = await Quote.find(query)
            .populate('order', 'title clientName clientEmail client status')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(quotes);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get quote by ID
// @route   GET /api/quotes/:id
// @access  Private
export const getQuoteById = async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id)
            .populate('order', 'title description clientName clientEmail client status urgency deadline')
            .populate('createdBy', 'name email')
            .populate('revisionHistory.revisedBy', 'name');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        // Check access - admin can view all, client can only view their quotes
        if (req.user.role === 'client') {
            const order = await Order.findById(quote.order._id);
            if (order.client?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Access denied' });
            }

            // Mark as viewed if first time
            if (!quote.viewedAt && quote.status === 'sent') {
                quote.viewedAt = new Date();
                quote.status = 'viewed';
                await quote.save();

                // Notify admin that client viewed the quote
                await notifyAdmins(
                    'quote_viewed',
                    'Quote Viewed',
                    `Client viewed quote ${quote.quoteNumber} for "${quote.projectTitle}"`,
                    quote._id,
                    quote.order._id
                );
            }
        }

        res.json(quote);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get quotes for an order
// @route   GET /api/quotes/order/:orderId
// @access  Private
export const getQuotesByOrder = async (req, res) => {
    try {
        const quotes = await Quote.find({ order: req.params.orderId })
            .populate('createdBy', 'name email')
            .sort({ version: -1 });

        res.json(quotes);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update quote (draft only)
// @route   PUT /api/quotes/:id
// @access  Private/Admin
export const updateQuote = async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id);

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        // Only allow editing drafts
        if (quote.status !== 'draft') {
            return res.status(400).json({
                message: 'Cannot edit a quote that has already been sent. Create a revision instead.'
            });
        }

        const allowedUpdates = [
            'projectTitle', 'projectSummary', 'lineItems', 'deliverables',
            'estimatedDuration', 'estimatedStartDate', 'estimatedCompletionDate',
            'paymentTerms', 'termsAndConditions', 'validUntil',
            'discountType', 'discountValue', 'taxRate',
            'clientNotes', 'internalNotes'
        ];

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                quote[field] = req.body[field];
            }
        });

        // Recalculate line item amounts if lineItems updated
        if (req.body.lineItems) {
            quote.lineItems = req.body.lineItems.map(item => ({
                ...item,
                amount: item.quantity * item.unitPrice
            }));
        }

        await quote.save();

        const updatedQuote = await Quote.findById(quote._id)
            .populate('order', 'title clientName clientEmail')
            .populate('createdBy', 'name email');

        res.json({
            message: 'Quote updated successfully',
            quote: updatedQuote
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Send quote to client
// @route   POST /api/quotes/:id/send
// @access  Private/Admin
export const sendQuote = async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id).populate('order');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        if (quote.status !== 'draft' && quote.status !== 'revised') {
            return res.status(400).json({ message: 'Quote has already been sent' });
        }

        // Validate quote has required fields
        if (!quote.lineItems || quote.lineItems.length === 0) {
            return res.status(400).json({ message: 'Quote must have at least one line item' });
        }

        quote.status = 'sent';
        quote.sentAt = new Date();
        await quote.save();

        // Update order status
        const order = await Order.findById(quote.order._id);
        order.status = 'quoted';
        order.quotedAmount = quote.total;
        order.quotedAt = new Date();
        await order.save();

        // Notify client
        if (order.client) {
            await notifyClient(
                order.client,
                'quote_received',
                'New Quote Received',
                `You have received a quote for "${quote.projectTitle}". Total: ${quote.currency} ${quote.total.toLocaleString()}`,
                quote._id,
                order._id
            );
        }

        res.json({
            message: 'Quote sent successfully',
            quote
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client accepts quote
// @route   POST /api/quotes/:id/accept
// @access  Private/Client
export const acceptQuote = async (req, res) => {
    try {
        const { feedback } = req.body;
        const quote = await Quote.findById(req.params.id).populate('order');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        // Verify client owns this order - by ID or email match
        const order = await Order.findById(quote.order._id);
        const isClientById = order.client?.toString() === req.user._id.toString();
        const isClientByEmail = order.clientEmail?.toLowerCase() === req.user.email?.toLowerCase();

        if (!isClientById && !isClientByEmail) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Link client to order if not already linked
        if (!order.client) {
            order.client = req.user._id;
        }

        if (!['sent', 'viewed', 'negotiating'].includes(quote.status)) {
            return res.status(400).json({ message: 'Quote cannot be accepted in its current state' });
        }

        // Check if quote is expired
        if (quote.isExpired()) {
            quote.status = 'expired';
            await quote.save();
            return res.status(400).json({ message: 'Quote has expired. Please request a new quote.' });
        }

        quote.status = 'accepted';
        quote.respondedAt = new Date();
        quote.clientResponse = {
            decision: 'accepted',
            feedback: feedback || '',
            respondedAt: new Date()
        };
        await quote.save();

        // Update order - Quote accepted, awaiting payment
        order.status = 'accepted';
        order.acceptedAt = new Date();
        order.amount = quote.total;
        order.quotedAmount = quote.total;
        order.acceptedQuote = quote._id;

        // Auto-generate contract from accepted quote (use req.user._id as client)
        const contract = await Contract.create({
            order: order._id,
            quote: quote._id,
            client: req.user._id,
            status: 'pending_signature',

            // Service provider details
            serviceProvider: {
                name: 'CodeSupport',
                email: 'support@codesupport.com',
                phone: '+977-9800000000',
            },

            // Client details
            clientDetails: {
                name: order.clientName,
                email: order.clientEmail,
                phone: order.clientPhone || '',
            },

            // Project details from quote
            projectDetails: {
                title: quote.projectTitle,
                description: quote.projectSummary,
                scope: quote.projectSummary,
                deliverables: quote.deliverables || [],
            },

            // Financial terms from quote
            financialTerms: {
                totalAmount: quote.total,
                currency: quote.currency,
                paymentStructure: quote.paymentTerms?.type || 'milestone',
                milestones: quote.paymentTerms?.milestones?.map(m => ({
                    title: m.title,
                    description: m.description || '',
                    percentage: m.percentage,
                    amount: m.amount || (quote.total * m.percentage / 100),
                    dueDescription: m.dueDescription,
                    status: 'pending',
                })) || [],
                paymentMethods: ['esewa', 'bank_transfer', 'qr'],
            },

            // Timeline
            timeline: {
                effectiveDate: new Date(),
                estimatedStartDate: quote.estimatedStartDate,
                estimatedCompletionDate: quote.estimatedCompletionDate,
                estimatedDuration: quote.estimatedDuration,
            },

            // Terms from quote
            terms: {
                revisionPolicy: quote.termsAndConditions?.revisionPolicy,
                paymentTerms: quote.termsAndConditions?.paymentPolicy,
                intellectualProperty: quote.termsAndConditions?.intellectualProperty,
                confidentiality: quote.termsAndConditions?.confidentiality,
                additionalTerms: quote.termsAndConditions?.additionalTerms,
            },

            // Provider signature (auto-signed by system)
            providerSignature: {
                signedByName: 'CodeSupport Team',
                signedByEmail: 'contracts@codesupport.com',
                signedAt: new Date(),
                agreed: true,
                signatureType: 'digital_acceptance',
            },

            sentAt: new Date(),
        });

        // Update order with contract reference
        order.contract = contract._id;
        await order.save();

        // Notify client about contract
        if (order.client) {
            await notifyClient(
                order.client,
                'contract_ready',
                'Contract Ready for Signature',
                `Your contract for "${quote.projectTitle}" is ready. Please review and sign to proceed.`,
                quote._id,
                order._id
            );
        }

        // Notify admins
        await notifyAdmins(
            'quote_accepted',
            'Quote Accepted',
            `Client accepted quote ${quote.quoteNumber} for "${quote.projectTitle}". Contract generated and sent to client.`,
            quote._id,
            order._id
        );

        res.json({
            message: 'Quote accepted! Contract has been generated and sent for signature.',
            quote,
            order,
            contract
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client rejects quote
// @route   POST /api/quotes/:id/reject
// @access  Private/Client
export const rejectQuote = async (req, res) => {
    try {
        const { feedback } = req.body;
        const quote = await Quote.findById(req.params.id).populate('order');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        // Verify client owns this order - by ID or email match
        const order = await Order.findById(quote.order._id);
        const isClientById = order.client?.toString() === req.user._id.toString();
        const isClientByEmail = order.clientEmail?.toLowerCase() === req.user.email?.toLowerCase();

        if (!isClientById && !isClientByEmail) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (!['sent', 'viewed', 'negotiating'].includes(quote.status)) {
            return res.status(400).json({ message: 'Quote cannot be rejected in its current state' });
        }

        quote.status = 'rejected';
        quote.respondedAt = new Date();
        quote.clientResponse = {
            decision: 'rejected',
            feedback: feedback || '',
            respondedAt: new Date()
        };
        await quote.save();

        // Notify admins
        await notifyAdmins(
            'quote_rejected',
            'Quote Rejected',
            `Client rejected quote ${quote.quoteNumber} for "${quote.projectTitle}". Reason: ${feedback || 'No reason provided'}`,
            quote._id,
            order._id
        );

        res.json({
            message: 'Quote rejected',
            quote
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client requests negotiation
// @route   POST /api/quotes/:id/negotiate
// @access  Private/Client
export const requestNegotiation = async (req, res) => {
    try {
        const { notes } = req.body;
        const quote = await Quote.findById(req.params.id).populate('order');

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        // Verify client owns this order - by ID or email match
        const order = await Order.findById(quote.order._id);
        const isClientById = order.client?.toString() === req.user._id.toString();
        const isClientByEmail = order.clientEmail?.toLowerCase() === req.user.email?.toLowerCase();

        if (!isClientById && !isClientByEmail) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (!['sent', 'viewed'].includes(quote.status)) {
            return res.status(400).json({ message: 'Quote cannot be negotiated in its current state' });
        }

        if (!notes || notes.trim() === '') {
            return res.status(400).json({ message: 'Please provide your concerns or requested changes' });
        }

        quote.status = 'negotiating';
        quote.clientResponse = {
            decision: 'negotiation_requested',
            negotiationNotes: notes,
            respondedAt: new Date()
        };
        await quote.save();

        // Notify admins
        await notifyAdmins(
            'quote_negotiation',
            'Negotiation Requested',
            `Client requested changes to quote ${quote.quoteNumber}: "${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}"`,
            quote._id,
            order._id
        );

        res.json({
            message: 'Negotiation request sent. Admin will review and respond.',
            quote
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Admin creates revision of quote
// @route   POST /api/quotes/:id/revise
// @access  Private/Admin
export const reviseQuote = async (req, res) => {
    try {
        const originalQuote = await Quote.findById(req.params.id);

        if (!originalQuote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        const {
            lineItems,
            deliverables,
            estimatedDuration,
            paymentTerms,
            termsAndConditions,
            validUntil,
            discountType,
            discountValue,
            taxRate,
            clientNotes,
            internalNotes,
            changeNotes
        } = req.body;

        // Mark original as revised
        originalQuote.status = 'revised';
        await originalQuote.save();

        // Calculate new line items
        const processedLineItems = (lineItems || originalQuote.lineItems).map(item => ({
            ...item,
            amount: item.quantity * item.unitPrice
        }));

        const subtotal = processedLineItems.reduce((sum, item) => sum + item.amount, 0);
        let total = subtotal;
        const newDiscountType = discountType || originalQuote.discountType;
        const newDiscountValue = discountValue ?? originalQuote.discountValue;
        const newTaxRate = taxRate ?? originalQuote.taxRate;

        if (newDiscountType === 'percentage') {
            total -= (subtotal * newDiscountValue) / 100;
        } else if (newDiscountType === 'fixed') {
            total -= newDiscountValue;
        }

        if (newTaxRate) {
            total += (total * newTaxRate) / 100;
        }

        // Create new quote with incremented version
        const newQuote = await Quote.create({
            order: originalQuote.order,
            quoteNumber: originalQuote.quoteNumber, // Same number
            version: originalQuote.version + 1,
            projectTitle: originalQuote.projectTitle,
            projectSummary: originalQuote.projectSummary,
            lineItems: processedLineItems,
            deliverables: deliverables || originalQuote.deliverables,
            estimatedDuration: estimatedDuration || originalQuote.estimatedDuration,
            estimatedStartDate: originalQuote.estimatedStartDate,
            estimatedCompletionDate: originalQuote.estimatedCompletionDate,
            paymentTerms: paymentTerms || originalQuote.paymentTerms,
            termsAndConditions: termsAndConditions || originalQuote.termsAndConditions,
            validUntil: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            discountType: newDiscountType,
            discountValue: newDiscountValue,
            taxRate: newTaxRate,
            total,
            currency: originalQuote.currency,
            clientNotes: clientNotes || originalQuote.clientNotes,
            internalNotes,
            createdBy: req.user._id,
            previousQuote: originalQuote._id,
            status: 'draft',
            revisionHistory: [
                ...originalQuote.revisionHistory,
                {
                    version: originalQuote.version,
                    changes: changeNotes || 'Quote revised based on client feedback',
                    previousTotal: originalQuote.total,
                    newTotal: total,
                    revisedBy: req.user._id,
                    revisedAt: new Date()
                }
            ]
        });

        const populatedQuote = await Quote.findById(newQuote._id)
            .populate('order', 'title clientName clientEmail')
            .populate('createdBy', 'name email');

        res.status(201).json({
            message: 'Quote revision created. Review and send to client.',
            quote: populatedQuote,
            previousQuote: originalQuote
        });
    } catch (error) {
        console.error('Revise Quote Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete quote (draft only)
// @route   DELETE /api/quotes/:id
// @access  Private/Admin
export const deleteQuote = async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id);

        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        if (quote.status !== 'draft') {
            return res.status(400).json({ message: 'Only draft quotes can be deleted' });
        }

        await quote.deleteOne();

        res.json({ message: 'Quote deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get client's quotes
// @route   GET /api/quotes/my-quotes
// @access  Private/Client
export const getMyQuotes = async (req, res) => {
    try {
        // Find all orders belonging to this client
        const orders = await Order.find({ client: req.user._id }).select('_id');
        const orderIds = orders.map(o => o._id);

        // Find all quotes for these orders
        const quotes = await Quote.find({
            order: { $in: orderIds },
            status: { $ne: 'draft' } // Don't show drafts to clients
        })
            .populate('order', 'title status')
            .sort({ createdAt: -1 });

        res.json(quotes);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get quote statistics
// @route   GET /api/quotes/stats
// @access  Private/Admin
export const getQuoteStats = async (req, res) => {
    try {
        const stats = await Quote.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$total' }
                }
            }
        ]);

        const acceptanceRate = await Quote.aggregate([
            {
                $match: {
                    status: { $in: ['accepted', 'rejected'] }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    accepted: {
                        $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    rate: {
                        $cond: [
                            { $gt: ['$total', 0] },
                            { $multiply: [{ $divide: ['$accepted', '$total'] }, 100] },
                            0
                        ]
                    }
                }
            }
        ]);

        res.json({
            byStatus: stats,
            acceptanceRate: acceptanceRate[0]?.rate || 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
