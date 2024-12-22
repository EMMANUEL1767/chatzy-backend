const AuthService = require('../services/authService');

async function register(req, res) {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        const result = await AuthService.registerUser({
            username,
            email,
            password
        });

        // Set cookie with token
        res.cookie('token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ 
            error: error.message || 'Error during registration' 
        });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        const result = await AuthService.loginUser({ email, password });

        // Set cookie with token
        res.cookie('token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        console.log("Eurekka::", result)

        res.json({
            message: 'Login successful',
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ 
            error: error.message || 'Invalid credentials' 
        });
    }
}

function logout(req, res) {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
}

module.exports = {
    register,
    login,
    logout
};