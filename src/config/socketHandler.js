const jwt = require('jsonwebtoken');
const { getDb } = require('./database');

// Store connected users
const connectedUsers = new Map();

function setupSocketHandlers(io) {
    // Socket.IO middleware for authentication
    io.use(async (socket, next) => {
        try {
            // Get token from handshake query or headers
            const token = socket.handshake.query.token || 
                         socket.handshake.headers.authorization?.split(' ')[1] ||
                         socket.handshake.auth?.token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            const db = getDb();
            const user = await db.get(
                'SELECT id, username, email FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (!user) {
                return next(new Error('User not found'));
            }

            // Attach user to socket
            socket.user = user;
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Invalid token'));
        }
    });

    // Connected users map
    const connectedUsers = new Map();

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        connectedUsers.set(userId, socket.id);
        
        console.log(`User connected: ${userId}`);

        // Join conversation
        socket.on('join_conversation', async (conversationId) => {
            try {
                const db = getDb();
                const isParticipant = await db.get(
                    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                    [conversationId, userId]
                );

                if (!isParticipant) {
                    socket.emit('error', { message: 'Not authorized to join this conversation' });
                    return;
                }

                socket.join(`conversation:${conversationId}`);
                console.log(`User ${userId} joined conversation ${conversationId}`);
            } catch (error) {
                console.error('Join conversation error:', error);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });

        // Leave conversation
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            console.log(`User ${userId} left conversation ${conversationId}`);
        });

        // Handle messages
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, content } = data;
                const db = getDb();

                // Save message
                const result = await db.run(`
                    INSERT INTO messages (conversation_id, sender_id, content, status)
                    VALUES (?, ?, ?, ?)
                `, [conversationId, userId, content, 'sent']);

                // Get complete message data
                const message = await db.get(`
                    SELECT m.*, u.username as sender_name
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.id = ?
                `, [result.lastID]);

                // Find other participants
                const participants = await db.all(`
                    SELECT user_id
                    FROM conversation_participants
                    WHERE conversation_id = ? AND user_id != ?
                `, [conversationId, userId]);

                // Check if recipients are online
                const onlineParticipants = participants.filter(p => 
                    connectedUsers.has(p.user_id)
                );

                if (onlineParticipants.length > 0) {
                    // Update status to delivered for online users
                    await db.run(`
                        UPDATE messages
                        SET status = 'delivered'
                        WHERE id = ?
                    `, [result.lastID]);
                    message.status = 'delivered';
                }

                // Emit to sender with status
                socket.emit('message_sent', {
                    messageId: result.lastID,
                    status: message.status
                });

                // Emit to conversation room
                io.to(`conversation:${conversationId}`).emit('new_message', message);
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('message_error', { error: 'Failed to send message' });
            }
        });

        // Handle message status updates
        socket.on('message_delivered', async ({ messageId }) => {
            try {
                const db = getDb();
                
                // Update message status
                await db.run(`
                    UPDATE messages
                    SET status = 'delivered'
                    WHERE id = ?
                `, [messageId]);

                // Get sender ID
                const message = await db.get(
                    'SELECT sender_id FROM messages WHERE id = ?',
                    [messageId]
                );

                // Notify sender if online
                const senderSocket = connectedUsers.get(message.sender_id);
                if (senderSocket) {
                    io.to(senderSocket).emit('message_status', {
                        messageId,
                        status: 'delivered'
                    });
                }
            } catch (error) {
                console.error('Message status update error:', error);
            }
        });

        socket.on('message_read', async ({ messageId }) => {
            try {
                const db = getDb();
                
                // Update message status
                await db.run(`
                    UPDATE messages
                    SET status = 'read'
                    WHERE id = ?
                `, [messageId]);

                // Get sender ID
                const message = await db.get(
                    'SELECT sender_id FROM messages WHERE id = ?',
                    [messageId]
                );

                // Notify sender if online
                const senderSocket = connectedUsers.get(message.sender_id);
                if (senderSocket) {
                    io.to(senderSocket).emit('message_status', {
                        messageId,
                        status: 'read'
                    });
                }
            } catch (error) {
                console.error('Message status update error:', error);
            }
        });

        // Typing indicators
        socket.on('typing_start', (conversationId) => {
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId,
                conversationId
            });
        });

        socket.on('typing_stop', (conversationId) => {
            socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
                userId,
                conversationId
            });
        });

        // Disconnect
        socket.on('disconnect', () => {
            connectedUsers.delete(userId);
            console.log(`User disconnected: ${userId}`);
        });
    });

    return io;
}

module.exports = {
    setupSocketHandlers,
    connectedUsers
};