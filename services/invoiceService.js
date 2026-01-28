import Invoice from '../models/Invoice.js';
import Contract from '../models/Contract.js';
import { createNotification, notifyAllAdmins } from '../controllers/notificationController.js';
import { sendEmail } from './emailService.js';

/**
 * Generate invoices from a signed contract based on payment structure
 * @param {Object} contract - The contract document
 * @param {Object} options - Options for invoice generation
 * @param {boolean} options.autoSend - Whether to send invoices immediately
 * @param {string} options.createdBy - User ID who triggered the generation
 * @returns {Array} Array of created invoices
 */
export async function generateInvoicesFromContract(contract, options = {}) {
    const { autoSend = false, createdBy = null } = options;
    const invoices = [];

    try {
        const paymentStructure = contract.financialTerms?.paymentStructure || 'full_upfront';
        const totalAmount = contract.financialTerms?.totalAmount || 0;
        const currency = contract.financialTerms?.currency || 'NPR';
        const milestones = contract.financialTerms?.milestones || [];

        // Calculate default due date (14 days from now)
        const defaultDueDate = new Date();
        defaultDueDate.setDate(defaultDueDate.getDate() + 14);

        switch (paymentStructure) {
            case 'full_upfront': {
                // Create single invoice for full amount
                const invoice = await createInvoice({
                    contract,
                    title: `Payment for ${contract.projectDetails?.title || 'Project'}`,
                    description: 'Full payment upfront',
                    lineItems: [{
                        description: contract.projectDetails?.title || 'Project Services',
                        quantity: 1,
                        unitPrice: totalAmount,
                        amount: totalAmount,
                    }],
                    total: totalAmount,
                    currency,
                    dueDate: defaultDueDate,
                    autoSend,
                    createdBy,
                });
                invoices.push(invoice);

                // Update milestone status if exists
                if (milestones.length > 0) {
                    milestones[0].status = 'invoiced';
                    await contract.save();
                }
                break;
            }

            case '50_50': {
                // Create two invoices: 50% now, 50% on delivery
                const halfAmount = Math.round(totalAmount / 2);

                // First invoice - 50% upfront
                const firstInvoice = await createInvoice({
                    contract,
                    title: `Initial Payment (50%) - ${contract.projectDetails?.title || 'Project'}`,
                    description: '50% payment to start work',
                    lineItems: [{
                        description: 'Initial Payment (50%)',
                        quantity: 1,
                        unitPrice: halfAmount,
                        amount: halfAmount,
                    }],
                    total: halfAmount,
                    currency,
                    dueDate: defaultDueDate,
                    milestone: { title: 'Initial Payment (50%)', index: 0 },
                    autoSend,
                    createdBy,
                });
                invoices.push(firstInvoice);

                // Update first milestone status
                if (milestones.length > 0) {
                    milestones[0].status = 'invoiced';
                }

                // Second invoice - 50% on delivery (created as draft, sent later)
                const deliveryDueDate = new Date(contract.timeline?.estimatedCompletionDate || defaultDueDate);
                deliveryDueDate.setDate(deliveryDueDate.getDate() + 7); // 7 days after estimated completion

                const secondInvoice = await createInvoice({
                    contract,
                    title: `Final Payment (50%) - ${contract.projectDetails?.title || 'Project'}`,
                    description: '50% payment upon delivery',
                    lineItems: [{
                        description: 'Final Payment (50%)',
                        quantity: 1,
                        unitPrice: totalAmount - halfAmount,
                        amount: totalAmount - halfAmount,
                    }],
                    total: totalAmount - halfAmount,
                    currency,
                    dueDate: deliveryDueDate,
                    milestone: { title: 'Final Payment (50%)', index: 1 },
                    autoSend: false, // Always draft for future payment
                    createdBy,
                });
                invoices.push(secondInvoice);

                // Update second milestone status
                if (milestones.length > 1) {
                    milestones[1].status = 'invoiced';
                }

                await contract.save();
                break;
            }

            case 'milestone': {
                // Create invoice for first milestone only (others created as they're reached)
                if (milestones.length > 0) {
                    const firstMilestone = milestones[0];
                    const milestoneAmount = firstMilestone.amount || (totalAmount * firstMilestone.percentage / 100);

                    const invoice = await createInvoice({
                        contract,
                        title: `${firstMilestone.title || 'Milestone 1'} - ${contract.projectDetails?.title || 'Project'}`,
                        description: firstMilestone.description || 'Milestone payment',
                        lineItems: [{
                            description: firstMilestone.title || 'Milestone 1',
                            quantity: 1,
                            unitPrice: milestoneAmount,
                            amount: milestoneAmount,
                        }],
                        total: milestoneAmount,
                        currency,
                        dueDate: parseDueDescription(firstMilestone.dueDescription) || defaultDueDate,
                        milestone: { title: firstMilestone.title, index: 0 },
                        autoSend,
                        createdBy,
                    });
                    invoices.push(invoice);

                    // Update milestone status
                    firstMilestone.status = 'invoiced';
                    await contract.save();
                }
                break;
            }

            case 'custom': {
                // For custom payment, don't auto-generate - admin creates manually
                console.log('Custom payment structure - skipping auto-generation');
                break;
            }

            default:
                console.log(`Unknown payment structure: ${paymentStructure}`);
        }

        // Notify admins about generated invoices
        if (invoices.length > 0) {
            await notifyAllAdmins(
                'invoice_generated',
                'Invoices Generated',
                `${invoices.length} invoice(s) created for contract ${contract.contractNumber}`,
                contract._id,
                'Contract',
                `/admin/invoices`
            );
        }

        return invoices;
    } catch (error) {
        console.error('Invoice Generation Error:', error);
        throw error;
    }
}

