import Invoice from '../models/Invoice.js';
import Contract from '../models/Contract.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { createNotification, notifyAllAdmins } from './notificationController.js';
import { sendEmail } from '../services/emailService.js';
import { updateMilestonePaymentStatus } from '../services/invoiceService.js';

// @desc    Create invoice from contract milestone
// @route   POST /api/invoices
// @access  Private/Admin
export const createInvoice = async (req, res) => {
    try {
        const {
            contractId,
            orderId,
            clientId,
            title,
            description,
            lineItems,
            taxRate,
            discountAmount,
            dueDate,
            notes,
            milestoneIndex,
        } = req.body;

        let clientDetails = {};
        let client = null;

        // Get client details from contract, order, or direct client
        if (contractId) {
            const contract = await Contract.findById(contractId);
            if (contract) {
                clientDetails = contract.clientDetails;
                client = contract.client;
            }
        } else if (orderId) {
            const order = await Order.findById(orderId);
            if (order) {
                clientDetails = {
                    name: order.clientName,
                    email: order.clientEmail,
                };
                client = order.client;
            }
        } else if (clientId) {
            const user = await User.findById(clientId);
            if (user) {
                clientDetails = {
                    name: user.name,
                    email: user.email,
                };
                client = user._id;
            }
        }

        // Calculate line item amounts
        const processedLineItems = lineItems.map(item => ({
            ...item,
            amount: item.quantity * item.unitPrice,
        }));

        const subtotal = processedLineItems.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = subtotal * ((taxRate || 0) / 100);
        const total = subtotal + taxAmount - (discountAmount || 0);

        const invoice = await Invoice.create({
            contract: contractId,
            order: orderId,
            client,
            clientDetails,
            title,
            description,
            lineItems: processedLineItems,
            subtotal,
            taxRate: taxRate || 0,
            taxAmount,
            discountAmount: discountAmount || 0,
            total,
            dueDate,
            notes,
            milestone: milestoneIndex !== undefined ? {
                title: lineItems[0]?.description,
                index: milestoneIndex,
            } : undefined,
            createdBy: req.user._id,
        });

        res.status(201).json({
            message: 'Invoice created successfully',
            invoice,
        });
    } catch (error) {
        console.error('Create Invoice Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private/Admin
export const getInvoices = async (req, res) => {
    try {
        const { status, client, startDate, endDate } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (client) filter.client = client;
        if (startDate || endDate) {
            filter.issueDate = {};
            if (startDate) filter.issueDate.$gte = new Date(startDate);
            if (endDate) filter.issueDate.$lte = new Date(endDate);
        }

        const invoices = await Invoice.find(filter)
            .populate('client', 'name email')
            .populate('contract', 'contractNumber')
            .populate('order', 'title')
            .sort({ createdAt: -1 });

        // Calculate summary stats
        const stats = {
            total: invoices.length,
            totalAmount: invoices.reduce((sum, inv) => sum + inv.total, 0),
            paid: invoices.filter(inv => inv.status === 'paid').length,
            pending: invoices.filter(inv => ['sent', 'viewed'].includes(inv.status)).length,
            overdue: invoices.filter(inv => inv.status === 'overdue').length,
        };

        res.json({ invoices, stats });
    } catch (error) {
        console.error('Get Invoices Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get client's invoices
// @route   GET /api/invoices/my-invoices
// @access  Private/Client
export const getMyInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({
            $or: [
                { client: req.user._id },
                { 'clientDetails.email': req.user.email }
            ],
            status: { $ne: 'draft' }
        })
            .populate('contract', 'contractNumber projectDetails')
            .sort({ createdAt: -1 });

        res.json(invoices);
    } catch (error) {
        console.error('Get My Invoices Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Private
export const getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('client', 'name email')
            .populate('contract', 'contractNumber projectDetails')
            .populate('order', 'title')
            .populate('createdBy', 'name');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Check access
        const isAdmin = req.user.role === 'admin';
        const isClient = invoice.client?.toString() === req.user._id.toString() ||
            invoice.clientDetails?.email === req.user.email;

        if (!isAdmin && !isClient) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Mark as viewed if client is viewing
        if (isClient && invoice.status === 'sent') {
            invoice.status = 'viewed';
            invoice.viewedAt = new Date();
            await invoice.save();
        }

        res.json(invoice);
    } catch (error) {
        console.error('Get Invoice Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Send invoice to client
// @route   POST /api/invoices/:id/send
// @access  Private/Admin
export const sendInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        if (invoice.status !== 'draft') {
            return res.status(400).json({ message: 'Invoice has already been sent' });
        }

        invoice.status = 'sent';
        invoice.sentAt = new Date();
        await invoice.save();

        // Notify client
        if (invoice.client) {
            await createNotification(
                invoice.client,
                'payment_due',
                'Invoice Received',
                `Invoice ${invoice.invoiceNumber} for ${invoice.currency} ${invoice.total.toLocaleString()} is due on ${new Date(invoice.dueDate).toLocaleDateString()}`,
                invoice._id,
                'Invoice',
                `/dashboard/client/payment`,
                {},
                [
                    {
                        id: 'pay',
                        label: 'Pay Now',
                        variant: 'primary',
                        actionType: 'navigate',
                        navigateTo: `/dashboard/client/payment`
                    }
                ]
            );
        }

        // Send email
        const clientEmail = invoice.clientDetails?.email;
        if (clientEmail) {
            await sendEmail(clientEmail, 'invoiceGenerated', {
                clientName: invoice.clientDetails?.name,
                invoiceNumber: invoice.invoiceNumber,
                description: invoice.title,
                currency: invoice.currency,
                amount: invoice.total,
                dueDate: new Date(invoice.dueDate).toLocaleDateString(),
                paymentUrl: `${process.env.FRONTEND_URL}/dashboard/client/payment`,
            });
        }

        res.json({
            message: 'Invoice sent successfully',
            invoice,
        });
    } catch (error) {
        console.error('Send Invoice Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark invoice as paid
// @route   POST /api/invoices/:id/mark-paid
// @access  Private/Admin
export const markInvoicePaid = async (req, res) => {
    try {
        const { paymentMethod, paymentReference, paymentNotes } = req.body;

        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        invoice.status = 'paid';
        invoice.paidAt = new Date();
        invoice.paymentMethod = paymentMethod;
        invoice.paymentReference = paymentReference;
        invoice.paymentNotes = paymentNotes;
        await invoice.save();

        // Update contract milestone status if this invoice is for a milestone
        if (invoice.milestone) {
            await updateMilestonePaymentStatus(invoice._id);
        }

        // Send confirmation email
        const clientEmail = invoice.clientDetails?.email;
        if (clientEmail) {
            await sendEmail(clientEmail, 'paymentReceived', {
                clientName: invoice.clientDetails?.name,
                currency: invoice.currency,
                amount: invoice.total,
                invoiceNumber: invoice.invoiceNumber,
                paymentDate: new Date().toLocaleDateString(),
            });
        }

        // Notify client
        if (invoice.client) {
            await createNotification(
                invoice.client,
                'payment_received',
                'Payment Confirmed',
                `Your payment of ${invoice.currency} ${invoice.total.toLocaleString()} has been confirmed.`,
                invoice._id,
                'Invoice'
            );
        }

        res.json({
            message: 'Invoice marked as paid',
            invoice,
        });
    } catch (error) {
        console.error('Mark Paid Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @access  Private/Admin
export const updateInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        if (invoice.status !== 'draft') {
            return res.status(400).json({ message: 'Only draft invoices can be edited' });
        }

        const {
            title,
            description,
            lineItems,
            taxRate,
            discountAmount,
            dueDate,
            notes,
        } = req.body;

        if (lineItems) {
            invoice.lineItems = lineItems.map(item => ({
                ...item,
                amount: item.quantity * item.unitPrice,
            }));
            invoice.subtotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
        }

        if (taxRate !== undefined) {
            invoice.taxRate = taxRate;
            invoice.taxAmount = invoice.subtotal * (taxRate / 100);
        }

        if (discountAmount !== undefined) invoice.discountAmount = discountAmount;
        invoice.total = invoice.subtotal + invoice.taxAmount - invoice.discountAmount;

        if (title) invoice.title = title;
        if (description) invoice.description = description;
        if (dueDate) invoice.dueDate = dueDate;
        if (notes) invoice.notes = notes;

        await invoice.save();

        res.json({
            message: 'Invoice updated successfully',
            invoice,
        });
    } catch (error) {
        console.error('Update Invoice Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private/Admin
export const deleteInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        if (invoice.status !== 'draft') {
            return res.status(400).json({ message: 'Only draft invoices can be deleted' });
        }

        await invoice.deleteOne();

        res.json({ message: 'Invoice deleted successfully' });
    } catch (error) {
        console.error('Delete Invoice Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get invoice statistics
// @route   GET /api/invoices/stats
// @access  Private/Admin
export const getInvoiceStats = async (req, res) => {
    try {
        const totalInvoices = await Invoice.countDocuments();
        const paidInvoices = await Invoice.countDocuments({ status: 'paid' });
        const pendingInvoices = await Invoice.countDocuments({ status: { $in: ['sent', 'viewed'] } });
        const overdueInvoices = await Invoice.countDocuments({ status: 'overdue' });

        const totalRevenue = await Invoice.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        const pendingRevenue = await Invoice.aggregate([
            { $match: { status: { $in: ['sent', 'viewed', 'overdue'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        // Monthly revenue for the last 12 months
        const monthlyRevenue = await Invoice.aggregate([
            { $match: { status: 'paid', paidAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
                    total: { $sum: '$total' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            totalInvoices,
            paidInvoices,
            pendingInvoices,
            overdueInvoices,
            totalRevenue: totalRevenue[0]?.total || 0,
            pendingRevenue: pendingRevenue[0]?.total || 0,
            monthlyRevenue,
        });
    } catch (error) {
        console.error('Get Invoice Stats Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
