const { getDb } = require('../config/database');

async function searchUsers(req, res) {
    try {
        const { query } = req.query;
        const currentUserId = req.user.id;

        if (!query || query.trim().length < 2) {
            return res.json([]);
        }

        const db = getDb();
        const searchTerm = `%${query}%`;

        const users = await db.all(`
            SELECT id, username, email, created_at
            FROM users
            WHERE (username LIKE ? OR email LIKE ?)
            AND id != ?
            LIMIT 10
        `, [searchTerm, searchTerm, currentUserId]);

        res.json(users);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Error searching users' });
    }
}

async function getUserById(req, res) {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const db = getDb();
        
        const user = await db.get(`
            SELECT id, username, email, created_at
            FROM users
            WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Error fetching user' });
    }
}

module.exports = {
    searchUsers,
    getUserById
};