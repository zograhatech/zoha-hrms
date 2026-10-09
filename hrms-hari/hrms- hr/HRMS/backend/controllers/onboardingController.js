const Onboarding = require('../models/Onboarding');
const Employee = require('../models/Employee');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { sendEmail } = require('../utils/emailService');

// Helper Function for Promotion
const convertToEmployee = async (onboarding) => {
    const existingEmp = await Employee.findOne({ email: onboarding.email });
    if (existingEmp) throw new Error('Employee with this email already exists!');

    // Generate credentials
    const plainPassword = 'Welcome@123';
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    
    // Auto-Generate Employee ID
    const empCount = await Employee.countDocuments();
    const nextId = `EMP${String(empCount + 1).padStart(3, '0')}`;

    // Create Employee record
    const employeePayload = {
        id: nextId,
        name: onboarding.name,
        email: onboarding.email,
        phone: onboarding.phone,
        password_hash: passwordHash,
        designation: onboarding.applied_role,
        qualification: onboarding.qualification || '',
        experience_type: onboarding.experience_type || '',
        experience_years: onboarding.experience_years || '',
        address: onboarding.address || '',
        role: 'employee',
        status: 'active',
        date_of_joining: onboarding.start_date || new Date()
    };

    // Only add department_id if it's a valid MongoDB ObjectId
    if (onboarding.department_id && onboarding.department_id !== "" && mongoose.Types.ObjectId.isValid(onboarding.department_id)) {
        employeePayload.department_id = onboarding.department_id;
    }

    const newEmployee = await Employee.create(employeePayload);

    // Send Welcome Email
    await sendEmail({
        to: onboarding.email,
        subject: 'Welcome to the Team! - Your Account Credentials',
        html: `
            <h3>Welcome to Hari Hrms, ${onboarding.name}!</h3>
            <p>Your onboarding process has reached the <strong>Orientation</strong> stage, and your employee account has been created.</p>
            <p>You can now log in to the HRMS portal using the following credentials:</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Username:</strong> ${onboarding.email}</p>
                <p><strong>Password:</strong> ${plainPassword}</p>
            </div>
            <p>Please change your password after your first login.</p>
            <p>Welcome aboard!</p>
        `
    });

    // Delete Onboarding profile upon success
    await Onboarding.findByIdAndDelete(onboarding._id);

    return newEmployee;
};

// GET /api/onboarding
const getOnboardings = async (req, res) => {
    try {
        const onboardings = await Onboarding.find().sort({ createdAt: -1 });
        res.json({ success: true, onboardings });
    } catch (err) {
        console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ success: false, message: 'Server error.', error: err.message });
    }
};

// POST /api/onboarding
const createOnboarding = async (req, res) => {
    try {
        const { name, email, phone, applied_role, department_id, start_date, notes, status } = req.body;
        const existing = await Onboarding.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Candidate with this email already exists.' });

        const onboarding = await Onboarding.create({ name, email, phone, applied_role, department_id, start_date, notes, status: status || 'Offer Accepted' });

        res.status(201).json({ success: true, message: 'Onboarding record created.', onboarding });
    } catch (err) {
        console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ success: false, message: 'Server error.', error: err.message });
    }
};

// PUT /api/onboarding/:id
const updateOnboarding = async (req, res) => {
    try {
        const onboarding = await Onboarding.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found.' });

        res.json({ success: true, message: 'Onboarding record updated.', onboarding });
    } catch (err) {
        console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ success: false, message: 'Server error.', error: err.message });
    }
};

// DELETE /api/onboarding/:id
const deleteOnboarding = async (req, res) => {
    try {
        const onboarding = await Onboarding.findByIdAndDelete(req.params.id);
        if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found.' });
        res.json({ success: true, message: 'Onboarding record deleted.' });
    } catch (err) {
        console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ success: false, message: 'Server error.', error: err.message });
    }
};

// POST /api/onboarding/:id/promote
const promoteOnboarding = async (req, res) => {
    try {
        const onboarding = await Onboarding.findById(req.params.id);
        if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found.' });

        const newEmployee = await convertToEmployee(onboarding);

        res.json({ success: true, message: 'Candidate successfully converted to Employee! Credentials sent via email.', employee: newEmployee });
    } catch (err) {
        console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ success: false, message: 'Server error.', error: err.message });
    }
};

module.exports = { getOnboardings, createOnboarding, updateOnboarding, deleteOnboarding, promoteOnboarding };
