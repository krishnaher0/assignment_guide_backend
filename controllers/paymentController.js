import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import Order from '../models/Order.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { createNotification } from './notificationController.js';
import { sendToRole, sendToUser } from '../config/socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Upload payment proof screenshot
// @route   POST /api/payment/upload-proof
// @access  Private (Client)
export const uploadPaymentProof = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, '../uploads/payment-proofs');
        await fs.mkdir(uploadsDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const filename = `proof-${req.user._id}-${timestamp}${ext}`;
        const filepath = path.join(uploadsDir, filename);

        // Save file
        await fs.writeFile(filepath, req.file.buffer);

        // Return full URL (same pattern as QR code upload)
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host');
        const url = `${protocol}://${host}/uploads/payment-proofs/${filename}`;

        res.json({
            message: 'Payment proof uploaded successfully',
            url,
        });
    } catch (error) {
        console.error('Upload Payment Proof Error:', error);
        res.status(500).json({ message: 'Failed to upload payment proof', error: error.message });
    }
};

// @desc    Generate payment receipt
// @route   POST /api/payment/generate-receipt
// @access  Private
export const generateReceipt = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId).populate('client', 'name email phone');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Verify user has access to this order
        if (order.client && order.client._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Generate receipt data
        const receipt = {
            receiptId: `RCP-${order._id.toString().slice(-8).toUpperCase()}-${Date.now()}`,
            date: new Date().toISOString(),
            order: {
                id: order._id,
                title: order.title,
                description: order.description,
                amount: order.paidAmount || order.amount,
                quotedAmount: order.quotedAmount,
            },
            client: {
                name: order.clientName || order.client?.name,
                email: order.clientEmail || order.client?.email,
                phone: order.clientPhone || order.client?.phone,
            },
            payment: {
                method: order.paymentMethod || 'eSewa',
                transactionId: order.transactionId,
                status: order.paymentStatus,
                paidAt: order.paidAt || order.updatedAt,
            },
        };

        res.json({
            message: 'Receipt generated',
            receipt,
        });
    } catch (error) {
        console.error('Generate Receipt Error:', error);
        res.status(500).json({ message: 'Failed to generate receipt', error: error.message });
    }
};

// eSewa Sandbox Config
const ESEWA_TEST_URL = "https://rc-epay.esewa.com.np/api/epay/main/v2/form";
const ESEWA_MERCHANT_CODE = "EPAYTEST";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// @desc    Initiate Payment
// @route   POST /api/payment/initiate
// @access  Private (Client)
export const initiatePayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;

        // In real app, verify order belongs to user and amount matches
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const transactionUuid = `${orderId}-${Date.now()}`;
        const productCode = ESEWA_MERCHANT_CODE;
        const totalAmount = amount; // Needs to include tax etc if applicable, using flat for now

        // Signature Generation for eSewa v2
        // Message format: total_amount,transaction_uuid,product_code
        const signatureString = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
        const secretKey = process.env.ESEWA_SECRET_KEY;

        if (!secretKey) {
            return res.status(500).json({ message: 'Payment gateway not configured properly' });
        }

        const signature = crypto.createHmac('sha256', secretKey).update(signatureString).digest('base64');

        // Store transaction UUID in order for verification
        order.transactionUuid = transactionUuid;
        await order.save();

        // Log payment initiation
        await AuditLog.create({
            userId: req.user._id,
            action: 'payment_initiated',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'medium',
            details: {
                orderId: order._id,
                amount: totalAmount,
                transactionUuid: transactionUuid,
                paymentMethod: 'esewa'
            }
        });

        res.json({
            url: ESEWA_TEST_URL,
            params: {
                amount: amount,
                tax_amount: 0,
                total_amount: totalAmount,
                transaction_uuid: transactionUuid,
                product_code: productCode,
                product_service_charge: 0,
                product_delivery_charge: 0,
                success_url: `${CLIENT_URL}/dashboard/client/payment?orderId=${orderId}&status=success&data=`,
                failure_url: `${CLIENT_URL}/dashboard/client/payment?orderId=${orderId}&status=failure`,
                signed_field_names: "total_amount,transaction_uuid,product_code",
                signature: signature,
            }
        });
    } catch (error) {
        console.error('Payment Initiation Error:', error);

        // Log failed payment initiation
        await AuditLog.create({
            userId: req.user?._id,
            action: 'payment_initiation_failed',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'failure',
            severity: 'medium',
            details: {
                orderId: req.body.orderId,
                error: error.message
            }
        });

        res.status(500).json({ message: 'Payment Initiation Failed', error: error.message });
    }
};

