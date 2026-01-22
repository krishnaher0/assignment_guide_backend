import { Server } from 'socket.io';

let io;

// Store connected users: { userId: socketId }
const connectedUsers = new Map();

export const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                process.env.CLIENT_URL || 'http://localhost:5173',
                'http://localhost:5173',
                'http://localhost:3000',
                'http://127.0.0.1:5173',
            ],
            methods: ['GET', 'POST'],
            credentials: true,
            transports: ['websocket', 'polling'],
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // User joins with their user ID
        socket.on('join', (userId) => {
            if (userId) {
                socket.userId = userId;
                connectedUsers.set(userId, socket.id);
                socket.join(`user:${userId}`);
                console.log(`User ${userId} joined room user:${userId}`);
            }
        });

        // Join role-based rooms (admin, developer, client)
        socket.on('joinRole', (role) => {
            if (role) {
                socket.join(`role:${role}`);
                console.log(`Socket ${socket.id} joined room role:${role}`);
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            if (socket.userId) {
                connectedUsers.delete(socket.userId);
                console.log(`User ${socket.userId} disconnected`);
            }
        });

        // Handle connection errors
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        // Handle notification action response
        socket.on('notificationAction', async (data) => {
            const { notificationId, actionId, response } = data;
            console.log(`Notification action: ${actionId} on ${notificationId}`, response);
            // This can be used for real-time feedback
        });
    });

    io.engine.on('connection_error', (err) => {
        console.log('Connection error:', err);
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

// Send notification to a specific user
export const sendToUser = (userId, event, data) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
};

// Send notification to all users with a specific role
export const sendToRole = (role, event, data) => {
    if (io) {
        io.to(`role:${role}`).emit(event, data);
    }
};

// Send notification to multiple users
export const sendToUsers = (userIds, event, data) => {
    if (io) {
        userIds.forEach(userId => {
            io.to(`user:${userId}`).emit(event, data);
        });
    }
};

// Broadcast to all connected clients
export const broadcast = (event, data) => {
    if (io) {
        io.emit(event, data);
    }
};

export default {
    initializeSocket,
    getIO,
    sendToUser,
    sendToRole,
    sendToUsers,
    broadcast,
};
