import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import AuditLog from '../models/AuditLog.js';

// @desc    Get all developers
// @route   GET /api/users/developers
// @access  Private/Admin
export const getDevelopers = async (req, res) => {
    try {
        const developers = await User.find({ role: 'developer' }).select('-password');
        res.json(developers);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -mfaSecret -mfaBackupCodes');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update current user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const { name, phone, bio, status, profileImage } = req.body;

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (bio) user.bio = bio;
        if (status) user.status = status;
        if (profileImage) user.profileImage = profileImage;

        await user.save();

        // Log profile update
        await AuditLog.create({
            userId: user._id,
            action: 'profile_updated',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
            details: { updatedFields: Object.keys(req.body) }
        });

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            bio: user.bio,
            status: user.status,
            profileImage: user.profileImage,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Create a new developer (simplified - just email and password)
// @route   POST /api/users/developers
// @access  Private/Admin
export const createDeveloper = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password: hashedPassword,
            role: 'developer',
            status: 'offline',
            // Developer will fill in their profile after logging in
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                email: user.email,
                role: user.role,
                message: 'Developer account created. They can now log in and complete their profile.',
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Create Developer Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update user (admin can set hourlyRate and ban status)
// @route   PUT /api/users/:id
// @access  Private/Admin
export const updateUser = async (req, res) => {
    try {
        const { hourlyRate, isBanned } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Only allow admin to update these fields
        if (hourlyRate !== undefined) {
            // Track rate history
            if (user.hourlyRate !== hourlyRate) {
                if (!user.rateHistory) user.rateHistory = [];
                user.rateHistory.push({
                    rate: hourlyRate,
                    setBy: req.user._id,
                    setAt: new Date(),
                    effectiveFrom: new Date(),
                });
            }
            user.hourlyRate = hourlyRate;
        }

        if (isBanned !== undefined) {
            user.isBanned = isBanned;
        }

        await user.save();

        res.json({
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            hourlyRate: user.hourlyRate,
            isBanned: user.isBanned,
            message: 'User updated successfully',
        });
    } catch (error) {
        console.error('Update User Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            await user.deleteOne();
            res.json({ message: 'User removed' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