// @desc    Verify Payment (Callback from Frontend passing eSewa response)
// @route   POST /api/payment/verify
// @access  Private
export const verifyPayment = async (req, res) => {
    try {
        const { encodedResponse, orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ message: 'Order ID is required' });
        }

        if (!encodedResponse) {
            return res.status(400).json({ message: 'Payment response data is required' });
        }

        const order = await Order.findById(orderId).populate('assignedDeveloper');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Prevent duplicate payment verification
        if (order.paymentStatus === 'paid') {
            return res.status(400).json({ message: 'Payment already verified for this order' });
        }

        // Decode the base64 encoded JSON response
        let responseData;
        try {
            // Strip the ?data= prefix if present
            const cleanedResponse = encodedResponse.startsWith('?data=')
                ? encodedResponse.substring(6)
                : encodedResponse;

            const decodedString = Buffer.from(cleanedResponse, 'base64').toString('utf-8');
            responseData = JSON.parse(decodedString);
        } catch (decodeError) {
            console.error('Failed to decode payment response:', decodeError.message);
            return res.status(400).json({
                message: 'Invalid payment response format',
                error: 'Unable to decode payment data'
            });
        }

        // Verify payment status
        if (responseData.status !== 'COMPLETE') {
            order.paymentStatus = 'failed';
            await order.save();
            return res.status(400).json({ message: 'Payment failed or cancelled' });
        }

        // Verify signature for security
        const secretKey = process.env.ESEWA_SECRET_KEY;
        if (!secretKey) {
            return res.status(500).json({ message: 'Payment gateway not configured properly' });
        }

        // Reconstruct the signature string using the response data
        const { transaction_code, total_amount, transaction_uuid, product_code } = responseData;
        const signatureString = `transaction_code=${transaction_code},status=${responseData.status},total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code},signed_field_names=transaction_code,status,total_amount,transaction_uuid,product_code`;

        // Calculate expected signature
        const expectedSignature = crypto.createHmac('sha256', secretKey)
            .update(signatureString)
            .digest('base64');

        // Verify signature matches
        if (responseData.signature !== expectedSignature) {
            console.error('Signature mismatch!');
            console.error('Expected:', expectedSignature);
            console.error('Received:', responseData.signature);
            return res.status(400).json({
                message: 'Payment verification failed',
                error: 'Invalid signature'
            });
        }

        // Verify the transaction UUID matches the order
        if (responseData.transaction_uuid !== order.transactionUuid) {
            return res.status(400).json({
                message: 'Transaction UUID mismatch',
                error: 'Payment does not match order'
            });
        }

        // Update order with payment details
        order.paymentStatus = 'paid';
        order.status = 'delivered';
        order.paidAmount = responseData.total_amount;
        order.transactionId = responseData.transaction_code;
        order.paidAt = new Date();

        // Update developer earnings
        if (order.assignedDeveloper) {
            const developer = await User.findById(order.assignedDeveloper._id);
            if (developer) {
                // Parse budget to get numeric value
                const budgetAmount = parseFloat(order.budget.replace(/[^0-9.-]+/g, ""));
                if (!isNaN(budgetAmount)) {
                    developer.earnings += budgetAmount;
                    await developer.save();
                }
            }
        }

        await order.save();

        // Log successful payment verification to audit trail
        await AuditLog.create({
            userId: order.client,
            action: 'payment_verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            severity: 'high',
            details: {
                orderId: order._id,
                transactionId: responseData.transaction_code,
                amount: responseData.total_amount,
                paymentMethod: 'esewa'
            }
        });

        res.json({
            message: 'Payment verified and order delivered',
            order: order
        });

    } catch (error) {
        console.error('Payment Verification Error:', error);

        // Log failed payment verification
        if (req.body.orderId) {
            await AuditLog.create({
                userId: req.user?._id,
                action: 'payment_verification_failed',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                status: 'failure',
                severity: 'high',
                details: {
                    orderId: req.body.orderId,
                    error: error.message
                }
            });
        }

        res.status(500).json({ message: 'Payment Verification Failed', error: error.message });
    }
};

