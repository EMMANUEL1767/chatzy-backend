const ChatService = require('../services/chatService');
const { getDb } = require('../config/database')

async function getConversations(req, res) {
    try {
        const conversations = await ChatService.getConversations(req.user.id);
        res.json(conversations);
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ 
            error: 'Error fetching conversations' 
        });
    }
}

// async function getMessages(req, res) {
//     try {
//         const { conversationId } = req.params;
//         const { before, limit } = req.query;
//         console.log(req.params, req.query, req.user.id)

//         const messages = await ChatService.getMessages(
//             conversationId,
//             req.user.id,
//             { before, limit: parseInt(limit) }
//         );
//         res.json(messages);
//     } catch (error) {
//         console.error('Get messages error:', error);
//         res.status(500).json({ 
//             error: error.message || 'Error fetching messages' 
//         });
//     }
// }
async function getMessages(req, res) {
    try {
        const db = getDb();
        const { conversationId } = req.params;
        const { before, limit = 50 } = req.query;

        // Ensure conversationId is treated as a number
        const conversationIdNum = parseInt(conversationId, 10);
        
        if (isNaN(conversationIdNum)) {
            return res.status(400).json({ error: 'Invalid conversation ID' });
        }

        // Verify user is participant
        const isParticipant = await db.get(`
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = ? AND user_id = ?
        `, [conversationIdNum, req.user.id]);

        if (!isParticipant) {
            return res.status(403).json({ error: 'Not authorized to access this conversation' });
        }

        let query = `
            SELECT 
                m.id,
                m.conversation_id,
                m.sender_id,
                m.content,
                m.status,
                m.created_at,
                u.username as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ?
        `;
        
        const params = [conversationIdNum];

        if (before) {
            const beforeDate = new Date(before);
            if (!isNaN(beforeDate.getTime())) {
                query += ' AND m.created_at < ?';
                params.push(beforeDate.toISOString());
            }
        }

        // Ensure limit is a number
        const limitNum = parseInt(limit, 10) || 50;
        query += ' ORDER BY m.created_at DESC LIMIT ?';
        params.push(limitNum);

        console.log('Query:', query);
        console.log('Params:', params);

        const messages = await db.all(query, params);

        // Mark messages as read
        await db.run(`
            UPDATE messages 
            SET status = 'read' 
            WHERE conversation_id = ? 
            AND sender_id != ? 
            AND status != 'read'
        `, [conversationIdNum, req.user.id]);

        res.json(messages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ 
            error: 'Error fetching messages',
            details: error.message 
        });
    }
}

// async function createConversation(req, res) {
//     try {
//         const { name, type, participantIds } = req.body;

//         const conversation = await ChatService.createConversation({
//             name,
//             type,
//             participantIds,
//             creatorId: req.user.id
//         });

//         res.status(201).json(conversation);
//     } catch (error) {
//         console.error('Create conversation error:', error);
//         res.status(500).json({ 
//             error: error.message || 'Error creating conversation' 
//         });
//     }
// }

async function createConversation(req, res) {
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

            console.log(conversation)

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

async function markMessageAsRead(req, res) {
    try {
        const { messageId } = req.params;
        await ChatService.markMessageAsRead(messageId, req.user.id);
        res.json({ message: 'Message marked as read' });
    } catch (error) {
        console.error('Mark message as read error:', error);
        res.status(500).json({ 
            error: error.message || 'Error marking message as read' 
        });
    }
}

async function deleteConversation(req, res) {
    try {
        const { conversationId } = req.params;
        await ChatService.deleteConversation(conversationId, req.user.id);
        res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ 
            error: error.message || 'Error deleting conversation' 
        });
    }
}

module.exports = {
    getConversations,
    getMessages,
    createConversation,
    markMessageAsRead,
    deleteConversation
};