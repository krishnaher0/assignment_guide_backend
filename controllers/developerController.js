import Order from '../models/Order.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';

// @desc    Get worker dashboard stats
// @route   GET /api/developer/stats
// @access  Private/Developer (Worker)
const getDeveloperStats = async (req, res) => {
    try {
        // Query to check all assignment fields (legacy and new)
        const assignmentQuery = {
            $or: [
                { assignedDeveloper: req.user._id },
                { 'assignedWorkers.worker': req.user._id },
                { team: { $elemMatch: { developer: req.user._id, status: 'active' } } },
                { assignedDevelopers: req.user._id }
            ]
        };

        // Count tasks where user is assigned
        const activeTasks = await Order.countDocuments({
            ...assignmentQuery,
            status: { $in: ['accepted', 'working', 'review'] }
        });

        const completedTasks = await Order.countDocuments({
            ...assignmentQuery,
            status: { $in: ['delivered', 'completed'] }
        });

        // Urgent deadlines (within 3 days)
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const urgentDeadlines = await Order.countDocuments({
            ...assignmentQuery,
            status: { $in: ['accepted', 'working', 'review'] },
            deadline: { $lte: threeDaysFromNow }
        });

        res.json({
            activeTasks,
            completedTasks,
            urgentDeadlines,
            // Removed: earnings, rating (workers paid externally)
        });
    } catch (error) {
        console.error('Get Developer Stats Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get tasks assigned to worker
// @route   GET /api/developer/tasks
// @access  Private/Developer (Worker)
const getDeveloperTasks = async (req, res) => {
    try {
        const { status } = req.query;

        console.log('getDeveloperTasks called for user:', req.user._id, 'status filter:', status);

        // Build query - check all assignment fields (legacy and new)
        const query = {
            $or: [
                { assignedDeveloper: req.user._id },
                { 'assignedWorkers.worker': req.user._id },
                { team: { $elemMatch: { developer: req.user._id, status: 'active' } } },
                { assignedDevelopers: req.user._id }
            ]
        };

        // Filter by status if provided
        if (status && status !== 'all') {
            // Handle comma-separated statuses
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        } else if (!status) {
            // Default: show active tasks (accepted, working, review)
            query.status = { $in: ['accepted', 'working', 'review'] };
        }
        // If status === 'all', don't add status filter (show all tasks)

        console.log('Query:', JSON.stringify(query, null, 2));

        const tasks = await Order.find(query)
            .select('title description status progress deadline urgency academicLevel subject assignmentType assignedWorkers team createdAt')
            .populate('team.developer', 'name email')
            .sort({ deadline: 1, createdAt: -1 }); // Sort by deadline first

        console.log('Found tasks:', tasks.length);

        res.json(tasks);
    } catch (error) {
        console.error('Get Developer Tasks Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get developer profile
// @route   GET /api/developer/profile
// @access  Private/Developer
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            bio: user.bio,
            phone: user.phone,
            location: user.location,
            expertise: user.expertise,
            hourlyRate: user.hourlyRate,
            skills: user.skills,
            earnings: user.earnings,
            status: user.status,
            createdAt: user.createdAt,
            profileImage: user.profileImage,
        });
    } catch (error) {
        console.error('Get Profile Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update developer profile
// @route   PUT /api/developer/profile
// @access  Private/Developer
const updateProfile = async (req, res) => {
    try {
        // Note: hourlyRate is NOT included - only admin can set it
        const { name, bio, phone, location, expertise, skills, paymentInfo } = req.body;

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update allowed fields (hourlyRate excluded - set by admin only)
        if (name) user.name = name;
        if (bio !== undefined) user.bio = bio;
        if (phone !== undefined) user.phone = phone;
        if (location !== undefined) user.location = location;
        if (expertise) user.expertise = expertise;
        if (skills) user.skills = skills;
        if (paymentInfo) user.paymentInfo = paymentInfo;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            bio: updatedUser.bio,
            phone: updatedUser.phone,
            location: updatedUser.location,
            expertise: updatedUser.expertise,
            hourlyRate: updatedUser.hourlyRate,
            skills: updatedUser.skills,
            earnings: updatedUser.earnings,
            status: updatedUser.status,
            createdAt: updatedUser.createdAt,
            message: 'Profile updated successfully',
        });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update task progress
// @route   PUT /api/developer/tasks/:taskId/progress
// @access  Private/Developer
const updateTaskProgress = async (req, res) => {
    try {
        const { progress, progressNotes, status } = req.body;
        const { taskId } = req.params;

        const task = await Order.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Verify developer is assigned to this task
        if (task.assignedDeveloper.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this task' });
        }

        // Update progress
        if (progress !== undefined) {
            task.progress = Math.min(100, Math.max(0, progress));
        }

        // Add progress note
        if (progressNotes) {
            task.progressNotes.push({
                developerName: req.user.name,
                percentage: task.progress,
                notes: progressNotes,
                updatedAt: new Date(),
            });
        }

        // Update status
        if (status && ['assigned', 'in-progress', 'in-review', 'completed'].includes(status)) {
            task.status = status;
        }

        const updatedTask = await task.save();

        res.json({
            message: 'Task progress updated',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Update Task Progress Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update task status (worker can only move to review)
// @route   PUT /api/developer/tasks/:taskId/status
// @access  Private/Developer (Worker)
const updateTaskStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;
        const { taskId } = req.params;

        // Workers can only submit for review
        if (status !== 'review') {
            return res.status(400).json({
                message: 'Workers can only submit tasks for review'
            });
        }

        const task = await Order.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Verify worker is assigned to this task
        const isAssigned = task.assignedDeveloper?.toString() === req.user._id.toString() ||
            task.assignedWorkers?.some(w => w.worker.toString() === req.user._id.toString());

        if (!isAssigned) {
            return res.status(403).json({ message: 'Not authorized to update this task' });
        }

        // Can only submit for review if currently working
        if (task.status !== 'working') {
            return res.status(400).json({ message: 'Task must be in working status to submit for review' });
        }

        task.status = 'review';
        task.progress = 100;

        // Add progress note
        if (notes) {
            task.progressNotes.push({
                note: `Submitted for review: ${notes}`,
                addedBy: req.user._id,
                addedAt: new Date(),
            });
        }

        const updatedTask = await task.save();

        // Notify admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'task_review',
                'Task Ready for Review',
                `${req.user.name} submitted "${task.title}" for review`,
                task._id,
                'Order',
                `/admin/tasks/${task._id}`,
                { workerName: req.user.name },
                [
                    {
                        id: 'review',
                        label: 'Review & Deliver',
                        variant: 'primary',
                        actionType: 'navigate',
                        endpoint: `/admin/tasks/${task._id}`,
                    }
                ]
            );
        }

        res.json({
            message: 'Task submitted for review',
            task: updatedTask,
        });
    } catch (error) {
        console.error('Update Task Status Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Release task (developer marks their part as complete)
// @route   PUT /api/developer/tasks/:taskId/release
// @access  Private/Developer
const releaseTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { deliverables, notes } = req.body;

        const task = await Order.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Verify developer is assigned to this task
        const isAssigned = task.assignedDeveloper?.toString() === req.user._id.toString() ||
            task.assignedDevelopers?.some(d => d.toString() === req.user._id.toString());

        if (!isAssigned) {
            return res.status(403).json({ message: 'Not authorized to release this task' });
        }

        // Check if already released
        const alreadyReleased = task.developerReleases?.some(
            r => r.developer.toString() === req.user._id.toString()
        );

        if (alreadyReleased) {
            return res.status(400).json({ message: 'You have already released this task' });
        }

        // Add developer release
        if (!task.developerReleases) {
            task.developerReleases = [];
        }

        task.developerReleases.push({
            developer: req.user._id,
            releasedAt: new Date(),
            deliverables: deliverables || [],
            notes: notes || '',
        });

        // Check if all developers have released (for multi-dev projects)
        const assignedDevCount = task.assignedDevelopers?.length || 1;
        const releasedCount = task.developerReleases.length;

        if (releasedCount >= assignedDevCount) {
            // All developers have released - move to released-to-admin
            task.status = 'released-to-admin';

            // Notify admins
            const admins = await User.find({ role: 'admin' });
            for (const admin of admins) {
                await createNotification(
                    admin._id,
                    'released_to_admin',
                    'Task Ready for Review',
                    `All developers have released task "${task.title}". Ready for client delivery.`,
                    task._id,
                    'Order',
                    `/admin/tasks/${task._id}`,
                    {},
                    [
                        {
                            id: 'release',
                            label: 'Release to Client',
                            variant: 'success',
                            actionType: 'api',
                            endpoint: `/admin/tasks/${task._id}/release-to-client`,
                            method: 'PUT',
                            confirmMessage: 'Release this task to the client?'
                        }
                    ]
                );
            }
        } else {
            // Notify other developers that one dev has released
            const otherDevs = task.assignedDevelopers?.filter(
                d => d.toString() !== req.user._id.toString()
            ) || [];

            for (const devId of otherDevs) {
                const hasReleased = task.developerReleases.some(
                    r => r.developer.toString() === devId.toString()
                );

                if (!hasReleased) {
                    await createNotification(
                        devId,
                        'release_required',
                        'Teammate Released Task',
                        `${req.user.name} has released their part of "${task.title}". Please complete and release your work.`,
                        task._id,
                        'Order',
                        `/developer/tasks/${task._id}`,
                        { releasedBy: req.user.name },
                        [
                            {
                                id: 'release',
                                label: 'Release My Work',
                                variant: 'primary',
                                actionType: 'navigate',
                                endpoint: `/developer/tasks/${task._id}`,
                            }
                        ]
                    );
                }
            }
        }

        const updatedTask = await task.save();

        res.json({
            message: 'Task released successfully',
            task: updatedTask,
            allReleased: releasedCount >= assignedDevCount,
        });
    } catch (error) {
        console.error('Release Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get task release status
// @route   GET /api/developer/tasks/:taskId/release-status
// @access  Private/Developer
const getTaskReleaseStatus = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId)
            .populate('assignedDevelopers', 'name email')
            .populate('developerReleases.developer', 'name email');

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        const assignedDevCount = task.assignedDevelopers?.length || 1;
        const releases = task.developerReleases || [];

        const releaseStatus = {
            totalDevelopers: assignedDevCount,
            releasedCount: releases.length,
            allReleased: releases.length >= assignedDevCount,
            developers: task.assignedDevelopers?.map(dev => {
                const release = releases.find(r => r.developer._id.toString() === dev._id.toString());
                return {
                    developer: dev,
                    released: !!release,
                    releasedAt: release?.releasedAt,
                    deliverables: release?.deliverables || [],
                    notes: release?.notes,
                };
            }) || [],
        };

        res.json(releaseStatus);
    } catch (error) {
        console.error('Get Release Status Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update developer status (online/offline/busy)
// @route   PUT /api/developer/status
// @access  Private/Developer
const updateStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['online', 'offline', 'busy'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be online, offline, or busy' });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.status = status;
        if (status === 'online') {
            user.lastSeenAt = new Date();
        }

        await user.save();

        res.json({
            message: 'Status updated successfully',
            status: user.status,
        });
    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Upload deliverables to a task
// @route   POST /api/developer/tasks/:taskId/deliverables
// @access  Private/Developer (Worker)
const uploadDeliverables = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { deliverables, notes } = req.body;

        if (!deliverables || !Array.isArray(deliverables) || deliverables.length === 0) {
            return res.status(400).json({ message: 'At least one deliverable file is required' });
        }

        const task = await Order.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Verify worker is assigned to this task
        const isAssigned = task.assignedDeveloper?.toString() === req.user._id.toString() ||
            task.assignedWorkers?.some(w => w.worker.toString() === req.user._id.toString());

        if (!isAssigned) {
            return res.status(403).json({ message: 'Not authorized to upload to this task' });
        }

        // Can only upload if task is in working or review status
        if (!['working', 'review'].includes(task.status)) {
            return res.status(400).json({ message: 'Can only upload deliverables for tasks in working or review status' });
        }

        // Calculate next version number
        const maxVersion = task.deliverables?.reduce((max, d) => Math.max(max, d.version || 1), 0) || 0;

        // Add deliverables
        const newDeliverables = deliverables.map((d, index) => ({
            fileName: d.fileName,
            fileUrl: d.fileUrl,
            uploadedAt: new Date(),
            uploadedBy: req.user._id,
            version: maxVersion + 1,
            isFinal: false, // Only admin marks as final
        }));

        if (!task.deliverables) {
            task.deliverables = [];
        }
        task.deliverables.push(...newDeliverables);

        // Add progress note
        if (notes) {
            task.progressNotes.push({
                note: `Uploaded ${deliverables.length} file(s): ${notes}`,
                addedBy: req.user._id,
                addedAt: new Date(),
            });
        }

        const updatedTask = await task.save();

        // Notify admins of new uploads
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'deliverables_uploaded',
                'New Files Uploaded',
                `${req.user.name} uploaded ${deliverables.length} file(s) for "${task.title}"`,
                task._id,
                'Order',
                `/admin/tasks/${task._id}`,
                { workerName: req.user.name, fileCount: deliverables.length },
                []
            );
        }

        res.json({
            message: 'Deliverables uploaded successfully',
            deliverables: newDeliverables,
            task: updatedTask,
        });
    } catch (error) {
        console.error('Upload Deliverables Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

export {
    getDeveloperStats,
    getDeveloperTasks,
    getProfile,
    updateProfile,
    updateStatus,
    updateTaskProgress,
    updateTaskStatus,
    releaseTask,
    getTaskReleaseStatus,
    uploadDeliverables
};