// @desc    Get payment status for order
// @route   GET /api/payment/:orderId
// @access  Private
export const getPaymentStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json({
            orderId: order._id,
            paymentStatus: order.paymentStatus,
            paidAmount: order.paidAmount,
            totalAmount: order.budget,
            transactionId: order.transactionId,
            orderStatus: order.status,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Submit QR payment with proof screenshot
// @route   POST /api/payment/qr-submit
// @access  Private (Client)
export const submitQRPayment = async (req, res) => {
    try {
        const { orderId, paymentProofUrl, notes } = req.body;

        if (!orderId || !paymentProofUrl) {
            return res.status(400).json({ message: 'Order ID and payment proof are required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Verify client owns this order
        if (order.client && order.client.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to submit payment for this order' });
        }

        // Update order with QR payment proof
        // Status stays 'accepted', paymentStatus becomes 'pending_verification'
        order.qrPaymentProof = paymentProofUrl;
        order.qrPaymentSubmittedAt = new Date();
        order.paymentMethod = 'qr';
        order.paymentStatus = 'pending_verification';
        // Don't change order.status - it stays 'accepted' until admin verifies payment
        order.paidAmount = order.quotedAmount || order.amount;

        if (notes) {
            order.progressNotes.push({
                developerName: 'Client',
                percentage: order.progress,
                notes: `Payment submitted via QR: ${notes}`,
                updatedAt: new Date(),
            });
        }

        const updatedOrder = await order.save();

        // Notify admins with verify/reject actions
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'qr_payment_submitted',
                'QR Payment Submitted',
                `Client submitted QR payment proof for "${order.title}". Please verify.`,
                order._id,
                'Order',
                '/admin/payments',
                { paymentProofUrl }
            );
        }

        // Emit real-time event to admins with payment details
        sendToRole('admin', 'qr_payment_submitted', {
            orderId: order._id,
            orderTitle: order.title,
            amount: order.paidAmount,
            clientName: order.clientName,
            paymentProofUrl: paymentProofUrl,
            notes: notes,
            submittedAt: order.qrPaymentSubmittedAt,
            clientId: order.client,
        });

        res.json({
            message: 'Payment proof submitted successfully. Awaiting verification.',
            order: updatedOrder,
        });
    } catch (error) {
        console.error('QR Payment Submit Error:', error);
        res.status(500).json({ message: 'Failed to submit payment', error: error.message });
    }
};

// @desc    Reject QR payment proof
// @route   PUT /api/payment/:orderId/reject-qr
// @access  Private (Admin)
export const rejectQRPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Reset payment status
        order.paymentStatus = 'pending';
        order.status = 'completed'; // Back to completed, awaiting new payment
        order.qrPaymentProof = null;
        order.qrPaymentSubmittedAt = null;

        order.progressNotes.push({
            developerName: 'Admin',
            percentage: order.progress,
            notes: `QR payment rejected: ${reason || 'Invalid payment proof'}`,
            updatedAt: new Date(),
        });

        const updatedOrder = await order.save();

        // Notify client
        if (order.client) {
            try {
                await createNotification(
                    order.client,
                    'payment_pending',
                    'Payment Rejected',
                    `Your payment proof for "${order.title}" was rejected. Reason: ${reason || 'Invalid payment proof'}. Please submit a valid payment.`,
                    order._id,
                    'Order',
                    `/dashboard/client/orders/${order._id}`,
                    { reason },
                    [
                        {
                            id: 'retry',
                            label: 'Submit New Payment',
                            variant: 'primary',
                            actionType: 'navigate',
                            endpoint: `/dashboard/client/orders/${order._id}/payment`,
                        }
                    ]
                );
            } catch (notificationError) {
                console.error('Notification error (non-fatal):', notificationError);
                // Continue anyway
            }
        }

        res.json({
            message: 'QR payment rejected',
            order: updatedOrder,
        });
    } catch (error) {
        console.error('Reject QR Payment Error:', error);
        res.status(500).json({ message: 'Failed to reject payment', error: error.message });
    }
};
