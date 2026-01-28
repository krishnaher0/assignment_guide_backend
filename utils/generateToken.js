import jwt from 'jsonwebtoken';

const generateToken = (id, sessionId = null) => {
    return jwt.sign({ id, sessionId }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

export default generateToken;
