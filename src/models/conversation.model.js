const { getDb } = require('../config/database');

class Conversation {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = data.type;
        this.created_at = data.created_at;
        this.last_message = data.last_message;
        this.participants = data.participants || [];
    }

    static async findById(id) {
        try {
            const db = getDb();
            const conversationData = await db.get(
                'SELECT * FROM conversations WHERE id = ?',
                [id]
            );

            if (!conversationData) return null;

            // Get participants
            const participants = await db.all(`
                SELECT u.id, u.username, u.email
                FROM users u
                JOIN conversation_participants cp ON u.id = cp.user_id
                WHERE cp.conversation_id = ?
            `, [id]);

            // Get last message
            const lastMessage = await db.get(`
                SELECT m.*, u.username as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.conversation_id = ?
                ORDER BY m.created_at DESC
                LIMIT 1
            `, [id]);

            conversationData.participants = participants;
            conversationData.last_message = lastMessage;

            return new Conversation(conversationData);
        } catch (error) {
            console.error('Error finding conversation:', error);
            throw error;
        }
    }

    static async create({ name, type = 'direct', participantIds }) {
        try {
            const db = getDb();
            await db.run('BEGIN TRANSACTION');

            try {
                // Create conversation
                const result = await db.run(
                    'INSERT INTO conversations (name, type) VALUES (?, ?)',
                    [name, type]
                );

                const conversationId = result.lastID;

                // Add participants
                for (const userId of participantIds) {
                    await db.run(
                        'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
                        [conversationId, userId]
                    );
                }

                await db.run('COMMIT');
                return await Conversation.findById(conversationId);
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }
    }

    async getMessages(limit = 50, before = null) {
        try {
            const db = getDb();
            let query = `
                SELECT m.*, u.username as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.conversation_id = ?
            `;
            const params = [this.id];

            if (before) {
                query += ' AND m.created_at < ?';
                params.push(before);
            }

            query += ' ORDER BY m.created_at DESC LIMIT ?';
            params.push(limit);

            const messages = await db.all(query, params);
            return messages.reverse();
        } catch (error) {
            console.error('Error getting messages:', error);
            throw error;
        }
    }

    async addParticipant(userId) {
        try {
            const db = getDb();
            await db.run(
                'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
                [this.id, userId]
            );
            
            const user = await db.get(
                'SELECT id, username, email FROM users WHERE id = ?',
                [userId]
            );
            
            this.participants.push(user);
            return this;
        } catch (error) {
            console.error('Error adding participant:', error);
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            created_at: this.created_at,
            last_message: this.last_message,
            participants: this.participants
        };
    }
}

module.exports = Conversation;