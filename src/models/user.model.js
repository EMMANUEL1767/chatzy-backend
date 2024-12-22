const { getDb } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    constructor(data) {
        this.id = data.id;
        this.username = data.username;
        this.email = data.email;
        this.password = data.password;
        this.created_at = data.created_at;
    }

    static async findById(id) {
        try {
            const db = getDb();
            const userData = await db.get(
                'SELECT id, username, email, created_at FROM users WHERE id = ?',
                [id]
            );
            return userData ? new User(userData) : null;
        } catch (error) {
            console.error('Error finding user:', error);
            throw error;
        }
    }

    static async findByEmail(email) {
        try {
            const db = getDb();
            const userData = await db.get(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            return userData ? new User(userData) : null;
        } catch (error) {
            console.error('Error finding user:', error);
            throw error;
        }
    }

    static async create({ username, email, password }) {
        try {
            const db = getDb();
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const result = await db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword]
            );

            const userData = await db.get(
                'SELECT id, username, email, created_at FROM users WHERE id = ?',
                [result.lastID]
            );

            return new User(userData);
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async verifyPassword(password) {
        return bcrypt.compare(password, this.password);
    }

    async getConversations() {
        try {
            const db = getDb();
            const conversations = await db.all(`
                SELECT c.* 
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                WHERE cp.user_id = ?
            `, [this.id]);
            return conversations;
        } catch (error) {
            console.error('Error getting user conversations:', error);
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            created_at: this.created_at
        };
    }
}

module.exports = User;