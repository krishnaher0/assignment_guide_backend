import { Workspace, Board } from '../models/Workspace.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';

// ==================== WORKSPACE OPERATIONS ====================

// @desc    Get tasks available for workspace creation
// @route   GET /api/workspaces/available-tasks
// @access  Private/Developer
const getAvailableTasks = async (req, res) => {
    try {
        // Get tasks where user is the primary (lead) developer
        const tasks = await Order.find({
            assignedDeveloper: req.user._id,
            status: { $in: ['working', 'review'] } // Updated for new status flow
        }).select('title description status createdAt deadline');

        // Get existing workspaces for these tasks
        const existingWorkspaces = await Workspace.find({
            task: { $in: tasks.map(t => t._id) }
        }).select('task');

        const existingTaskIds = existingWorkspaces.map(w => w.task.toString());

        // Mark which tasks already have workspaces
        const tasksWithStatus = tasks.map(task => ({
            ...task.toObject(),
            hasWorkspace: existingTaskIds.includes(task._id.toString()),
            isLeadDeveloper: true,
        }));

        // Also get tasks where user is a collaborator (not lead)
        const collaboratorTasks = await Order.find({
            'assignedWorkers.worker': req.user._id,
            assignedDeveloper: { $ne: req.user._id },
            status: { $in: ['working', 'review'] } // Updated for new status flow
        }).select('title description status createdAt deadline assignedDeveloper');

        const collabTasksWithStatus = collaboratorTasks.map(task => ({
            ...task.toObject(),
            hasWorkspace: false,
            isLeadDeveloper: false,
        }));

        res.json([...tasksWithStatus, ...collabTasksWithStatus]);
    } catch (error) {
        console.error('Get Available Tasks Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all workspaces for current user
// @route   GET /api/workspaces
// @access  Private/Developer
const getWorkspaces = async (req, res) => {
    try {
        const workspaces = await Workspace.find({
            $or: [
                { owner: req.user._id },
                { 'collaborators.user': req.user._id }
            ]
        })
        .populate('owner', 'name email profileImage')
        .populate('collaborators.user', 'name email profileImage')
        .populate('task', 'title status deadline')
        .sort({ updatedAt: -1 });

        res.json(workspaces);
    } catch (error) {
        console.error('Get Workspaces Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Create new workspace for a task
// @route   POST /api/workspaces
// @access  Private/Developer
const createWorkspace = async (req, res) => {
    try {
        const { taskId, title, description, visibility, color, icon } = req.body;

        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required' });
        }

        // Find the task
        const task = await Order.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check if user is the primary/lead developer
        if (task.assignedDeveloper?.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                message: 'You must be the lead developer to create a workspace for this task',
                isLeadRequired: true
            });
        }

        // Check if workspace already exists for this task
        const existingWorkspace = await Workspace.findOne({ task: taskId });
        if (existingWorkspace) {
            return res.status(400).json({ message: 'A workspace already exists for this task' });
        }

        // Auto-add other assigned developers as collaborators
        const collaborators = (task.assignedDevelopers || [])
            .filter(devId => devId.toString() !== req.user._id.toString())
            .map(devId => ({
                user: devId,
                role: 'member',
                addedAt: new Date(),
            }));

        const workspace = new Workspace({
            title: title || task.title,
            description: description || task.description,
            task: taskId,
            owner: req.user._id,
            collaborators,
            visibility: visibility || 'shared',
            color: color || '#3b82f6',
            icon: icon || 'folder',
        });

        const savedWorkspace = await workspace.save();

        // Populate info
        await savedWorkspace.populate('owner', 'name email profileImage');
        await savedWorkspace.populate('collaborators.user', 'name email profileImage');
        await savedWorkspace.populate('task', 'title status deadline');

        res.status(201).json(savedWorkspace);
    } catch (error) {
        console.error('Create Workspace Error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A workspace already exists for this task' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get single workspace
// @route   GET /api/workspaces/:id
// @access  Private/Developer
const getWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name email profileImage')
            .populate('collaborators.user', 'name email profileImage');

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        // Check access
        if (!workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to access this workspace' });
        }

        res.json(workspace);
    } catch (error) {
        console.error('Get Workspace Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update workspace
// @route   PUT /api/workspaces/:id
// @access  Private/Developer
const updateWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.isAdmin(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to update this workspace' });
        }

        const { title, description, visibility, color, icon } = req.body;

        if (title) workspace.title = title;
        if (description !== undefined) workspace.description = description;
        if (visibility) workspace.visibility = visibility;
        if (color) workspace.color = color;
        if (icon) workspace.icon = icon;

        const updatedWorkspace = await workspace.save();
        await updatedWorkspace.populate('owner', 'name email profileImage');
        await updatedWorkspace.populate('collaborators.user', 'name email profileImage');

        res.json(updatedWorkspace);
    } catch (error) {
        console.error('Update Workspace Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete workspace
// @route   DELETE /api/workspaces/:id
// @access  Private/Developer
const deleteWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        // Only owner can delete
        if (workspace.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only workspace owner can delete' });
        }

        // Delete all boards in this workspace
        await Board.deleteMany({ workspace: workspace._id });

        await Workspace.deleteOne({ _id: workspace._id });

        res.json({ message: 'Workspace deleted successfully' });
    } catch (error) {
        console.error('Delete Workspace Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Generate/toggle invite link
// @route   POST /api/workspaces/:id/invite
// @access  Private/Developer
const toggleInviteLink = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.isAdmin(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (workspace.inviteEnabled) {
            // Disable invite
            workspace.inviteEnabled = false;
            workspace.inviteCode = undefined;
        } else {
            // Generate new invite code
            workspace.generateInviteCode();
        }

        await workspace.save();

        res.json({
            inviteEnabled: workspace.inviteEnabled,
            inviteCode: workspace.inviteCode,
            inviteLink: workspace.inviteEnabled
                ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}/workspace/join/${workspace.inviteCode}`
                : null,
        });
    } catch (error) {
        console.error('Toggle Invite Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Join workspace via invite code
// @route   POST /api/workspaces/join/:code
// @access  Private/Developer
const joinWorkspace = async (req, res) => {
    try {
        const { code } = req.params;

        const workspace = await Workspace.findOne({ inviteCode: code, inviteEnabled: true });

        if (!workspace) {
            return res.status(404).json({ message: 'Invalid or expired invite link' });
        }

        // Check if already a member
        const isOwner = workspace.owner.toString() === req.user._id.toString();
        const isCollaborator = workspace.collaborators.some(
            c => c.user.toString() === req.user._id.toString()
        );

        if (isOwner || isCollaborator) {
            return res.status(400).json({ message: 'You are already a member of this workspace' });
        }

        // Add as collaborator
        workspace.collaborators.push({
            user: req.user._id,
            role: 'member',
            addedAt: new Date(),
        });

        await workspace.save();
        await workspace.populate('owner', 'name email profileImage');
        await workspace.populate('collaborators.user', 'name email profileImage');

        res.json({
            message: 'Successfully joined workspace',
            workspace,
        });
    } catch (error) {
        console.error('Join Workspace Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Add collaborator to workspace
// @route   POST /api/workspaces/:id/collaborators
// @access  Private/Developer
const addCollaborator = async (req, res) => {
    try {
        const { email, role } = req.body;

        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.isAdmin(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Find user by email
        const user = await User.findOne({ email, role: 'developer' });

        if (!user) {
            return res.status(404).json({ message: 'Developer not found with this email' });
        }

        // Check if already a member
        const exists = workspace.collaborators.some(
            c => c.user.toString() === user._id.toString()
        );

        if (exists || workspace.owner.toString() === user._id.toString()) {
            return res.status(400).json({ message: 'User is already a member' });
        }

        workspace.collaborators.push({
            user: user._id,
            role: role || 'member',
            addedAt: new Date(),
        });

        await workspace.save();
        await workspace.populate('collaborators.user', 'name email profileImage');

        res.json({
            message: 'Collaborator added successfully',
            collaborators: workspace.collaborators,
        });
    } catch (error) {
        console.error('Add Collaborator Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Remove collaborator from workspace
// @route   DELETE /api/workspaces/:id/collaborators/:userId
// @access  Private/Developer
const removeCollaborator = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        // Admin or self can remove
        const isSelf = req.params.userId === req.user._id.toString();
        if (!workspace.isAdmin(req.user._id) && !isSelf) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        workspace.collaborators = workspace.collaborators.filter(
            c => c.user.toString() !== req.params.userId
        );

        await workspace.save();

        res.json({ message: 'Collaborator removed successfully' });
    } catch (error) {
        console.error('Remove Collaborator Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update collaborator role
// @route   PUT /api/workspaces/:id/collaborators/:userId
// @access  Private/Developer
const updateCollaboratorRole = async (req, res) => {
    try {
        const { role } = req.body;

        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.isAdmin(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const collaborator = workspace.collaborators.find(
            c => c.user.toString() === req.params.userId
        );

        if (!collaborator) {
            return res.status(404).json({ message: 'Collaborator not found' });
        }

        collaborator.role = role;
        await workspace.save();

        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        console.error('Update Collaborator Role Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ==================== BOARD OPERATIONS ====================

// @desc    Get all boards in workspace
// @route   GET /api/workspaces/:workspaceId/boards
// @access  Private/Developer
const getBoards = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const boards = await Board.find({ workspace: workspace._id })
            .populate('createdBy', 'name email profileImage')
            .sort({ createdAt: -1 });

        res.json(boards);
    } catch (error) {
        console.error('Get Boards Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Create board
// @route   POST /api/workspaces/:workspaceId/boards
// @access  Private/Developer
const createBoard = async (req, res) => {
    try {
        const { title, description, background } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to create boards' });
        }

        const board = new Board({
            title,
            description,
            workspace: workspace._id,
            background: background || '#1f2937',
            createdBy: req.user._id,
            columns: [
                { title: 'To Do', position: 0, cards: [] },
                { title: 'In Progress', position: 1, cards: [] },
                { title: 'Done', position: 2, cards: [] },
            ],
        });

        const savedBoard = await board.save();
        await savedBoard.populate('createdBy', 'name email profileImage');

        res.status(201).json(savedBoard);
    } catch (error) {
        console.error('Create Board Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get single board with all details
// @route   GET /api/workspaces/:workspaceId/boards/:boardId
// @access  Private/Developer
const getBoard = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        })
            .populate('createdBy', 'name email profileImage')
            .populate('columns.cards.assignees', 'name email profileImage')
            .populate('columns.cards.createdBy', 'name email profileImage')
            .populate('columns.cards.comments.user', 'name email profileImage');

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        res.json(board);
    } catch (error) {
        console.error('Get Board Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update board
// @route   PUT /api/workspaces/:workspaceId/boards/:boardId
// @access  Private/Developer
const updateBoard = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const { title, description, background } = req.body;

        if (title) board.title = title;
        if (description !== undefined) board.description = description;
        if (background) board.background = background;

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Update Board Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete board
// @route   DELETE /api/workspaces/:workspaceId/boards/:boardId
// @access  Private/Developer
const deleteBoard = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.isAdmin(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Board.deleteOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        res.json({ message: 'Board deleted successfully' });
    } catch (error) {
        console.error('Delete Board Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ==================== COLUMN OPERATIONS ====================

// @desc    Add column to board
// @route   POST /api/workspaces/:workspaceId/boards/:boardId/columns
// @access  Private/Developer
const addColumn = async (req, res) => {
    try {
        const { title, color } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const maxPosition = board.columns.reduce((max, col) => Math.max(max, col.position), -1);

        board.columns.push({
            title,
            position: maxPosition + 1,
            color: color || '#374151',
            cards: [],
        });

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Add Column Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update column
// @route   PUT /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId
// @access  Private/Developer
const updateColumn = async (req, res) => {
    try {
        const { title, color } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        if (title) column.title = title;
        if (color) column.color = color;

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Update Column Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete column
// @route   DELETE /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId
// @access  Private/Developer
const deleteColumn = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        board.columns = board.columns.filter(
            col => col._id.toString() !== req.params.columnId
        );

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Delete Column Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Reorder columns
// @route   PUT /api/workspaces/:workspaceId/boards/:boardId/columns/reorder
// @access  Private/Developer
const reorderColumns = async (req, res) => {
    try {
        const { columnIds } = req.body; // Array of column IDs in new order

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        // Update positions based on new order
        columnIds.forEach((colId, index) => {
            const column = board.columns.id(colId);
            if (column) {
                column.position = index;
            }
        });

        // Sort columns by position
        board.columns.sort((a, b) => a.position - b.position);

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Reorder Columns Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ==================== CARD OPERATIONS ====================

// @desc    Add card to column
// @route   POST /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId/cards
// @access  Private/Developer
const addCard = async (req, res) => {
    try {
        const { title, description, assignees, labels, startDate, dueDate } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        const maxPosition = column.cards.reduce((max, card) => Math.max(max, card.position), -1);

        column.cards.push({
            title,
            description,
            position: maxPosition + 1,
            assignees: assignees || [],
            labels: labels || [],
            startDate,
            dueDate,
            createdBy: req.user._id,
        });

        await board.save();

        // Populate and return
        await board.populate('columns.cards.assignees', 'name email profileImage');
        await board.populate('columns.cards.createdBy', 'name email profileImage');

        res.json(board);
    } catch (error) {
        console.error('Add Card Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update card
// @route   PUT /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId
// @access  Private/Developer
const updateCard = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        const card = column.cards.id(req.params.cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const { title, description, assignees, labels, startDate, dueDate, isCompleted, checklist } = req.body;

        if (title) card.title = title;
        if (description !== undefined) card.description = description;
        if (assignees) card.assignees = assignees;
        if (labels) card.labels = labels;
        if (startDate !== undefined) card.startDate = startDate;
        if (dueDate !== undefined) card.dueDate = dueDate;
        if (checklist) card.checklist = checklist;

        if (isCompleted !== undefined) {
            card.isCompleted = isCompleted;
            card.completedAt = isCompleted ? new Date() : null;
        }

        await board.save();

        await board.populate('columns.cards.assignees', 'name email profileImage');
        await board.populate('columns.cards.createdBy', 'name email profileImage');

        res.json(board);
    } catch (error) {
        console.error('Update Card Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete card
// @route   DELETE /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId
// @access  Private/Developer
const deleteCard = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        column.cards = column.cards.filter(
            card => card._id.toString() !== req.params.cardId
        );

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Delete Card Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Move card between columns or reorder
// @route   PUT /api/workspaces/:workspaceId/boards/:boardId/cards/move
// @access  Private/Developer
const moveCard = async (req, res) => {
    try {
        const { cardId, sourceColumnId, destColumnId, newPosition } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.canEdit(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const sourceColumn = board.columns.id(sourceColumnId);
        const destColumn = board.columns.id(destColumnId);

        if (!sourceColumn || !destColumn) {
            return res.status(404).json({ message: 'Column not found' });
        }

        // Find and remove card from source
        const cardIndex = sourceColumn.cards.findIndex(
            c => c._id.toString() === cardId
        );

        if (cardIndex === -1) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const [card] = sourceColumn.cards.splice(cardIndex, 1);

        // Update positions in source column
        sourceColumn.cards.forEach((c, i) => {
            c.position = i;
        });

        // Insert card in destination at new position
        card.position = newPosition;
        destColumn.cards.splice(newPosition, 0, card);

        // Update positions in destination column
        destColumn.cards.forEach((c, i) => {
            c.position = i;
        });

        await board.save();

        await board.populate('columns.cards.assignees', 'name email profileImage');
        await board.populate('columns.cards.createdBy', 'name email profileImage');

        res.json(board);
    } catch (error) {
        console.error('Move Card Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Add comment to card
// @route   POST /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId/comments
// @access  Private/Developer
const addComment = async (req, res) => {
    try {
        const { text } = req.body;

        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace || !workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        const card = column.cards.id(req.params.cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        card.comments.push({
            user: req.user._id,
            text,
            createdAt: new Date(),
        });

        await board.save();

        await board.populate('columns.cards.comments.user', 'name email profileImage');

        res.json(board);
    } catch (error) {
        console.error('Add Comment Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete comment from card
// @route   DELETE /api/workspaces/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId/comments/:commentId
// @access  Private/Developer
const deleteComment = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        const board = await Board.findOne({
            _id: req.params.boardId,
            workspace: workspace._id,
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const column = board.columns.id(req.params.columnId);
        if (!column) {
            return res.status(404).json({ message: 'Column not found' });
        }

        const card = column.cards.id(req.params.cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const comment = card.comments.id(req.params.commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Only comment author or workspace admin can delete
        const isAuthor = comment.user.toString() === req.user._id.toString();
        const isAdmin = workspace.isAdmin(req.user._id);

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to delete this comment' });
        }

        card.comments = card.comments.filter(
            c => c._id.toString() !== req.params.commentId
        );

        await board.save();

        res.json(board);
    } catch (error) {
        console.error('Delete Comment Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Sync workspace board progress to assignment
// @route   POST /api/workspaces/:workspaceId/sync-progress
// @access  Private/Developer
const syncProgressToAssignment = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId);

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (!workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (!workspace.task) {
            return res.status(400).json({ message: 'Workspace is not linked to an assignment' });
        }

        // Get all boards in workspace
        const boards = await Board.find({ workspace: workspace._id });

        // Calculate progress from all boards
        let totalCards = 0;
        let completedCards = 0;

        for (const board of boards) {
            for (const column of board.columns) {
                const columnTitle = column.title.toLowerCase();
                // Count cards in "Done", "Complete", "Completed" columns as completed
                const isDoneColumn = ['done', 'complete', 'completed', 'finished'].some(
                    term => columnTitle.includes(term)
                );

                totalCards += column.cards.length;
                if (isDoneColumn) {
                    completedCards += column.cards.length;
                }

                // Also count individually completed cards
                for (const card of column.cards) {
                    if (card.isCompleted && !isDoneColumn) {
                        completedCards++;
                    }
                }
            }
        }

        // Calculate progress percentage
        const progress = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

        // Update assignment progress
        const assignment = await Order.findById(workspace.task);
        if (assignment) {
            assignment.progress = progress;

            // Add progress note
            assignment.progressNotes.push({
                note: `Progress synced from workspace: ${completedCards}/${totalCards} tasks (${progress}%)`,
                addedBy: req.user._id,
                addedAt: new Date(),
            });

            await assignment.save();
        }

        res.json({
            message: 'Progress synced successfully',
            progress,
            totalCards,
            completedCards,
        });
    } catch (error) {
        console.error('Sync Progress Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get workspace by task ID
// @route   GET /api/workspaces/by-task/:taskId
// @access  Private/Developer
const getWorkspaceByTask = async (req, res) => {
    try {
        const workspace = await Workspace.findOne({ task: req.params.taskId })
            .populate('owner', 'name email profileImage')
            .populate('collaborators.user', 'name email profileImage')
            .populate('task', 'title status deadline progress');

        if (!workspace) {
            return res.status(404).json({ message: 'No workspace found for this assignment' });
        }

        // Check access
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && !workspace.hasAccess(req.user._id)) {
            return res.status(403).json({ message: 'Not authorized to access this workspace' });
        }

        res.json(workspace);
    } catch (error) {
        console.error('Get Workspace By Task Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

export {
    // Workspace
    getAvailableTasks,
    getWorkspaces,
    createWorkspace,
    getWorkspace,
    getWorkspaceByTask,
    updateWorkspace,
    deleteWorkspace,
    toggleInviteLink,
    joinWorkspace,
    addCollaborator,
    removeCollaborator,
    updateCollaboratorRole,
    syncProgressToAssignment,
    // Board
    getBoards,
    createBoard,
    getBoard,
    updateBoard,
    deleteBoard,
    // Column
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    // Card
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    addComment,
    deleteComment,
};
