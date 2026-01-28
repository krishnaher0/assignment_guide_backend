import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ============================================
// ASSIGNMENT FILES UPLOAD
// ============================================

// Ensure uploads directory exists
const assignmentUploadsDir = path.join(__dirname, '../uploads/assignments');
if (!fs.existsSync(assignmentUploadsDir)) {
    fs.mkdirSync(assignmentUploadsDir, { recursive: true });
}

// Configure multer for assignment file uploads
const assignmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, assignmentUploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueSuffix}-${sanitizedName}`);
    }
});

const assignmentUpload = multer({
    storage: assignmentStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for academic files
    fileFilter: (req, file, cb) => {
        // Allow academic document types
        const allowedTypes = [
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'application/rtf',
            // Images (for diagrams, screenshots)
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            // Archives
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            // Code files
            'text/javascript',
            'text/html',
            'text/css',
            'application/json',
            'application/xml',
        ];

        // Also allow by extension for code files
        const allowedExtensions = [
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.txt', '.csv', '.rtf',
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.zip', '.rar', '.7z',
            '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
            '.html', '.css', '.json', '.xml', '.md', '.sql'
        ];

        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`), false);
        }
    }
});

// @desc    Upload assignment files (brief, references, etc.)
// @route   POST /api/upload/assignment-files
// @access  Private
router.post('/assignment-files', protect, assignmentUpload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            fileName: file.filename,
            fileUrl: `/uploads/assignments/${file.filename}`,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date(),
        }));

        res.json({
            message: 'Files uploaded successfully',
            files: uploadedFiles,
        });
    } catch (error) {
        console.error('Assignment File Upload Error:', error);
        res.status(500).json({ message: 'Failed to upload files', error: error.message });
    }
});

// @desc    Upload single assignment file
// @route   POST /api/upload/assignment-file
// @access  Private
router.post('/assignment-file', protect, assignmentUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadedFile = {
            name: req.file.originalname,
            fileName: req.file.filename,
            fileUrl: `/uploads/assignments/${req.file.filename}`,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date(),
        };

        res.json({
            message: 'File uploaded successfully',
            file: uploadedFile,
        });
    } catch (error) {
        console.error('Assignment File Upload Error:', error);
        res.status(500).json({ message: 'Failed to upload file', error: error.message });
    }
});

// ============================================
// DELIVERABLES UPLOAD (Admin/Worker)
// ============================================

const deliverablesDir = path.join(__dirname, '../uploads/deliverables');
if (!fs.existsSync(deliverablesDir)) {
    fs.mkdirSync(deliverablesDir, { recursive: true });
}

const deliverableStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, deliverablesDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueSuffix}-${sanitizedName}`);
    }
});

const deliverableUpload = multer({
    storage: deliverableStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for deliverables
});

// @desc    Upload deliverable files (completed work)
// @route   POST /api/upload/deliverables
// @access  Private (Admin/Worker)
router.post('/deliverables', protect, deliverableUpload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            fileName: file.filename,
            fileUrl: `/uploads/deliverables/${file.filename}`,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date(),
            isFinal: true,
        }));

        res.json({
            message: 'Deliverables uploaded successfully',
            files: uploadedFiles,
        });
    } catch (error) {
        console.error('Deliverable Upload Error:', error);
        res.status(500).json({ message: 'Failed to upload deliverables', error: error.message });
    }
});

// ============================================
// PROFILE PICTURE UPLOAD
// ============================================

const profilesDir = path.join(__dirname, '../uploads/profiles');
if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
}

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profilesDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `profile-${req.user._id}-${uniqueSuffix}${ext}`);
    }
});

const profileUpload = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG and WEBP images are allowed'), false);
        }
    }
});

// @desc    Upload profile picture
// @route   POST /api/upload/profile-picture
// @access  Private
router.post('/profile-picture', protect, profileUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image uploaded' });
        }

        const imageUrl = `/uploads/profiles/${req.file.filename}`;

        res.json({
            message: 'Profile picture uploaded successfully',
            imageUrl: imageUrl,
        });
    } catch (error) {
        console.error('Profile Picture Upload Error:', error);
        res.status(500).json({ message: 'Failed to upload profile picture', error: error.message });
    }
});

export default router;
