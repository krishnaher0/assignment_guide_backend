import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';

const ROLE_LABELS = {
    lead: 'Lead Developer',
    senior: 'Senior Developer',
    developer: 'Developer',
    qa: 'QA Engineer',
    support: 'Support/Documentation',
};

// Helper: Get team member
const getTeamMember = (task, developerId) => {
    if (!task?.team || !developerId) return null;
    return task.team.find(m => m.developer?.toString() === developerId.toString());
};

// Helper: Check if user is lead
const isLeadDeveloper = (task, userId) => {
    if (!task?.assignedDeveloper || !userId) return false;
    return task.assignedDeveloper.toString() === userId.toString();
};

// Helper: Notify team
const notifyTeamMember = async (developerId, type, title, message, taskId, actions = []) => {
    await createNotification(
        developerId,
        type,
        title,
        message,
        taskId,
        'Order',
        `/developer/tasks/${taskId}`,
        {},
        actions
    );
};

// @desc    Get team details for a task
// @route   GET /api/team/:taskId
// @access  Private (Developer assigned to task or Admin)
export const getTeamDetails = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await Order.findById(taskId)
            .populate('team.developer', 'name email profileImage skills expertise rating')
            .populate('assignedDeveloper', 'name email profileImage')
            .populate('teamRequests.requestedBy', 'name email');

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check access - must be admin or assigned to task
        const isAdmin = req.user.role === 'admin';
        const isTeamMember = task.assignedDevelopers?.some(d => d.toString() === req.user._id.toString());

        if (!isAdmin && !isTeamMember) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Calculate team statistics
        const teamArray = task.team || [];
        const activeMembers = teamArray.filter(m => m.status === 'active');
        const teamProgress = activeMembers.length > 0
            ? Math.round(activeMembers.reduce((sum, m) => sum + (m.individualProgress || 0), 0) / activeMembers.length)
            : 0;

        const teamRequests = task.teamRequests || [];

        res.json({
            taskId: task._id,
            taskTitle: task.title,
            taskStatus: task.status,
            leadDeveloper: task.assignedDeveloper,
            team: teamArray,
            teamRequests: teamRequests.filter(r => r.status === 'pending'),
            statistics: {
                totalMembers: activeMembers.length,
                teamProgress,
                byRole: {
                    lead: activeMembers.filter(m => m.role === 'lead').length,
                    senior: activeMembers.filter(m => m.role === 'senior').length,
                    developer: activeMembers.filter(m => m.role === 'developer').length,
                    qa: activeMembers.filter(m => m.role === 'qa').length,
                    support: activeMembers.filter(m => m.role === 'support').length,
                }
            }
        });
    } catch (error) {
        console.error('Get Team Details Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Add developer to team (Admin only)
// @route   POST /api/team/:taskId/add
// @access  Private/Admin
export const addTeamMember = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { developerId, role, responsibilities } = req.body;

        console.log('Add Team Member Request:', { taskId, developerId, role });

        // Validate taskId format
        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        // Validate developerId
        if (!developerId) {
            return res.status(400).json({ message: 'Developer ID is required' });
        }

        if (!mongoose.Types.ObjectId.isValid(developerId)) {
            return res.status(400).json({ message: 'Invalid developer ID format' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check developer exists
        const developer = await User.findById(developerId);
        if (!developer) {
            return res.status(404).json({ message: 'Developer not found' });
        }
        if (developer.role !== 'developer') {
            return res.status(400).json({ message: 'User is not a developer' });
        }

        // Initialize team array if not exists
        if (!task.team) {
            task.team = [];
        }

        // Initialize assignedDevelopers if not exists
        if (!task.assignedDevelopers) {
            task.assignedDevelopers = [];
        }

        // Check if already in team
        const devIdStr = developerId.toString();
        const existingMember = task.team.find(m =>
            m.developer?.toString() === devIdStr && m.status === 'active'
        );
        if (existingMember) {
            return res.status(400).json({ message: 'Developer already in team' });
        }

        // Create team member object with ObjectId
        const teamMember = {
            developer: new mongoose.Types.ObjectId(developerId),
            role: role || 'developer',
            responsibilities: responsibilities || '',
            modules: [],
            individualProgress: 0,
            progressNotes: [],
            joinedAt: new Date(),
            status: 'active',
        };

        // Add to team
        task.team.push(teamMember);

        // Also update legacy field
        if (!task.assignedDevelopers.some(d => d.toString() === devIdStr)) {
            task.assignedDevelopers.push(new mongoose.Types.ObjectId(developerId));
        }

        await task.save();

        // Notify new team member
        try {
            await notifyTeamMember(
                developerId,
                'team_joined',
                'Added to Project Team',
                `You have been added to "${task.title}" as ${ROLE_LABELS[role] || 'Developer'}`,
                task._id,
                [{ id: 'view', label: 'View Task', variant: 'primary', actionType: 'navigate', navigateTo: `/developer/tasks/${task._id}` }]
            );

            // Notify lead developer
            if (task.assignedDeveloper && task.assignedDeveloper.toString() !== devIdStr) {
                await notifyTeamMember(
                    task.assignedDeveloper,
                    'team_updated',
                    'New Team Member',
                    `${developer.name} has been added to your team for "${task.title}"`,
                    task._id
                );
            }
        } catch (notifyError) {
            console.error('Notification error (non-fatal):', notifyError);
        }

        const updatedTask = await Order.findById(taskId)
            .populate('team.developer', 'name email profileImage skills');

        res.json({
            message: 'Team member added successfully',
            team: updatedTask.team
        });
    } catch (error) {
        console.error('Add Team Member Error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            message: 'Server error',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// @desc    Remove developer from team (Admin only)
// @route   DELETE /api/team/:taskId/remove/:developerId
// @access  Private/Admin
export const removeTeamMember = async (req, res) => {
    try {
        const { taskId, developerId } = req.params;
        const { reason } = req.body || {};

        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        if (!developerId || !mongoose.Types.ObjectId.isValid(developerId)) {
            return res.status(400).json({ message: 'Invalid developer ID' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Cannot remove lead developer
        if (task.assignedDeveloper?.toString() === developerId) {
            return res.status(400).json({ message: 'Cannot remove lead developer. Reassign lead first.' });
        }

        const teamArray = task.team || [];
        const memberIndex = teamArray.findIndex(m =>
            m.developer?.toString() === developerId && m.status === 'active'
        );

        if (memberIndex === -1) {
            return res.status(404).json({ message: 'Team member not found' });
        }

        // Mark as removed instead of deleting (preserve history)
        task.team[memberIndex].status = 'removed';

        // Update legacy field
        if (task.assignedDevelopers) {
            task.assignedDevelopers = task.assignedDevelopers.filter(d => d.toString() !== developerId);
        }

        await task.save();

        // Notify removed developer
        await notifyTeamMember(
            developerId,
            'team_removed',
            'Removed from Project',
            `You have been removed from "${task.title}". ${reason ? `Reason: ${reason}` : ''}`,
            task._id
        );

        res.json({ message: 'Team member removed successfully' });
    } catch (error) {
        console.error('Remove Team Member Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update team member role/responsibilities (Admin or Lead)
// @route   PUT /api/team/:taskId/member/:developerId
// @access  Private/Admin or Lead
export const updateTeamMember = async (req, res) => {
    try {
        const { taskId, developerId } = req.params;
        const { role, responsibilities, modules } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId) || !mongoose.Types.ObjectId.isValid(developerId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check permission - admin or lead only
        const isAdmin = req.user.role === 'admin';
        const isLead = isLeadDeveloper(task, req.user._id);

        if (!isAdmin && !isLead) {
            return res.status(403).json({ message: 'Only admin or lead developer can update team members' });
        }

        const teamArray = task.team || [];
        const member = teamArray.find(m =>
            m.developer?.toString() === developerId && m.status === 'active'
        );

        if (!member) {
            return res.status(404).json({ message: 'Team member not found' });
        }

        // Cannot change lead role unless admin
        if (member.role === 'lead' && role !== 'lead' && !isAdmin) {
            return res.status(400).json({ message: 'Only admin can change lead developer role' });
        }

        if (role) member.role = role;
        if (responsibilities !== undefined) member.responsibilities = responsibilities;
        if (modules) member.modules = modules;

        await task.save();

        // Notify developer of changes
        const developer = await User.findById(developerId);
        await notifyTeamMember(
            developerId,
            'team_updated',
            'Role Updated',
            `Your role in "${task.title}" has been updated to ${ROLE_LABELS[role] || role}`,
            task._id
        );

        const updatedTask = await Order.findById(taskId)
            .populate('team.developer', 'name email profileImage skills');

        res.json({
            message: 'Team member updated successfully',
            team: updatedTask.team
        });
    } catch (error) {
        console.error('Update Team Member Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Change lead developer (Admin only)
// @route   PUT /api/team/:taskId/change-lead
// @access  Private/Admin
export const changeLeadDeveloper = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { newLeadId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        if (!newLeadId || !mongoose.Types.ObjectId.isValid(newLeadId)) {
            return res.status(400).json({ message: 'Invalid new lead ID' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        const teamArray = task.team || [];

        // Check new lead is in team
        const newLeadMember = teamArray.find(m =>
            m.developer?.toString() === newLeadId && m.status === 'active'
        );
        if (!newLeadMember) {
            return res.status(400).json({ message: 'New lead must be an active team member' });
        }

        const oldLeadId = task.assignedDeveloper;

        // Update old lead's role
        const oldLeadMember = teamArray.find(m =>
            m.developer?.toString() === oldLeadId?.toString() && m.status === 'active'
        );
        if (oldLeadMember) {
            oldLeadMember.role = 'senior'; // Demote to senior
        }

        // Update new lead
        newLeadMember.role = 'lead';
        task.assignedDeveloper = new mongoose.Types.ObjectId(newLeadId);

        await task.save();

        // Notify old lead
        if (oldLeadId) {
            await notifyTeamMember(
                oldLeadId,
                'team_updated',
                'Lead Role Transferred',
                `You are no longer the lead developer for "${task.title}"`,
                task._id
            );
        }

        // Notify new lead
        await notifyTeamMember(
            newLeadId,
            'team_lead_assigned',
            'You are now Lead Developer',
            `You have been promoted to lead developer for "${task.title}"`,
            task._id,
            [{ id: 'view', label: 'View Team', variant: 'primary', actionType: 'navigate', navigateTo: `/developer/tasks/${task._id}/team` }]
        );

        res.json({ message: 'Lead developer changed successfully' });
    } catch (error) {
        console.error('Change Lead Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update individual progress (Developer updates their own progress)
// @route   PUT /api/team/:taskId/my-progress
// @access  Private/Developer
export const updateMyProgress = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { progress, note, moduleUpdates } = req.body;
        const developerId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        const teamArray = task.team || [];
        const member = teamArray.find(m =>
            m.developer?.toString() === developerId.toString() && m.status === 'active'
        );

        if (!member) {
            return res.status(403).json({ message: 'You are not a member of this team' });
        }

        // Update individual progress
        if (progress !== undefined) {
            member.individualProgress = Math.min(100, Math.max(0, progress));
        }

        // Add progress note
        if (note) {
            if (!member.progressNotes) member.progressNotes = [];
            member.progressNotes.push({
                note,
                progress: member.individualProgress,
                createdAt: new Date(),
            });
        }

        // Update modules if provided
        if (moduleUpdates && Array.isArray(moduleUpdates)) {
            const modules = member.modules || [];
            moduleUpdates.forEach(update => {
                const module = modules.find(m => m._id?.toString() === update.moduleId);
                if (module) {
                    if (update.status) module.status = update.status;
                    if (update.progress !== undefined) module.progress = update.progress;
                }
            });
        }

        // Recalculate overall task progress from all team members
        const activeMembers = teamArray.filter(m => m.status === 'active');
        if (activeMembers.length > 0) {
            task.progress = Math.round(
                activeMembers.reduce((sum, m) => sum + (m.individualProgress || 0), 0) / activeMembers.length
            );
        }

        await task.save();

        // Notify lead if significant progress (25%, 50%, 75%, 100%)
        const milestones = [25, 50, 75, 100];
        if (milestones.includes(member.individualProgress) && !isLeadDeveloper(task, developerId)) {
            await notifyTeamMember(
                task.assignedDeveloper,
                'team_progress',
                'Team Progress Update',
                `${req.user.name} reached ${member.individualProgress}% on "${task.title}"`,
                task._id
            );
        }

        res.json({
            message: 'Progress updated successfully',
            individualProgress: member.individualProgress,
            taskProgress: task.progress
        });
    } catch (error) {
        console.error('Update My Progress Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Assign module to team member (Lead only)
// @route   POST /api/team/:taskId/assign-module
// @access  Private/Lead
export const assignModule = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { developerId, module } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        if (!developerId || !mongoose.Types.ObjectId.isValid(developerId)) {
            return res.status(400).json({ message: 'Invalid developer ID' });
        }

        if (!module?.title) {
            return res.status(400).json({ message: 'Module title is required' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check if requester is lead
        if (!isLeadDeveloper(task, req.user._id)) {
            return res.status(403).json({ message: 'Only lead developer can assign modules' });
        }

        const teamArray = task.team || [];
        const member = teamArray.find(m =>
            m.developer?.toString() === developerId && m.status === 'active'
        );

        if (!member) {
            return res.status(404).json({ message: 'Team member not found' });
        }

        if (!member.modules) member.modules = [];
        member.modules.push({
            title: module.title,
            description: module.description || '',
            status: 'pending',
            progress: 0,
        });

        await task.save();

        // Notify developer
        await notifyTeamMember(
            developerId,
            'module_assigned',
            'New Module Assigned',
            `You have been assigned "${module.title}" in "${task.title}"`,
            task._id
        );

        res.json({
            message: 'Module assigned successfully',
            modules: member.modules
        });
    } catch (error) {
        console.error('Assign Module Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Submit team request (Lead developer)
// @route   POST /api/team/:taskId/request
// @access  Private/Lead
export const submitTeamRequest = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { type, description } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        if (!type || !description) {
            return res.status(400).json({ message: 'Type and description are required' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        if (!isLeadDeveloper(task, req.user._id)) {
            return res.status(403).json({ message: 'Only lead developer can submit team requests' });
        }

        if (!task.teamRequests) task.teamRequests = [];
        task.teamRequests.push({
            type,
            description,
            requestedBy: req.user._id,
            status: 'pending',
            createdAt: new Date(),
        });

        await task.save();

        // Notify admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'team_request',
                'Team Request',
                `Lead developer requests ${type.replace('_', ' ')} for "${task.title}"`,
                task._id,
                'Order',
                `/admin/tasks/${task._id}`,
                {},
                [
                    { id: 'approve', label: 'Approve', variant: 'success', actionType: 'navigate', navigateTo: `/admin/tasks/${task._id}` },
                    { id: 'view', label: 'View', variant: 'secondary', actionType: 'navigate', navigateTo: `/admin/tasks/${task._id}` }
                ]
            );
        }

        res.json({ message: 'Request submitted successfully' });
    } catch (error) {
        console.error('Submit Team Request Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Respond to team request (Admin only)
// @route   PUT /api/team/:taskId/request/:requestId
// @access  Private/Admin
export const respondToTeamRequest = async (req, res) => {
    try {
        const { taskId, requestId } = req.params;
        const { status, response } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({ message: 'Invalid request ID' });
        }

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Valid status (approved/rejected) is required' });
        }

        const task = await Order.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        if (!task.teamRequests) {
            return res.status(404).json({ message: 'No team requests found' });
        }

        const request = task.teamRequests.id(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        request.status = status;
        request.adminResponse = response || '';
        request.respondedAt = new Date();

        await task.save();

        // Notify lead developer
        if (task.assignedDeveloper) {
            try {
                await notifyTeamMember(
                    task.assignedDeveloper,
                    'team_request_response',
                    `Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
                    `Your ${request.type?.replace('_', ' ') || 'team'} request for "${task.title}" has been ${status}`,
                    task._id
                );
            } catch (notifyError) {
                console.error('Notification error (non-fatal):', notifyError);
            }
        }

        res.json({ message: `Request ${status} successfully` });
    } catch (error) {
        console.error('Respond to Team Request Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
