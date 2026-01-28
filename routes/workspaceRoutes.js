import express from 'express';
import {
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
} from '../controllers/workspaceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication and developer role
router.use(protect, authorize('developer', 'admin'));

// ==================== WORKSPACE ROUTES ====================
router.get('/available-tasks', getAvailableTasks);
router.get('/by-task/:taskId', getWorkspaceByTask);

router.route('/')
    .get(getWorkspaces)
    .post(createWorkspace);

router.route('/:id')
    .get(getWorkspace)
    .put(updateWorkspace)
    .delete(deleteWorkspace);

// Progress sync
router.post('/:workspaceId/sync-progress', syncProgressToAssignment);

// Invite management
router.post('/:id/invite', toggleInviteLink);
router.post('/join/:code', joinWorkspace);

// Collaborator management
router.post('/:id/collaborators', addCollaborator);
router.delete('/:id/collaborators/:userId', removeCollaborator);
router.put('/:id/collaborators/:userId', updateCollaboratorRole);

// ==================== BOARD ROUTES ====================
router.route('/:workspaceId/boards')
    .get(getBoards)
    .post(createBoard);

router.route('/:workspaceId/boards/:boardId')
    .get(getBoard)
    .put(updateBoard)
    .delete(deleteBoard);

// ==================== COLUMN ROUTES ====================
router.post('/:workspaceId/boards/:boardId/columns', addColumn);
router.put('/:workspaceId/boards/:boardId/columns/reorder', reorderColumns);
router.put('/:workspaceId/boards/:boardId/columns/:columnId', updateColumn);
router.delete('/:workspaceId/boards/:boardId/columns/:columnId', deleteColumn);

// ==================== CARD ROUTES ====================
router.post('/:workspaceId/boards/:boardId/columns/:columnId/cards', addCard);
router.put('/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId', updateCard);
router.delete('/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId', deleteCard);
router.put('/:workspaceId/boards/:boardId/cards/move', moveCard);

// Card comments
router.post('/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId/comments', addComment);
router.delete('/:workspaceId/boards/:boardId/columns/:columnId/cards/:cardId/comments/:commentId', deleteComment);

export default router;
