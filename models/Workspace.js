import mongoose from 'mongoose';

// Card Schema (embedded in Column)
const cardSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    position: {
        type: Number,
        default: 0,
    },
    assignees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    labels: [{
        name: String,
        color: {
            type: String,
            default: '#3b82f6', // blue
        },
    }],
    startDate: Date,
    dueDate: Date,
    isCompleted: {
        type: Boolean,
        default: false,
    },
    completedAt: Date,
    attachments: [{
        name: String,
        url: String,
        type: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    }],
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        text: String,
        createdAt: {
            type: Date,
            default: Date.now,
        },
    }],
    checklist: [{
        text: String,
        isCompleted: {
            type: Boolean,
            default: false,
        },
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Column Schema (embedded in Board)
const columnSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    position: {
        type: Number,
        default: 0,
    },
    cards: [cardSchema],
    color: {
        type: String,
        default: '#374151', // gray
    },
}, {
    timestamps: true,
});

// Board Schema
const boardSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    workspace: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
    },
    columns: [columnSchema],
    background: {
        type: String,
        default: '#1f2937', // dark gray
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Workspace Schema
const workspaceSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    // Reference to the task/order this workspace is for
    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        unique: true, // One workspace per task
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    collaborators: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        role: {
            type: String,
            enum: ['admin', 'member', 'viewer'],
            default: 'member',
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
    }],
    visibility: {
        type: String,
        enum: ['private', 'shared', 'public'],
        default: 'private',
    },
    inviteCode: {
        type: String,
        unique: true,
        sparse: true,
    },
    inviteEnabled: {
        type: Boolean,
        default: false,
    },
    color: {
        type: String,
        default: '#3b82f6', // blue
    },
    icon: {
        type: String,
        default: 'folder',
    },
}, {
    timestamps: true,
});

// Generate unique invite code
workspaceSchema.methods.generateInviteCode = function() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.inviteCode = code;
    this.inviteEnabled = true;
    return code;
};

// Check if user has access to workspace
workspaceSchema.methods.hasAccess = function(userId) {
    const userIdStr = userId.toString();
    if (this.owner.toString() === userIdStr) return true;
    if (this.visibility === 'public') return true;
    return this.collaborators.some(c => c.user.toString() === userIdStr);
};

// Check if user can edit workspace
workspaceSchema.methods.canEdit = function(userId) {
    const userIdStr = userId.toString();
    if (this.owner.toString() === userIdStr) return true;
    const collaborator = this.collaborators.find(c => c.user.toString() === userIdStr);
    return collaborator && ['admin', 'member'].includes(collaborator.role);
};

// Check if user is admin
workspaceSchema.methods.isAdmin = function(userId) {
    const userIdStr = userId.toString();
    if (this.owner.toString() === userIdStr) return true;
    const collaborator = this.collaborators.find(c => c.user.toString() === userIdStr);
    return collaborator && collaborator.role === 'admin';
};

const Workspace = mongoose.model('Workspace', workspaceSchema);
const Board = mongoose.model('Board', boardSchema);

export { Workspace, Board };
export default Workspace;
