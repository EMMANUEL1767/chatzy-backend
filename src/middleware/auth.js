const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

async function authenticateToken(req, res, next) {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const db = getDb();
        const user = await db.get(
            'SELECT id, username, email FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'User not found' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'Invalid token' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'Token expired' 
            });
        }

        console.error('Authentication error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'An error occurred during authentication' 
        });
    }
}

module.exports = {
    authenticateToken
};