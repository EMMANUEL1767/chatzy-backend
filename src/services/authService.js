const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

class AuthService {
    static async registerUser({ username, email, password }) {
        try {
            // Validate input
            if (!username || !email || !password) {
                throw new Error('Missing required fields');
            }

            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }

            // Check if user exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                throw new Error('Email already registered');
            }

            // Create user
            const user = await User.create({
                username,
                email,
                password
            });

            // Generate token
            const token = this.generateToken(user.id);

            return {
                user: user.toJSON(),
                token
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    static async loginUser({ email, password }) {
        try {
            // Find user
            const user = await User.findByEmail(email);
            if (!user) {
                throw new Error('Invalid credentials');
            }

            // Verify password
            const validPassword = await user.verifyPassword(password);
            if (!validPassword) {
                throw new Error('Invalid credentials');
            }

            // Generate token
            const token = this.generateToken(user.id);

            return {
                user: user.toJSON(),
                token
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    static generateToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
    }

    static async validateToken(token) {
        try {
            if (!token) {
                throw new Error('No token provided');
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);

            if (!user) {
                throw new Error('User not found');
            }

            return user.toJSON();
        } catch (error) {
            console.error('Token validation error:', error);
            throw error;
        }
    }

    static async changePassword(userId, { currentPassword, newPassword }) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Verify current password
            const validPassword = await user.verifyPassword(currentPassword);
            if (!validPassword) {
                throw new Error('Current password is incorrect');
            }

            // Validate new password
            if (newPassword.length < 6) {
                throw new Error('New password must be at least 6 characters long');
            }

            // Update password
            await user.update({ password: newPassword });
            return true;
        } catch (error) {
            console.error('Password change error:', error);
            throw error;
        }
    }
}

module.exports = AuthService;