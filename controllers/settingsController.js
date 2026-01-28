import Settings from '../models/Settings.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Upload QR code image
// @route   POST /api/settings/qr-code/upload
// @access  Private/Admin
export const uploadQRCode = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, '../uploads/qr-codes');
        await fs.mkdir(uploadsDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const filename = `qr-${req.user._id}-${timestamp}${ext}`;
        const filepath = path.join(uploadsDir, filename);

        // Save file
        await fs.writeFile(filepath, req.file.buffer);

        // Store URL in settings - use full URL for uploaded files
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:5000';
        const qrCodeUrl = `${protocol}://${host}/uploads/qr-codes/${filename}`;
        await Settings.setSetting('qr_code_url', qrCodeUrl, req.user._id, 'QR code image uploaded by admin');

        res.json({
            message: 'QR code uploaded successfully',
            qrCodeUrl,
        });
    } catch (error) {
        console.error('Upload QR Code Error:', error);
        res.status(500).json({ message: 'Failed to upload QR code', error: error.message });
    }
};
// @route   GET /api/settings/qr-code
// @access  Public (for clients to see QR)
export const getQRCodeSettings = async (req, res) => {
    try {
        const qrCodeUrl = await Settings.getSetting('qr_code_url', null);
        const qrCodeEnabled = await Settings.getSetting('qr_payment_enabled', false);
        const qrPaymentInstructions = await Settings.getSetting('qr_payment_instructions', 'Scan the QR code to make payment, then upload your payment screenshot.');

        res.json({
            qrCodeUrl,
            qrCodeEnabled,
            qrPaymentInstructions,
        });
    } catch (error) {
        console.error('Get QR Settings Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update QR code settings
// @route   PUT /api/settings/qr-code
// @access  Private/Admin
export const updateQRCodeSettings = async (req, res) => {
    try {
        const { qrCodeUrl, qrCodeEnabled, qrPaymentInstructions } = req.body;
        const adminId = req.user._id;

        const updates = {};

        if (qrCodeUrl !== undefined) {
            await Settings.setSetting('qr_code_url', qrCodeUrl, adminId, 'Static QR code image URL for payment fallback');
            updates.qrCodeUrl = qrCodeUrl;
        }

        if (qrCodeEnabled !== undefined) {
            await Settings.setSetting('qr_payment_enabled', qrCodeEnabled, adminId, 'Enable/disable QR code payment option');
            updates.qrCodeEnabled = qrCodeEnabled;
        }

        if (qrPaymentInstructions !== undefined) {
            await Settings.setSetting('qr_payment_instructions', qrPaymentInstructions, adminId, 'Instructions displayed to users for QR payment');
            updates.qrPaymentInstructions = qrPaymentInstructions;
        }

        res.json({
            message: 'QR code settings updated successfully',
            ...updates,
        });
    } catch (error) {
        console.error('Update QR Settings Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all settings (admin only)
// @route   GET /api/settings
// @access  Private/Admin
export const getAllSettings = async (req, res) => {
    try {
        const settings = await Settings.find().populate('updatedBy', 'name email');
        res.json(settings);
    } catch (error) {
        console.error('Get All Settings Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update a setting
// @route   PUT /api/settings/:key
// @access  Private/Admin
export const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;

        const setting = await Settings.setSetting(key, value, req.user._id, description);

        res.json({
            message: 'Setting updated successfully',
            setting,
        });
    } catch (error) {
        console.error('Update Setting Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
