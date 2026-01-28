import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const user = await User.findById(decoded.id).select('-password');
            if (!user) {
                return res.status(401).json({ message: 'User no longer exists' });
            }

            // Check if session is still active
            if (decoded.sessionId) {
                const sessionExists = user.activeSessions.some(s => s.sessionId === decoded.sessionId);
                if (!sessionExists) {
                    return res.status(401).json({ message: 'Session has been revoked or expired' });
                }

                // Update last activity
                await User.updateOne(
                    { _id: user._id, 'activeSessions.sessionId': decoded.sessionId },
                    { $set: { 'activeSessions.$.lastActivity': new Date() } }
                );
            }

            req.user = user;
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role '${req.user ? req.user.role : 'unknown'}' is not authorized to access this route`
            });
        }
        next();
    };
};

export { protect, authorize };
