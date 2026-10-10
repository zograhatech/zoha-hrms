const Payment = require('../models/Payment');
const Employee = require('../models/Employee');

// POST /api/payments
const submitPayment = async (req, res) => {
    try {
        const { module_key, module_name, amount, transaction_id, receipt_image } = req.body;
        const employee = await Employee.findOne({ id: req.user.id });
        
        const newPayment = new Payment({
            employee_id: req.user.id,
            employee_name: employee?.name || 'Unknown',
            module_key,
            module_name,
            amount,
            transaction_id,
            receipt_image,
            status: 'pending'
        });
        
        await newPayment.save();
        res.json({ success: true, message: 'Payment receipt submitted successfully. Admin will verify shortly!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error submitting payment.' });
    }
};

// GET /api/payments/my
const getMyPayments = async (req, res) => {
    try {
        const payments = await Payment.find({ employee_id: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, payments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching history.' });
    }
};

// GET /api/payments/all (Admin)
const getAllPayments = async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 });
        res.json({ success: true, payments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching all payments.' });
    }
};

// PUT /api/payments/:id (Approve/Reject)
const updatePaymentStatus = async (req, res) => {
    try {
        const { status, remarks } = req.body;
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
        
        payment.status = status;
        payment.remarks = remarks;
        await payment.save();
        
        // If approved, automatically grant the permission to the user?
        if (status === 'approved') {
            await Employee.updateOne(
                { id: payment.employee_id },
                { $addToSet: { permissions: payment.module_key } }
            );

            // Emit real-time update if socket is available
            try {
                const { getIO } = require('../socket');
                const io = getIO();
                io.to(payment.employee_id).emit('permission_update', { 
                    module_key: payment.module_key,
                    module_name: payment.module_name,
                    message: `Congratulations! The ${payment.module_name} module has been unlocked.`
                });
            } catch (err) {
                console.warn('Socket emit failed for permission update:', err.message);
            }
        }
        
        res.json({ success: true, message: `Payment ${status}!` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error updating status.' });
    }
};

module.exports = { submitPayment, getMyPayments, getAllPayments, updatePaymentStatus };
