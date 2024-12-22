const express = require('express');
const router = express.Router();
const {
    getConversations,
    getMessages,
    createConversation,
    markMessageAsRead,
    deleteConversation
} = require('../controllers/chatController');

router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.delete('/conversations/:conversationId', deleteConversation);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/messages/:messageId/read', markMessageAsRead);

module.exports = router;