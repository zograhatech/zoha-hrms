const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createTicket, getEmployeeTickets, getAllTickets, updateTicket } = require('../controllers/ticketController');

router.post('/create', auth(), createTicket);
router.get('/all', auth(['manage_tickets', 'hr_manager', 'hr', 'it_admin', 'tickets_all']), getAllTickets);
router.put('/:id/update', auth(['manage_tickets', 'hr_manager', 'hr', 'it_admin', 'tickets_all']), updateTicket);

router.get('/:employeeId', auth(), getEmployeeTickets);

module.exports = router;
