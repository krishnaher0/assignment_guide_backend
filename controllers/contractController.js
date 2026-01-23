import Contract from '../models/Contract.js';
import Quote from '../models/Quote.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import { sendEmail } from '../services/emailService.js';
import { generateInvoicesFromContract } from '../services/invoiceService.js';

// Helper: Notify user
const notifyUser = async (userId, type, title, message, contractId, actions = []) => {
    if (!userId) return;
    try {
        await createNotification(
            userId,
            type,
            title,
            message,
            contractId,
            'Contract',
            `/dashboard/client/contracts/${contractId}`,
            {},
            actions
        );
    } catch (error) {
        console.error('Notification error:', error);
    }
};

// Helper: Notify admins
const notifyAdmins = async (type, title, message, contractId, actions = []) => {
    try {
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                type,
                title,
                message,
                contractId,
                'Contract',
                `/admin/contracts/${contractId}`,
                {},
                actions
            );
        }
    } catch (error) {
        console.error('Admin notification error:', error);
    }
};

// @desc    Generate contract from accepted quote
// @route   POST /api/contracts/generate
// @access  Private/Admin
export const generateContract = async (req, res) => {
    try {
        const { quoteId } = req.body;

        const quote = await Quote.findById(quoteId).populate('order');
        if (!quote) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        if (quote.status !== 'accepted') {
            return res.status(400).json({ message: 'Contract can only be generated for accepted quotes' });
        }

        // Check if contract already exists
        const existingContract = await Contract.findOne({ quote: quoteId });
        if (existingContract) {
            return res.status(400).json({
                message: 'Contract already exists for this quote',
                contractId: existingContract._id
            });
        }

        const order = quote.order;

        // Create contract from quote data
        const contract = await Contract.create({
            order: order._id,
            quote: quote._id,
            client: order.client,
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
            createdBy: req.user._id,
        });

        // Update order with contract reference
        order.contract = contract._id;
        await order.save();

        // Notify client
        if (order.client) {
            await notifyUser(
                order.client,
                'contract_ready',
                'Contract Ready for Signature',
                `Your contract for "${quote.projectTitle}" is ready. Please review and sign to proceed.`,
                contract._id,
                [
                    {
                        id: 'view_contract',
                        label: 'View Contract',
                        variant: 'primary',
                        actionType: 'navigate',
                        navigateTo: `/dashboard/client/contracts/${contract._id}`
                    }
                ]
            );
        }

        // Send email notification
        const clientEmail = order.clientEmail || contract.clientDetails?.email;
        if (clientEmail) {
            await sendEmail(clientEmail, 'contractReady', {
                clientName: order.clientName || contract.clientDetails?.name,
                contractNumber: contract.contractNumber,
                projectTitle: quote.projectTitle,
                currency: quote.currency,
                totalAmount: quote.total,
                contractUrl: `${process.env.FRONTEND_URL}/dashboard/client/contracts/${contract._id}`,
            });
        }

        const populatedContract = await Contract.findById(contract._id)
            .populate('order', 'title clientName')
            .populate('quote', 'quoteNumber projectTitle');

        res.status(201).json({
            message: 'Contract generated successfully',
            contract: populatedContract
        });
    } catch (error) {
        console.error('Generate Contract Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all contracts
// @route   GET /api/contracts
// @access  Private/Admin
export const getContracts = async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        let query = {};
        if (status) query.status = status;

        const contracts = await Contract.find(query)
            .populate('order', 'title clientName clientEmail status')
            .populate('quote', 'quoteNumber total')
            .populate('client', 'name email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(contracts);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get contract by ID
// @route   GET /api/contracts/:id
// @access  Private
export const getContractById = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id)
            .populate('order', 'title description clientName clientEmail status')
            .populate('quote', 'quoteNumber projectTitle lineItems total')
            .populate('client', 'name email')
            .populate('amendments.requestedBy', 'name')
            .populate('amendments.approvedBy', 'name');

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Check access - by ID or by email match
        const isAdmin = req.user.role === 'admin';
        const isClientById = contract.client?.toString() === req.user._id.toString();
        const isClientByEmail = contract.clientDetails?.email === req.user.email;
        const isClient = isClientById || isClientByEmail;

        if (!isAdmin && !isClient) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Link client ID if matched by email but not by ID
        if (isClientByEmail && !isClientById && !contract.client) {
            contract.client = req.user._id;
        }

        // Track first view
        if (isClient && !contract.viewedAt) {
            contract.viewedAt = new Date();
            await contract.save();

            // Notify admins
            await notifyAdmins(
                'contract_viewed',
                'Contract Viewed',
                `Client viewed contract ${contract.contractNumber}`,
                contract._id
            );
        }

        res.json(contract);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get client's contracts
// @route   GET /api/contracts/my-contracts
// @access  Private/Client
export const getMyContracts = async (req, res) => {
    try {
        // Find contracts either by client ID or by matching client email
        // This handles both cases: direct client registration and guest orders
        const contracts = await Contract.find({
            $or: [
                { client: req.user._id },
                { 'clientDetails.email': req.user.email }
            ],
            status: { $ne: 'draft' }
        })
            .populate('order', 'title status')
            .populate('quote', 'quoteNumber total')
            .sort({ createdAt: -1 });

        // Update contracts that don't have client ID linked but match by email
        for (const contract of contracts) {
            if (!contract.client && contract.clientDetails?.email === req.user.email) {
                contract.client = req.user._id;
                await contract.save();
            }
        }

        res.json(contracts);
    } catch (error) {
        console.error('Get My Contracts Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Client signs contract
// @route   POST /api/contracts/:id/sign
// @access  Private/Client
export const signContract = async (req, res) => {
    try {
        const { agreed, signatureData } = req.body;
        const contract = await Contract.findById(req.params.id);

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Verify client - by ID or email match
        const isClientById = contract.client?.toString() === req.user._id.toString();
        const isClientByEmail = contract.clientDetails?.email === req.user.email;

        if (!isClientById && !isClientByEmail) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Link client ID if not already linked
        if (!contract.client) {
            contract.client = req.user._id;
        }

        if (contract.status !== 'pending_signature') {
            return res.status(400).json({ message: 'Contract cannot be signed in current status' });
        }

        if (!agreed) {
            return res.status(400).json({ message: 'You must agree to the terms to sign the contract' });
        }

        // Record client signature
        contract.clientSignature = {
            signedBy: req.user._id,
            signedByName: req.user.name,
            signedByEmail: req.user.email,
            signedAt: new Date(),
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            agreed: true,
            signatureType: signatureData ? 'drawn_signature' : 'digital_acceptance',
            signatureData: signatureData || null,
        };

        contract.signedAt = new Date();

        // If both parties signed, activate contract
        if (contract.providerSignature?.agreed) {
            contract.status = 'active';
            contract.activatedAt = new Date();
        }

        await contract.save();

        // Notify admins
        await notifyAdmins(
            'contract_signed',
            'Contract Signed',
            `Client signed contract ${contract.contractNumber} for "${contract.projectDetails?.title}"`,
            contract._id,
            [
                {
                    id: 'view',
                    label: 'View Contract',
                    variant: 'primary',
                    actionType: 'navigate',
                    navigateTo: `/admin/contracts/${contract._id}`
                }
            ]
        );

        // Send confirmation email to client
        const clientEmail = contract.clientDetails?.email || req.user.email;
        if (clientEmail) {
            await sendEmail(clientEmail, 'contractSigned', {
                clientName: contract.clientDetails?.name || req.user.name,
                contractNumber: contract.contractNumber,
                projectTitle: contract.projectDetails?.title,
                contractUrl: `${process.env.FRONTEND_URL}/dashboard/client/contracts/${contract._id}`,
            });
        }

        // Update order status if contract is now active
        if (contract.status === 'active') {
            const order = await Order.findById(contract.order);
            if (order && order.status === 'started') {
                order.status = 'assigned';
                await order.save();
            }

            // Auto-generate invoices when contract becomes active
            try {
                const generatedInvoices = await generateInvoicesFromContract(contract, {
                    autoSend: contract.autoSendInvoices,
                    createdBy: null, // System generated
                });
                console.log(`Generated ${generatedInvoices.length} invoice(s) for contract ${contract.contractNumber}`);
            } catch (invoiceError) {
                console.error('Invoice generation error:', invoiceError.message);
                // Don't fail the contract signing if invoice generation fails
            }
        }

        res.json({
            message: 'Contract signed successfully',
            contract
        });
    } catch (error) {
        console.error('Sign Contract Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update contract terms (Admin)
// @route   PUT /api/contracts/:id
// @access  Private/Admin
export const updateContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Can only edit pending contracts
        if (contract.status !== 'pending_signature' && contract.status !== 'draft') {
            return res.status(400).json({ message: 'Cannot edit signed contracts. Create an amendment instead.' });
        }

        const allowedUpdates = [
            'serviceProvider', 'clientDetails', 'projectDetails',
            'financialTerms', 'timeline', 'terms'
        ];

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                contract[field] = { ...contract[field], ...req.body[field] };
            }
        });

        contract.lastModifiedBy = req.user._id;
        await contract.save();

        res.json({
            message: 'Contract updated successfully',
            contract
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Request contract amendment
// @route   POST /api/contracts/:id/amendment
// @access  Private/Client
export const requestAmendment = async (req, res) => {
    try {
        const { description, changes, previousValue, newValue } = req.body;
        const contract = await Contract.findById(req.params.id);

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Verify client - by ID or email match
        const isClientById = contract.client?.toString() === req.user._id.toString();
        const isClientByEmail = contract.clientDetails?.email === req.user.email;

        if (!isClientById && !isClientByEmail) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (contract.status !== 'active') {
            return res.status(400).json({ message: 'Amendments can only be requested for active contracts' });
        }

        const amendmentNumber = (contract.amendments?.length || 0) + 1;

        contract.amendments.push({
            amendmentNumber,
            description,
            changes,
            previousValue,
            newValue,
            requestedBy: req.user._id,
            status: 'pending',
        });

        await contract.save();

        // Notify admins
        await notifyAdmins(
            'amendment_requested',
            'Contract Amendment Requested',
            `Amendment #${amendmentNumber} requested for ${contract.contractNumber}`,
            contract._id
        );

        res.json({
            message: 'Amendment request submitted',
            amendments: contract.amendments
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Respond to amendment request
// @route   PUT /api/contracts/:id/amendment/:amendmentId
// @access  Private/Admin
export const respondToAmendment = async (req, res) => {
    try {
        const { status } = req.body;
        const { id, amendmentId } = req.params;

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        const amendment = contract.amendments.id(amendmentId);
        if (!amendment) {
            return res.status(404).json({ message: 'Amendment not found' });
        }

        amendment.status = status;
        amendment.approvedBy = req.user._id;
        amendment.approvedAt = new Date();

        if (status === 'approved') {
            contract.version += 1;
        }

        await contract.save();

        // Notify client
        await notifyUser(
            contract.client,
            'amendment_response',
            `Amendment ${status === 'approved' ? 'Approved' : 'Rejected'}`,
            `Your amendment request for ${contract.contractNumber} has been ${status}`,
            contract._id
        );

        res.json({ message: `Amendment ${status}` });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Terminate contract
// @route   POST /api/contracts/:id/terminate
// @access  Private/Admin
export const terminateContract = async (req, res) => {
    try {
        const { reason } = req.body;
        const contract = await Contract.findById(req.params.id);

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        if (contract.status !== 'active') {
            return res.status(400).json({ message: 'Only active contracts can be terminated' });
        }

        contract.status = 'terminated';
        contract.terminatedAt = new Date();
        contract.terminationReason = reason;
        contract.lastModifiedBy = req.user._id;

        await contract.save();

        // Notify client
        await notifyUser(
            contract.client,
            'contract_terminated',
            'Contract Terminated',
            `Contract ${contract.contractNumber} has been terminated. Reason: ${reason}`,
            contract._id
        );

        res.json({
            message: 'Contract terminated',
            contract
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark contract as completed
// @route   POST /api/contracts/:id/complete
// @access  Private/Admin
export const completeContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        if (contract.status !== 'active') {
            return res.status(400).json({ message: 'Only active contracts can be completed' });
        }

        contract.status = 'completed';
        contract.completedAt = new Date();
        contract.timeline.actualCompletionDate = new Date();
        contract.lastModifiedBy = req.user._id;

        await contract.save();

        // Notify client
        await notifyUser(
            contract.client,
            'contract_completed',
            'Contract Completed',
            `Contract ${contract.contractNumber} has been successfully completed. Thank you for your business!`,
            contract._id
        );

        res.json({
            message: 'Contract completed successfully',
            contract
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get contract stats
// @route   GET /api/contracts/stats
// @access  Private/Admin
export const getContractStats = async (req, res) => {
    try {
        const stats = await Contract.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$financialTerms.totalAmount' }
                }
            }
        ]);

        const totalContracts = await Contract.countDocuments();
        const activeContracts = await Contract.countDocuments({ status: 'active' });
        const pendingSignature = await Contract.countDocuments({ status: 'pending_signature' });

        res.json({
            byStatus: stats,
            total: totalContracts,
            active: activeContracts,
            pendingSignature
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