/**
 * Create a single invoice
 */
async function createInvoice({
    contract,
    title,
    description,
    lineItems,
    total,
    currency,
    dueDate,
    milestone,
    autoSend,
    createdBy,
}) {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

    const invoice = await Invoice.create({
        contract: contract._id,
        order: contract.order,
        client: contract.client,
        clientDetails: contract.clientDetails,
        title,
        description,
        lineItems,
        subtotal,
        taxRate: 0,
        taxAmount: 0,
        discountAmount: 0,
        total,
        currency,
        dueDate,
        milestone,
        status: autoSend ? 'sent' : 'draft',
        sentAt: autoSend ? new Date() : null,
        createdBy,
    });

    // If auto-send, notify client and send email
    if (autoSend && contract.client) {
        await createNotification(
            contract.client,
            'payment_due',
            'Invoice Received',
            `Invoice ${invoice.invoiceNumber} for ${currency} ${total.toLocaleString()} is due on ${new Date(dueDate).toLocaleDateString()}`,
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

        // Send email
        const clientEmail = contract.clientDetails?.email;
        if (clientEmail) {
            try {
                await sendEmail(clientEmail, 'invoiceGenerated', {
                    clientName: contract.clientDetails?.name,
                    invoiceNumber: invoice.invoiceNumber,
                    description: title,
                    currency,
                    amount: total,
                    dueDate: new Date(dueDate).toLocaleDateString(),
                    paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/client/payment`,
                });
            } catch (emailError) {
                console.error('Invoice email error:', emailError.message);
            }
        }
    }

    return invoice;
}

/**
 * Parse due description to a date
 * e.g., "Upon signing", "Within 7 days", "Upon delivery"
 */
function parseDueDescription(description) {
    if (!description) return null;

    const lower = description.toLowerCase();
    const now = new Date();

    if (lower.includes('upon signing') || lower.includes('immediately')) {
        // Due in 3 days
        now.setDate(now.getDate() + 3);
        return now;
    }

    if (lower.includes('upon delivery') || lower.includes('on delivery')) {
        // Due in 30 days (approximate delivery time)
        now.setDate(now.getDate() + 30);
        return now;
    }

    // Try to parse "within X days"
    const daysMatch = lower.match(/within\s+(\d+)\s+days?/);
    if (daysMatch) {
        now.setDate(now.getDate() + parseInt(daysMatch[1]));
        return now;
    }

    // Try to parse "within X weeks"
    const weeksMatch = lower.match(/within\s+(\d+)\s+weeks?/);
    if (weeksMatch) {
        now.setDate(now.getDate() + parseInt(weeksMatch[1]) * 7);
        return now;
    }

    // Default: 14 days
    now.setDate(now.getDate() + 14);
    return now;
}

/**
 * Generate invoice for a specific milestone
 * Called when a milestone is reached during project execution
 */
export async function generateMilestoneInvoice(contractId, milestoneIndex, options = {}) {
    try {
        const contract = await Contract.findById(contractId);
        if (!contract) {
            throw new Error('Contract not found');
        }

        const milestones = contract.financialTerms?.milestones || [];
        if (milestoneIndex >= milestones.length) {
            throw new Error('Invalid milestone index');
        }

        const milestone = milestones[milestoneIndex];
        if (milestone.status === 'invoiced' || milestone.status === 'paid') {
            throw new Error('Milestone already invoiced or paid');
        }

        const totalAmount = contract.financialTerms?.totalAmount || 0;
        const currency = contract.financialTerms?.currency || 'NPR';
        const milestoneAmount = milestone.amount || (totalAmount * milestone.percentage / 100);

        const invoice = await createInvoice({
            contract,
            title: `${milestone.title || `Milestone ${milestoneIndex + 1}`} - ${contract.projectDetails?.title || 'Project'}`,
            description: milestone.description || 'Milestone payment',
            lineItems: [{
                description: milestone.title || `Milestone ${milestoneIndex + 1}`,
                quantity: 1,
                unitPrice: milestoneAmount,
                amount: milestoneAmount,
            }],
            total: milestoneAmount,
            currency,
            dueDate: parseDueDescription(milestone.dueDescription),
            milestone: { title: milestone.title, index: milestoneIndex },
            autoSend: options.autoSend ?? contract.autoSendInvoices,
            createdBy: options.createdBy,
        });

        // Update milestone status
        milestone.status = 'invoiced';
        await contract.save();

        return invoice;
    } catch (error) {
        console.error('Generate Milestone Invoice Error:', error);
        throw error;
    }
}

/**
 * Update contract milestone status when invoice is paid
 */
export async function updateMilestonePaymentStatus(invoiceId) {
    try {
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice || !invoice.contract || !invoice.milestone) {
            return;
        }

        const contract = await Contract.findById(invoice.contract);
        if (!contract) {
            return;
        }

        const milestoneIndex = invoice.milestone.index;
        if (milestoneIndex !== undefined && contract.financialTerms?.milestones?.[milestoneIndex]) {
            contract.financialTerms.milestones[milestoneIndex].status = 'paid';
            contract.financialTerms.milestones[milestoneIndex].paidAt = new Date();
            await contract.save();
        }
    } catch (error) {
        console.error('Update Milestone Payment Status Error:', error);
    }
}

export default {
    generateInvoicesFromContract,
    generateMilestoneInvoice,
    updateMilestonePaymentStatus,
};
