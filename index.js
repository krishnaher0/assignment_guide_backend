import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import connectDB from './config/db.js';
import { initializeSocket } from './config/socket.js';
import { initEmailService } from './services/emailService.js';
import { startDeadlineReminderScheduler } from './services/deadlineReminderService.js';

// Core routes (KEEP)
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import userRoutes from './routes/userRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import messageRoutes from './routes/messageRoutes.js';

// Worker routes (renamed from developer - internal team only)
import developerRoutes from './routes/developerRoutes.js';

// File upload routes
import uploadRoutes from './routes/uploadRoutes.js';

// Legacy routes kept for backwards compatibility
import chatRoutes from './routes/chatRoutes.js';
import teamRoutes from './routes/teamRoutes.js';

// OAuth routes
import { oauthUrlRouter, oauthCallbackRouter } from './routes/oauthRoutes.js';

// Security routes
import mfaRoutes from './routes/mfaRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';

// Security Middleware
import { loginLimiter, registerLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { checkAccountLockout, checkIPBlock } from './middleware/bruteForceProtection.js';
import { checkCaptchaRequired } from './middleware/captchaVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

connectDB();
initEmailService();

const app = express();
const server = createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);

// Store io instance in app for use in controllers
app.set('io', io);

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
}));
app.use(cors({
    origin: [
        process.env.CLIENT_URL || 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'https://www.projecthubnepal.app',
        'https://projecthubnepal.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// app.use(mongoSanitize());

// Rate Limiting (Using imported limiters from middleware/rateLimiter.js)
app.use('/api', apiLimiter);

// Authentication with Brute Force Protection
app.use('/api/auth/login', checkIPBlock, checkAccountLockout, checkCaptchaRequired, loginLimiter);
app.use('/api/auth/register', checkIPBlock, registerLimiter);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send('ProjectHub API - Academic Project Assistance Service');
});

// ============================================
// ACTIVE ROUTES
// ============================================

// Authentication (email/password + OAuth)
app.use('/api/auth', authRoutes);
app.use('/api/auth', oauthUrlRouter);
app.use('/auth', oauthCallbackRouter);

// MFA & Sessions
app.use('/api/mfa', mfaRoutes);
app.use('/api/sessions', sessionRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// User management
app.use('/api/users', userRoutes);

// Assignments (formerly orders)
app.use('/api/orders', orderRoutes);
// TODO: Add alias for cleaner API
// app.use('/api/assignments', orderRoutes);

// Quotes, Contracts, Invoices
app.use('/api/quotes', quoteRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);

// Payments
app.use('/api/payment', paymentRoutes);

// File uploads
app.use('/api/upload', uploadRoutes);

// Worker routes (internal team - renamed from developer)
app.use('/api/developer', developerRoutes);
// TODO: Add alias for cleaner API
// app.use('/api/worker', developerRoutes);

// Workspaces (Kanban boards for worker collaboration)
app.use('/api/workspaces', workspaceRoutes);

// Messaging
app.use('/api/messages', messageRoutes);
app.use('/api/chat', chatRoutes); // Legacy

// Notifications
app.use('/api/notifications', notificationRoutes);

// Analytics (admin only)
app.use('/api/analytics', analyticsRoutes);

// Settings
app.use('/api/settings', settingsRoutes);

// Team management (legacy)
app.use('/api/team', teamRoutes);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.io enabled for real-time notifications`);

    // Start background services
    startDeadlineReminderScheduler();
});