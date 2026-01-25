import Order from '../models/Order.js';
import User from '../models/User.js';
import { createNotification, notifyClient, notifyAllAdmins } from './notificationController.js';
import { sendEmail } from '../services/emailService.js';

/**
 * Order/Assignment Controller
 * Updated for Academic Assignment Service
 */

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
export const getOrders = async (req, res) => {
    try {
        const { limit, status, urgency } = req.query;
        let query = Order.find();

        // Filter by status
        if (status) {
            query = query.where('status').equals(status);
        }

        // Filter by urgency
        if (urgency) {
            query = query.where('urgency').equals(urgency);
        }

        query = query
            .populate('assignedDeveloper', 'name email')
            .populate('assignedWorkers.worker', 'name email')
            .populate('client', 'name email')
            .sort({ deadline: 1, createdAt: -1 }); // Sort by deadline first

        if (limit) {
            query = query.limit(parseInt(limit));
        }

        const orders = await query;
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get orders for customer
// @route   GET /api/orders/customer/my-orders
// @access  Private/Client
export const getCustomerOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            $or: [
                { client: req.user._id },
                { clientEmail: { $regex: new RegExp(`^${req.user.email}$`, 'i') } }
            ]
        })
            .populate('assignedDeveloper', 'name')
            .sort({ createdAt: -1 });

        // Link orders to user that don't have client ID but match by email
        for (const order of orders) {
            if (!order.client && order.clientEmail?.toLowerCase() === req.user.email?.toLowerCase()) {
                order.client = req.user._id;
                await order.save();
            }
        }

        res.json(orders);
    } catch (error) {
        console.error('Get Customer Orders Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private (with authorization check)
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('assignedDeveloper', 'name email')
            .populate('assignedDevelopers', 'name email')
            .populate('assignedWorkers.worker', 'name email')
            .populate('quote')
            .populate('contract')
            .populate('client', 'name email');

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Authorization check
        const userId = req.user._id.toString();
        const userRole = req.user.role;

        // Admins can view any order
        if (userRole === 'admin') {
            return res.json(order);
        }

        // Clients can only view their own orders
        if (userRole === 'client') {
            const isOwner = order.client?._id?.toString() === userId ||
                            order.client?.toString() === userId ||
                            order.clientEmail?.toLowerCase() === req.user.email?.toLowerCase();
            if (!isOwner) {
                return res.status(403).json({ message: 'Not authorized to view this assignment' });
            }
            return res.json(order);
        }

        // Workers/developers can only view orders they're assigned to
        if (userRole === 'developer' || userRole === 'worker') {
            const isAssigned =
                order.assignedDeveloper?.toString() === userId ||
                order.assignedDevelopers?.some(d => d._id?.toString() === userId || d.toString() === userId) ||
                order.assignedWorkers?.some(w => w.worker?._id?.toString() === userId || w.worker?.toString() === userId);

            if (!isAssigned) {
                return res.status(403).json({ message: 'Not authorized to view this assignment' });
            }
            return res.json(order);
        }

        // Default deny
        return res.status(403).json({ message: 'Not authorized' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private/Admin
export const updateOrder = async (req, res) => {
    try {
        const { status, assignedDeveloper, progress } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (status) order.status = status;
        if (assignedDeveloper !== undefined) order.assignedDeveloper = assignedDeveloper || null;
        if (progress !== undefined) order.progress = progress;

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Create new order by customer
// @route   POST /api/orders
// @access  Private/Client
export const createOrder = async (req, res) => {
    try {
        const {
            title,
            description,
            // Academic fields
            academicLevel,
            subject,
            assignmentType,
            wordCount,
            pageCount,
            citationStyle,
            requirements,
            // Deadline & urgency
            deadline,
            urgency,
            // Legacy fields
            service,
            budget,
            clientName,
            clientEmail,
            clientPhone,
            files,
            techStack,
        } = req.body;

        // Validate required fields
        if (!title || !description || !deadline) {
            return res.status(400).json({ message: 'Title, description, and deadline are required' });
        }

        const order = await Order.create({
            title,
            description,
            // Academic fields
            academicLevel: academicLevel || 'undergraduate',
            subject: subject || 'other',
            assignmentType: assignmentType || 'other',
            wordCount,
            pageCount,
            citationStyle: citationStyle || 'none',
            requirements,
            // Deadline & urgency
            deadline,
            urgency: urgency || 'standard',
            // Client info
            client: req.user._id,
            clientName: clientName || req.user.name,
            clientEmail: clientEmail || req.user.email,
            clientPhone: clientPhone || req.user.phone || '',
            // Legacy fields
            service: service || assignmentType,
            budget,
            // Handle files - store in referenceFiles if they're objects
            referenceFiles: Array.isArray(files) ? files.filter(f => typeof f === 'object') : [],
            files: Array.isArray(files) ? files.map(f => typeof f === 'string' ? f : f.fileUrl) : [],
            // Timestamps
            submittedAt: new Date(),
        });

        const populatedOrder = await order.populate('client', 'name email');

        // Send response first, then notify admins (non-blocking)
        res.status(201).json({
            message: 'Assignment submitted successfully',
            order: populatedOrder,
            _id: order._id,
            assignmentNumber: order.assignmentNumber,
        });

        // Notify admins in background (don't await)
        notifyAllAdmins(
            'order_submitted',
            'New Assignment Submitted',
            `${clientName || req.user?.name || 'Client'} submitted: "${title}" (${assignmentType || 'Assignment'})`,
            order._id,
            'Order',
            `/admin/tasks/${order._id}`
        ).catch(err => console.error('Background notification error:', err.message));

        // Response already sent above
        return;
    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Create order for guest (public submission)
// @route   POST /api/orders/public
// @access  Public
export const createPublicOrder = async (req, res) => {
    try {
        const {
            title,
            description,
            academicLevel,
            subject,
            assignmentType,
            wordCount,
            pageCount,
            citationStyle,
            requirements,
            deadline,
            urgency,
            clientName,
            clientEmail,
            clientPhone,
            files,
        } = req.body;

        if (!title || !description || !clientName || !clientEmail || !deadline) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const order = await Order.create({
            title,
            description,
            academicLevel: academicLevel || 'undergraduate',
            subject: subject || 'other',
            assignmentType: assignmentType || 'other',
            wordCount,
            pageCount,
            citationStyle: citationStyle || 'none',
            requirements,
            deadline,
            urgency: urgency || 'standard',
            clientName,
            clientEmail,
            clientPhone: clientPhone || '',
            files: files || [],
            submittedAt: new Date(),
        });

        // Notify admins
        await notifyAllAdmins(
            'order_submitted',
            'New Guest Assignment',
            `Guest "${clientName}" submitted: "${title}"`,
            order._id,
            'Order',
            `/admin/tasks/${order._id}`
        );

        res.status(201).json({
            message: 'Assignment submitted successfully',
            order: order,
            _id: order._id,
            assignmentNumber: order.assignmentNumber,
        });
    } catch (error) {
        console.error('Create Public Order Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client accepts quote (quoted → accepted)
// @route   POST /api/orders/:id/accept-quote
// @access  Private/Client
export const acceptQuote = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Verify ownership
        if (order.client?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (order.status !== 'quoted') {
            return res.status(400).json({ message: 'Assignment must have a quote to accept' });
        }

        order.status = 'accepted';
        order.acceptedAt = new Date();

        await order.save();

        // Notify admins
        await notifyAllAdmins(
            'order_accepted',
            'Quote Accepted',
            `Client accepted quote for "${order.title}" (Rs. ${order.quotedAmount?.toLocaleString()})`,
            order._id,
            'Order',
            `/admin/tasks/${order._id}`
        );

        // Send confirmation email to client
        const clientEmail = order.clientEmail || req.user.email;
        if (clientEmail) {
            try {
                const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                await sendEmail(clientEmail, 'assignmentAccepted', {
                    clientName: order.clientName || req.user.name || 'Valued Customer',
                    assignmentTitle: order.title,
                    quotedAmount: order.quotedAmount,
                    deadline: new Date(order.deadline).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    assignmentNumber: order.assignmentNumber,
                    dashboardUrl: `${baseUrl}/dashboard/client/orders/${order._id}`,
                });
            } catch (emailError) {
                console.error('Error sending acceptance email:', emailError);
                // Don't fail the request if email fails
            }
        }

        res.json({
            message: 'Quote accepted successfully',
            order,
        });
    } catch (error) {
        console.error('Accept Quote Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client declines quote (quoted → declined)
// @route   POST /api/orders/:id/decline-quote
// @access  Private/Client
export const declineQuote = async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (order.client?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (order.status !== 'quoted') {
            return res.status(400).json({ message: 'Assignment must have a quote to decline' });
        }

        order.status = 'declined';
        order.holdReason = reason || 'Quote declined by client';

        await order.save();

        // Notify admins
        await notifyAllAdmins(
            'order_declined',
            'Quote Declined',
            `Client declined quote for "${order.title}". Reason: ${reason || 'Not specified'}`,
            order._id,
            'Order',
            `/admin/tasks/${order._id}`
        );

        res.json({
            message: 'Quote declined',
            order,
        });
    } catch (error) {
        console.error('Decline Quote Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Client requests revision
// @route   POST /api/orders/:id/revision
// @access  Private/Client
export const requestRevision = async (req, res) => {
    try {
        const { request } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (order.client?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (order.status !== 'delivered') {
            return res.status(400).json({ message: 'Can only request revision for delivered assignments' });
        }

        // Check revision limit
        if (order.revisionCount >= order.maxRevisions) {
            return res.status(400).json({
                message: `Maximum revisions (${order.maxRevisions}) reached. Please contact support.`
            });
        }

        // Add revision request
        order.revisionRequests.push({
            request,
            requestedAt: new Date(),
        });
        order.revisionCount += 1;
        order.status = 'working'; // Back to working status

        await order.save();

        // Notify admins
        await notifyAllAdmins(
            'revision_requested',
            'Revision Requested',
            `Client requested revision for "${order.title}" (${order.revisionCount}/${order.maxRevisions})`,
            order._id,
            'Order',
            `/admin/tasks/${order._id}`
        );

        // Send confirmation email to client
        const clientEmail = order.clientEmail || req.user.email;
        if (clientEmail) {
            try {
                const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                await sendEmail(clientEmail, 'revisionConfirmation', {
                    clientName: order.clientName || req.user.name || 'Valued Customer',
                    assignmentTitle: order.title,
                    revisionNumber: order.revisionCount,
                    revisionsRemaining: order.maxRevisions - order.revisionCount,
                    assignmentNumber: order.assignmentNumber,
                    dashboardUrl: `${baseUrl}/dashboard/client/orders/${order._id}`,
                });
            } catch (emailError) {
                console.error('Error sending revision confirmation email:', emailError);
            }
        }

        res.json({
            message: 'Revision requested successfully',
            order,
            revisionsRemaining: order.maxRevisions - order.revisionCount,
        });
    } catch (error) {
        console.error('Request Revision Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Upload payment proof
// @route   POST /api/orders/:id/payment-proof
// @access  Private/Client
export const uploadPaymentProof = async (req, res) => {
    try {
        const { fileName, fileUrl } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (order.client?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        order.paymentProof = {
            fileName,
            fileUrl,
            uploadedAt: new Date(),
        };
        order.paymentStatus = 'pending_verification';

        await order.save();

        // Notify admins
        await notifyAllAdmins(
            'payment_proof_uploaded',
            'Payment Proof Uploaded',
            `Payment proof uploaded for "${order.title}"`,
            order._id,
            'Order',
            `/admin/payments`
        );

        res.json({
            message: 'Payment proof uploaded successfully',
            order,
        });
    } catch (error) {
        console.error('Upload Payment Proof Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ============================================
// SUBTASK ENDPOINTS
// ============================================

// Helper: Recalculate progress from subtasks
const recalculateProgress = (subtasks) => {
    if (!subtasks || subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.status === 'completed').length;
    return Math.round((completed / subtasks.length) * 100);
};

// @desc    Add subtask to order
// @route   POST /api/orders/:id/subtasks
// @access  Private (Admin or Assigned Developer)
export const addSubtask = async (req, res) => {
    try {
        const { title, description, assignedTo, isRequired, dueDate } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Check authorization: admin or assigned developer
        const isAdmin = req.user.role === 'admin';
        const isAssigned = order.assignedDeveloper?.toString() === req.user._id.toString() ||
            order.assignedWorkers?.some(w => w.worker?.toString() === req.user._id.toString());

        if (!isAdmin && !isAssigned) {
            return res.status(403).json({ message: 'Not authorized to add subtasks' });
        }

        const subtask = {
            title,
            description,
            assignedTo: assignedTo || req.user._id,
            createdBy: req.user._id,
            isRequired: isAdmin ? (isRequired ?? true) : false, // Admin-created are required by default
            dueDate,
            status: 'pending',
            createdAt: new Date(),
        };

        order.subtasks.push(subtask);
        order.progress = recalculateProgress(order.subtasks);
        await order.save();

        res.status(201).json({
            message: 'Subtask added successfully',
            subtask: order.subtasks[order.subtasks.length - 1],
            progress: order.progress,
        });
    } catch (error) {
        console.error('Add Subtask Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update subtask
// @route   PUT /api/orders/:id/subtasks/:subtaskId
// @access  Private (Admin or Assigned Developer)
export const updateSubtask = async (req, res) => {
    try {
        const { title, description, status, assignedTo, dueDate } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const subtask = order.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            return res.status(404).json({ message: 'Subtask not found' });
        }

        // Check authorization
        const isAdmin = req.user.role === 'admin';
        const isAssigned = order.assignedDeveloper?.toString() === req.user._id.toString() ||
            order.assignedWorkers?.some(w => w.worker?.toString() === req.user._id.toString());
        const isCreator = subtask.createdBy?.toString() === req.user._id.toString();

        if (!isAdmin && !isAssigned && !isCreator) {
            return res.status(403).json({ message: 'Not authorized to update subtask' });
        }

        // Update fields
        if (title) subtask.title = title;
        if (description !== undefined) subtask.description = description;
        if (assignedTo) subtask.assignedTo = assignedTo;
        if (dueDate) subtask.dueDate = dueDate;

        if (status) {
            subtask.status = status;
            if (status === 'completed') {
                subtask.completedAt = new Date();
                subtask.progress = 100;
            } else if (status === 'in-progress' && !subtask.progress) {
                subtask.progress = 50;
            }
        }

        // Recalculate overall progress
        order.progress = recalculateProgress(order.subtasks);
        await order.save();

        res.json({
            message: 'Subtask updated successfully',
            subtask,
            progress: order.progress,
        });
    } catch (error) {
        console.error('Update Subtask Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete subtask
// @route   DELETE /api/orders/:id/subtasks/:subtaskId
// @access  Private (Admin or Creator)
export const deleteSubtask = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const subtask = order.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            return res.status(404).json({ message: 'Subtask not found' });
        }

        // Check authorization
        const isAdmin = req.user.role === 'admin';
        const isCreator = subtask.createdBy?.toString() === req.user._id.toString();

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ message: 'Not authorized to delete subtask' });
        }

        // Can't delete required subtasks unless admin
        if (subtask.isRequired && !isAdmin) {
            return res.status(403).json({ message: 'Cannot delete required subtasks' });
        }

        order.subtasks.pull(req.params.subtaskId);
        order.progress = recalculateProgress(order.subtasks);
        await order.save();

        res.json({
            message: 'Subtask deleted successfully',
            progress: order.progress,
        });
    } catch (error) {
        console.error('Delete Subtask Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ============================================
// BLOCKER ENDPOINTS
// ============================================

// @desc    Report a blocker
// @route   POST /api/orders/:id/blockers
// @access  Private (Assigned Developer)
export const addBlocker = async (req, res) => {
    try {
        const { title, description, severity } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Check authorization
        const isAdmin = req.user.role === 'admin';
        const isAssigned = order.assignedDeveloper?.toString() === req.user._id.toString() ||
            order.assignedWorkers?.some(w => w.worker?.toString() === req.user._id.toString());

        if (!isAdmin && !isAssigned) {
            return res.status(403).json({ message: 'Not authorized to report blockers' });
        }

        const blocker = {
            title,
            description,
            severity: severity || 'medium',
            reportedBy: req.user._id,
            status: 'open',
            createdAt: new Date(),
        };

        order.blockers.push(blocker);
        await order.save();

        // Notify admins about critical/high severity blockers
        if (['critical', 'high'].includes(severity)) {
            await notifyAllAdmins(
                'blocker_reported',
                `${severity.toUpperCase()} Blocker Reported`,
                `Blocker on "${order.title}": ${title}`,
                order._id,
                'Order',
                `/admin/tasks/${order._id}`
            );
        }

        res.status(201).json({
            message: 'Blocker reported successfully',
            blocker: order.blockers[order.blockers.length - 1],
        });
    } catch (error) {
        console.error('Add Blocker Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update blocker
// @route   PUT /api/orders/:id/blockers/:blockerId
// @access  Private (Admin or Reporter)
export const updateBlocker = async (req, res) => {
    try {
        const { title, description, severity, status, resolution } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const blocker = order.blockers.id(req.params.blockerId);
        if (!blocker) {
            return res.status(404).json({ message: 'Blocker not found' });
        }

        // Check authorization
        const isAdmin = req.user.role === 'admin';
        const isReporter = blocker.reportedBy?.toString() === req.user._id.toString();

        if (!isAdmin && !isReporter) {
            return res.status(403).json({ message: 'Not authorized to update blocker' });
        }

        // Update fields
        if (title) blocker.title = title;
        if (description !== undefined) blocker.description = description;
        if (severity) blocker.severity = severity;

        if (status) {
            blocker.status = status;
            if (status === 'resolved') {
                blocker.resolvedAt = new Date();
                blocker.resolvedBy = req.user._id;
                if (resolution) blocker.resolution = resolution;
            }
        }

        await order.save();

        res.json({
            message: 'Blocker updated successfully',
            blocker,
        });
    } catch (error) {
        console.error('Update Blocker Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Resolve blocker
// @route   POST /api/orders/:id/blockers/:blockerId/resolve
// @access  Private (Admin)
export const resolveBlocker = async (req, res) => {
    try {
        const { resolution } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const blocker = order.blockers.id(req.params.blockerId);
        if (!blocker) {
            return res.status(404).json({ message: 'Blocker not found' });
        }

        blocker.status = 'resolved';
        blocker.resolution = resolution;
        blocker.resolvedBy = req.user._id;
        blocker.resolvedAt = new Date();

        await order.save();

        // Notify the reporter
        if (blocker.reportedBy) {
            await createNotification(
                blocker.reportedBy,
                'blocker_resolved',
                'Blocker Resolved',
                `Your blocker "${blocker.title}" has been resolved`,
                order._id,
                'Order',
                `/developer/tasks/${order._id}`
            );
        }

        res.json({
            message: 'Blocker resolved successfully',
            blocker,
        });
    } catch (error) {
        console.error('Resolve Blocker Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete blocker
// @route   DELETE /api/orders/:id/blockers/:blockerId
// @access  Private (Admin)
export const deleteBlocker = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const blocker = order.blockers.id(req.params.blockerId);
        if (!blocker) {
            return res.status(404).json({ message: 'Blocker not found' });
        }

        // Only admin can delete
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can delete blockers' });
        }

        order.blockers.pull(req.params.blockerId);
        await order.save();

        res.json({
            message: 'Blocker deleted successfully',
        });
    } catch (error) {
        console.error('Delete Blocker Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
