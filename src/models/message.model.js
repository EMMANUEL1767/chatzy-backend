const { getDb } = require('../config/database');

class Message {
    constructor(data) {
        this.id = data.id;
        this.conversation_id = data.conversation_id;
        this.sender_id = data.sender_id;
        this.content = data.content;
        this.status = data.status;
        this.created_at = data.created_at;
        this.sender_name = data.sender_name;
    }

    static async findById(id) {
        try {
            const db = getDb();
            const messageData = await db.get(`
                SELECT m.*, u.username as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = ?
            `, [id]);
            return messageData ? new Message(messageData) : null;
        } catch (error) {
            console.error('Error finding message:', error);
            throw error;
        }
    }

    static async create({ conversation_id, sender_id, content }) {
        try {
            const db = getDb();
            const result = await db.run(
                'INSERT INTO messages (conversation_id, sender_id, content, status) VALUES (?, ?, ?, ?)',
                [conversation_id, sender_id, content, 'sent']
            );

            return await Message.findById(result.lastID);
        } catch (error) {
            console.error('Error creating message:', error);
            throw error;
        }
    }

    async updateStatus(status) {
        try {
            const db = getDb();
            await db.run(
                'UPDATE messages SET status = ? WHERE id = ?',
                [status, this.id]
            );
            this.status = status;
            return this;
        } catch (error) {
            console.error('Error updating message status:', error);
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            conversation_id: this.conversation_id,
            sender_id: this.sender_id,
            content: this.content,
            status: this.status,
            created_at: this.created_at,
            sender_name: this.sender_name
        };
    }
}

module.exports = Message;