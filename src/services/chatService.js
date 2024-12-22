const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const { getDb } = require('../config/database');

class ChatService {
    static async getConversations(userId) {
        try {
            const db = getDb();
            const conversations = await db.all(`
                SELECT 
                    c.*,
                    m.content as last_message,
                    m.created_at as last_message_time,
                    m.sender_id as last_message_sender_id,
                    u.username as last_message_sender_name,
                    COUNT(DISTINCT cp.user_id) as participant_count,
                    (
                        SELECT COUNT(*)
                        FROM messages msg
                        WHERE msg.conversation_id = c.id
                        AND msg.sender_id != ?
                        AND msg.status = 'sent'
                    ) as unread_count
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                LEFT JOIN messages m ON m.id = (
                    SELECT id FROM messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE cp.user_id = ?
                GROUP BY c.id
                ORDER BY m.created_at DESC NULLS LAST
            `, [userId, userId]);

            // Get participants for each conversation
            for (let conv of conversations) {
                conv.participants = await db.all(`
                    SELECT u.id, u.username, u.email
                    FROM users u
                    JOIN conversation_participants cp ON u.id = cp.user_id
                    WHERE cp.conversation_id = ?
                `, [conv.id]);
            }

            return conversations;
        } catch (error) {
            console.error('Get conversations error:', error);
            throw error;
        }
    }

    static async createConversation(req, res) {
        const db = getDb();
            
        try {
            const { name, type, participantIds } = req.body;
            const creatorId = req.user.id;

            // Validate input
            if (!type || !participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
                return res.status(400).json({ error: 'Invalid input' });
            }

            // Validate conversation type
            if (type === 'direct' && participantIds.length !== 1) {
                return res.status(400).json({ error: 'Direct conversations must have exactly one participant' });
            }

            // Start transaction
            await db.run('BEGIN TRANSACTION');

            try {
                // Create conversation
                const conversationResult = await db.run(`
                        INSERT INTO conversations (name, type, created_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `, [name || null, type]);

                const conversationId = conversationResult.lastID;

                // Add all participants including the creator
                const allParticipants = [...new Set([...participantIds, creatorId])];
                for (const participantId of allParticipants) {
                    await db.run(`
                            INSERT INTO conversation_participants (conversation_id, user_id)
                            VALUES (?, ?)
                        `, [conversationId, participantId]);
                }

                // Get the created conversation with participants
                const conversation = await db.get(`
                        SELECT c.*
                        FROM conversations c
                        WHERE c.id = ?
                    `, [conversationId]);

                // Get participants
                const participants = await db.all(`
                        SELECT u.id, u.username, u.email, u.created_at
                        FROM users u
                        JOIN conversation_participants cp ON u.id = cp.user_id
                        WHERE cp.conversation_id = ?
                    `, [conversationId]);

                conversation.participants = participants;

                await db.run('COMMIT');

                res.status(201).json(conversation);
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('Create conversation error:', error);
            res.status(500).json({ error: 'Error creating conversation' });
        }
    }

    static async getMessages(conversationId, userId, { limit = 50, before = null } = {}) {
        try {
            const db = getDb();

            // Verify user is participant
            const isParticipant = await db.get(`
                SELECT * FROM conversation_participants 
                WHERE conversation_id = ? AND user_id = ?
            `, [conversationId, userId]);

            if (!isParticipant) {
                throw new Error('Not authorized to access this conversation');
            }

            // Get messages
            let query = `
                SELECT m.*, u.username as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.conversation_id = ?
            `;
            const params = [conversationId];

            if (before) {
                query += ' AND m.created_at < ?';
                params.push(before);
            }

            query += ' ORDER BY m.created_at DESC LIMIT ?';
            params.push(parseInt(limit));

            const messages = await db.all(query, params);

            // Mark messages as read
            await db.run(`
                UPDATE messages 
                SET status = 'read' 
                WHERE conversation_id = ? 
                AND sender_id != ? 
                AND status != 'read'
            `, [conversationId, userId]);

            return messages.reverse();
        } catch (error) {
            console.error('Get messages error:', error);
            throw error;
        }
    }

    static async markMessageAsRead(messageId, userId) {
        try {
            const message = await Message.findById(messageId);
            if (!message) {
                throw new Error('Message not found');
            }

            const db = getDb();
            // Verify user is participant
            const isParticipant = await db.get(`
                SELECT 1 FROM conversation_participants 
                WHERE conversation_id = ? AND user_id = ?
            `, [message.conversation_id, userId]);

            if (!isParticipant) {
                throw new Error('Not authorized to access this message');
            }

            await message.updateStatus('read');
            return message;
        } catch (error) {
            console.error('Mark message as read error:', error);
            throw error;
        }
    }

    static async deleteConversation(conversationId, userId) {
        try {
            const db = getDb();
            
            // Verify user is participant
            const isParticipant = await db.get(`
                SELECT 1 FROM conversation_participants 
                WHERE conversation_id = ? AND user_id = ?
            `, [conversationId, userId]);

            if (!isParticipant) {
                throw new Error('Not authorized to delete this conversation');
            }

            await db.run('BEGIN TRANSACTION');

            try {
                // Delete messages
                await db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
                
                // Delete participants
                await db.run('DELETE FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
                
                // Delete conversation
                await db.run('DELETE FROM conversations WHERE id = ?', [conversationId]);

                await db.run('COMMIT');
                return true;
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('Delete conversation error:', error);
            throw error;
        }
    }

    static async addParticipant(conversationId, userId, newParticipantId) {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            // Verify user is participant
            const isParticipant = conversation.participants.some(p => p.id === userId);
            if (!isParticipant) {
                throw new Error('Not authorized to modify this conversation');
            }

            await conversation.addParticipant(newParticipantId);
            return conversation;
        } catch (error) {
            console.error('Add participant error:', error);
            throw error;
        }
    }
}

module.exports = ChatService;