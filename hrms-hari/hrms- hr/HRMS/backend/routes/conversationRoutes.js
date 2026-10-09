const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const auth = require('../middleware/auth');

router.use(auth());

router.post('/', conversationController.createConversation);
router.post('/group', conversationController.createGroup);
router.get('/', conversationController.getConversations);
router.delete('/:id', conversationController.deleteConversation);

module.exports = router;
