import User from '../models/User.js';
import Order from '../models/Order.js';
import { Workspace } from '../models/Workspace.js';
import { createNotification } from './notificationController.js';
import { sendToUser } from '../config/socket.js';
import { sendEmail } from '../services/emailService.js';

/**
 * Admin Controller - Simplified for Academic Assignment Service
 *
 * NEW STATUS FLOW:
 * pending → quoted → accepted → working → review → delivered → completed
 *
 * Additional states: rejected, declined, cancelled
 */

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getDashboardStats = async (req, res) => {
    try {
        const totalTasks = await Order.countDocuments();

        // Working = accepted + working
        const inProgressTasks = await Order.countDocuments({
            status: { $in: ['accepted', 'working', 'review'] }
        });

        // Completed = delivered + completed
        const completedTasks = await Order.countDocuments({
            status: { $in: ['delivered', 'completed'] }
        });

        // Pending review
        const pendingTasks = await Order.countDocuments({ status: 'pending' });

        // Calculate Revenue from completed orders
        const completedOrders = await Order.find({
            status: { $in: ['delivered', 'completed'] },
            paymentStatus: 'paid'
        });
        const totalRevenue = completedOrders.reduce((acc, order) => {
            return acc + (order.quotedAmount || order.amount || 0);
        }, 0);

        // Upcoming deadlines (next 3 days)
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const urgentDeadlines = await Order.countDocuments({
            status: { $in: ['accepted', 'working'] },
            deadline: { $lte: threeDaysFromNow }
        });

        res.json({
            totalTasks,
            inProgressTasks,
            completedTasks,
            pendingTasks,
            totalRevenue,
            urgentDeadlines,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Send quote to client (pending → quoted)
// @route   PUT /api/admin/tasks/:taskId/quote
// @access  Private/Admin
export const sendQuote = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { quotedAmount } = req.body;

        if (!quotedAmount || quotedAmount <= 0) {
            return res.status(400).json({ message: 'Valid quoted amount is required' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'pending') {
            return res.status(400).json({ message: 'Assignment must be in pending status to send quote' });
        }

        task.status = 'quoted';
        task.quotedAmount = quotedAmount;
        task.quotedAt = new Date();

        const updatedTask = await task.save();

        // Notify client via in-app notification
        if (task.client) {
            await createNotification(
                task.client,
                'order_quoted',
                'Quote Ready',
                `Your assignment "${task.title}" has been quoted at Rs. ${quotedAmount.toLocaleString()}. Please review and accept to proceed.`,
                task._id,
                'Order',
                `/dashboard/client/orders/${task._id}`,
                { quotedAmount },
                [
                    {
                        id: 'view-quote',
                        label: 'View Quote',
                        variant: 'primary',
                        actionType: 'navigate',
                        endpoint: `/dashboard/client/orders/${task._id}`
                    }
                ]
            );
        }

        // Send email notification
        const clientEmail = task.clientEmail || (task.client ? (await User.findById(task.client))?.email : null);
        if (clientEmail) {
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            await sendEmail(clientEmail, 'quoteReady', {
                clientName: task.clientName || 'Valued Customer',
                assignmentTitle: task.title,
                quotedAmount: quotedAmount,
                assignmentType: task.assignmentType || 'Assignment',
                deadline: task.deadline ? new Date(task.deadline).toLocaleDateString() : 'As agreed',
                wordCount: task.wordCount,
                acceptUrl: `${baseUrl}/dashboard/client/orders/${task._id}`,
                viewUrl: `${baseUrl}/dashboard/client/orders/${task._id}`,
            });
        }

        res.json({
            message: 'Quote sent successfully',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Send Quote Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Assign workers to accepted task (accepted → working)
// @route   PUT /api/admin/tasks/:taskId/assign
// @access  Private/Admin
export const assignWorkers = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { workerIds } = req.body;

        if (!workerIds || !Array.isArray(workerIds) || workerIds.length === 0) {
            return res.status(400).json({ message: 'At least one worker must be selected' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'accepted') {
            return res.status(400).json({ message: 'Assignment must be accepted before assigning workers' });
        }

        // Verify all workers exist (can be 'developer' or 'worker' role)
        const workers = await User.find({
            _id: { $in: workerIds },
            role: { $in: ['developer', 'worker'] },
            isBanned: { $ne: true }
        });

        if (workers.length !== workerIds.length) {
            return res.status(400).json({ message: 'One or more selected workers are invalid' });
        }

        // Update task
        task.status = 'working';
        task.startedAt = new Date();
        task.assignedWorkers = workerIds.map(id => ({
            worker: id,
            assignedAt: new Date(),
            modules: [],
            progress: 0,
            isComplete: false,
        }));

        // Legacy fields for compatibility
        task.assignedDeveloper = workerIds[0];
        task.assignedDevelopers = workerIds;

        await task.save();

        // Auto-create workspace
        let workspace = null;
        try {
            const existingWorkspace = await Workspace.findOne({ task: taskId });
            if (!existingWorkspace) {
                workspace = await Workspace.create({
                    title: task.title,
                    description: task.description || `Workspace for: ${task.title}`,
                    task: taskId,
                    owner: workerIds[0],
                    collaborators: workerIds.slice(1).map(id => ({
                        user: id,
                        role: 'member',
                        addedAt: new Date()
                    })),
                    visibility: 'shared',
                    color: '#3b82f6'
                });
            }
        } catch (workspaceError) {
            console.error('Workspace creation error:', workspaceError);
        }

        // Notify all workers
        for (const workerId of workerIds) {
            try {
                await createNotification(
                    workerId,
                    'task_assigned',
                    'New Assignment',
                    `You have been assigned to: "${task.title}"`,
                    task._id,
                    'Order',
                    `/developer/tasks/${task._id}`,
                    { deadline: task.deadline },
                    [
                        {
                            id: 'view-task',
                            label: 'View Assignment',
                            variant: 'primary',
                            actionType: 'navigate',
                            endpoint: `/developer/tasks/${task._id}`
                        }
                    ]
                );
            } catch (notificationError) {
                console.error('Worker notification error:', notificationError);
            }
        }

        const populatedTask = await Order.findById(taskId)
            .populate('assignedWorkers.worker', 'name email')
            .populate('assignedDeveloper', 'name email');

        res.json({
            message: 'Workers assigned successfully',
            task: populatedTask,
            workspace: workspace ? { _id: workspace._id, title: workspace.title } : null
        });
    } catch (error) {
        console.error('Assign Workers Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Move to review (working → review)
// @route   PUT /api/admin/tasks/:taskId/review
// @access  Private/Admin
export const moveToReview = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'working') {
            return res.status(400).json({ message: 'Assignment must be in working status' });
        }

        task.status = 'review';
        task.progress = 100;

        const updatedTask = await task.save();

        res.json({
            message: 'Assignment moved to review',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Move To Review Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Deliver to client (review → delivered)
// @route   PUT /api/admin/tasks/:taskId/deliver
// @access  Private/Admin
export const deliverTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { deliveryNotes, deliverables } = req.body;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'review') {
            return res.status(400).json({ message: 'Assignment must be in review status before delivery' });
        }

        if (deliverables && deliverables.length > 0) {
            task.deliverables = deliverables.map(d => ({
                ...d,
                uploadedAt: new Date(),
                isFinal: true,
            }));
        }

        task.status = 'delivered';
        task.deliveredAt = new Date();

        const updatedTask = await task.save();

        // Notify client via in-app notification
        if (task.client) {
            await createNotification(
                task.client,
                'order_delivered',
                'Assignment Delivered!',
                `Your assignment "${task.title}" has been delivered! Download your files now.`,
                task._id,
                'Order',
                `/dashboard/client/orders/${task._id}`,
                { deliveryNotes },
                [
                    {
                        id: 'view',
                        label: 'View & Download',
                        variant: 'primary',
                        actionType: 'navigate',
                        endpoint: `/dashboard/client/orders/${task._id}`,
                    }
                ]
            );
        }

        // Send email notification
        const clientEmail = task.clientEmail || (task.client ? (await User.findById(task.client))?.email : null);
        if (clientEmail) {
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            await sendEmail(clientEmail, 'assignmentDelivered', {
                clientName: task.clientName || 'Valued Customer',
                assignmentTitle: task.title,
                downloadUrl: `${baseUrl}/dashboard/client/orders/${task._id}`,
                revisionsRemaining: (task.maxRevisions || 2) - (task.revisionCount || 0),
            });
        }

        res.json({
            message: 'Assignment delivered successfully',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Deliver Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark as completed (delivered → completed)
// @route   PUT /api/admin/tasks/:taskId/complete
// @access  Private/Admin
export const completeTask = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'delivered') {
            return res.status(400).json({ message: 'Assignment must be delivered first' });
        }

        task.status = 'completed';
        task.completedAt = new Date();

        const updatedTask = await task.save();

        res.json({
            message: 'Assignment completed',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Complete Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Reject assignment (pending → rejected)
// @route   PUT /api/admin/tasks/:taskId/reject
// @access  Private/Admin
export const rejectTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { reason } = req.body;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.status !== 'pending') {
            return res.status(400).json({ message: 'Can only reject pending assignments' });
        }

        task.status = 'rejected';
        task.holdReason = reason || 'Assignment rejected by admin';

        const updatedTask = await task.save();

        // Notify client
        if (task.client) {
            await createNotification(
                task.client,
                'task_updated',
                'Assignment Rejected',
                `Your assignment "${task.title}" has been rejected. Reason: ${reason || 'Not specified'}`,
                task._id,
                'Order',
                `/dashboard/client/orders/${task._id}`,
                { reason },
                []
            );
        }

        res.json({
            message: 'Assignment rejected',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Reject Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Verify payment
// @route   PUT /api/admin/tasks/:taskId/verify-payment
// @access  Private/Admin
export const verifyPayment = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (task.paymentStatus !== 'pending_verification') {
            return res.status(400).json({ message: 'No payment pending verification' });
        }

        task.paymentStatus = 'paid';
        task.paymentVerifiedAt = new Date();
        task.paymentVerifiedBy = req.user._id;

        const updatedTask = await task.save();

        // Notify client
        if (task.client) {
            await createNotification(
                task.client,
                'payment_verified',
                'Payment Verified',
                `Your payment for "${task.title}" has been verified.`,
                task._id,
                'Order',
                `/dashboard/client/orders/${task._id}`,
                {},
                []
            );

            sendToUser(task.client.toString(), 'payment_verified', {
                orderId: task._id,
                status: 'paid',
                verifiedAt: task.paymentVerifiedAt,
            });

            // Send email notification
            const clientEmail = task.clientEmail || (await User.findById(task.client))?.email;
            if (clientEmail) {
                const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                sendEmail(clientEmail, 'paymentVerified', {
                    clientName: task.clientName || 'Valued Customer',
                    assignmentTitle: task.title,
                    amount: task.paidAmount || task.quotedAmount || task.amount,
                    verifiedDate: new Date().toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    dashboardUrl: `${baseUrl}/dashboard/client/orders/${task._id}`,
                }).catch(err => console.error('Payment verified email error:', err.message));
            }
        }

        res.json({
            message: 'Payment verified successfully',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update progress
// @route   PUT /api/admin/tasks/:taskId/progress
// @access  Private/Admin
export const updateProgress = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { progress, note } = req.body;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (progress !== undefined) {
            task.progress = Math.min(100, Math.max(0, progress));
        }

        if (note) {
            task.progressNotes.push({
                note,
                addedBy: req.user._id,
                addedAt: new Date(),
            });
        }

        const updatedTask = await task.save();

        res.json({
            message: 'Progress updated',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Update Progress Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ============================================
// LEGACY ENDPOINTS (kept for backwards compatibility)
// ============================================

// @desc    Assign task to single developer (legacy)
export const assignTaskToDeveloper = async (req, res) => {
    const { developerId } = req.body;
    req.body.workerIds = [developerId];
    return assignWorkers(req, res);
};

// @desc    Assign task to multiple developers (legacy)
export const assignTaskToMultipleDevelopers = async (req, res) => {
    const { developerIds } = req.body;
    req.body.workerIds = developerIds;
    return assignWorkers(req, res);
};

// @desc    Initialize task (legacy - now just acknowledges)
export const initializeTask = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Just acknowledge - status stays pending until quoted
        if (task.client) {
            await createNotification(
                task.client,
                'order_initialized',
                'Assignment Received',
                `Your assignment "${task.title}" has been received. We are preparing a quote.`,
                task._id,
                'Order',
                `/dashboard/client/orders/${task._id}`,
                {},
                []
            );
        }

        res.json({
            message: 'Assignment acknowledged',
            task,
        });
    } catch (error) {
        console.error('Initialize Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Assign developers to task (legacy)
export const assignDevelopersToTask = async (req, res) => {
    const { developerIds, quotedAmount } = req.body;

    // First send quote if not already quoted
    const task = await Order.findById(req.params.taskId);
    if (task && task.status === 'pending') {
        task.status = 'quoted';
        task.quotedAmount = quotedAmount;
        task.quotedAt = new Date();
        await task.save();
    }

    // Then assign workers
    req.body.workerIds = developerIds;
    return assignWorkers(req, res);
};

// @desc    Release to client (legacy)
export const releaseToClient = async (req, res) => {
    return deliverTask(req, res);
};
