import mongoose from 'mongoose';

/**
 * User Model (Simplified)
 * Roles: client (student), worker (team member), admin
 * Removed: public profiles, hourly rates, ratings, OAuth, developer applications
 */
const userSchema = mongoose.Schema({
    // Core fields
    name: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        // Not required at schema level - OAuth users don't have passwords
        // Validation for manual auth is handled in authController
    },
    phone: String,

    // Role (client = student, developer/worker = team member, admin)
    role: {
        type: String,
        enum: ['client', 'worker', 'developer', 'admin'],
        default: 'client',
    },

    // Account status
    isActive: {
        type: Boolean,
        default: true,
    },
    isBanned: {
        type: Boolean,
        default: false,
    },
    banReason: String,

    // Online status
    status: {
        type: String,
        enum: ['online', 'offline', 'busy'],
        default: 'offline',
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    lastSeenAt: Date,

    // Worker-specific fields (only used when role = 'worker')
    workerProfile: {
        skills: [String],
        maxConcurrentTasks: { type: Number, default: 3 },
        currentTaskCount: { type: Number, default: 0 },
        completedTasks: { type: Number, default: 0 },
        isAvailable: { type: Boolean, default: true },
    },

    // Email verification
    isEmailVerified: {
        type: Boolean,
        default: false,
    },

    // Profile image (keep for display purposes)
    profileImage: String,

    // ============================================
    // LEGACY FIELDS (kept for backwards compatibility)
    // These will be ignored in new code but prevent
    // existing data from breaking
    // ============================================
    username: String,
    bio: String,
    location: String,
    skills: [String],
    expertise: [String],
    hourlyRate: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    authMethod: { type: String, default: 'manual' },
    googleId: String,
    githubId: String,
    applicationStatus: { type: String, default: 'none' },
    applicationSubmittedAt: Date,
    applicationReviewedAt: Date,
    applicationReviewedBy: mongoose.Schema.Types.ObjectId,
    applicationNotes: String,
    paymentInfo: {
        method: String,
        details: {},
    },
    onboardedAt: Date,
    rateHistory: [{
        rate: Number,
        setBy: mongoose.Schema.Types.ObjectId,
        setAt: Date,
        effectiveFrom: Date,
    }],

}, {
    timestamps: true,
});

// Virtual: Check if user is a worker
userSchema.virtual('isWorker').get(function() {
    return this.role === 'worker';
});

// Virtual: Check if user is admin
userSchema.virtual('isAdmin').get(function() {
    return this.role === 'admin';
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

export default User;
