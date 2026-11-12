const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const auth = require('../middleware/auth');

router.use(auth());

router.post('/', conversationController.createConversation);
router.post('/group', conversationController.createGroup);
router.get('/admin/all', conversationController.getAdminConversations);
router.get('/admin/:id/messages', conversationController.getAdminConversationMessages);
router.get('/admin/:id/export', require('../controllers/messageController').exportConversation);
router.get('/', conversationController.getConversations);
router.get('/directory', conversationController.getContactDirectory);
router.delete('/:id', conversationController.deleteConversation);

module.exports = router;
