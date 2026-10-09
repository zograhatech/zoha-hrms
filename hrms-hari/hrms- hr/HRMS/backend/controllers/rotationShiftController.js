const RotationShift = require('../models/RotationShift');
const Employee = require('../models/Employee');

const getRotations = async (req, res) => {
    try {
        const rotations = await RotationShift.find();
        res.json({ success: true, rotations });
    } catch (err) {
        console.error('[getRotations]', err);
        res.status(500).json({ success: false, message: 'Server error fetching rotation shifts.' });
    }
};

const createRotation = async (req, res) => {
    try {
        const { name, frequency, shifts } = req.body;
        
        const existing = await RotationShift.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: 'Rotation policy with this name already exists.' });

        const rotation = await RotationShift.create({ name, frequency, shifts });
        res.status(201).json({ success: true, message: 'Rotation policy created.', rotation });
    } catch (err) {
        console.error('[createRotation]', err);
        res.status(500).json({ success: false, message: 'Server error creating rotation policy.' });
    }
};

const updateRotationInfo = async (req, res) => {
    try {
        const rotationId = req.params.id;
        const oldRotation = await RotationShift.findById(rotationId);
        
        const rotation = await RotationShift.findByIdAndUpdate(rotationId, req.body, { new: true });
        if (!rotation) return res.status(404).json({ success: false, message: 'Rotation policy not found.' });
        
        // Notify new employees
        if (req.body.assigned_staff) {
            const oldStaff = oldRotation && oldRotation.assigned_staff ? oldRotation.assigned_staff.map(id => id.toString()) : [];
            const newStaff = req.body.assigned_staff;
            
            // Find newly added staff members
            const addedStaffIds = newStaff.filter(id => !oldStaff.includes(id));
            
            if (addedStaffIds.length > 0) {
                const newEmployees = await Employee.find({ _id: { $in: addedStaffIds } });
                const { sendEmail } = require('../utils/emailService');
                
                const shiftSequence = rotation.shifts.join(' → ');
                
                for (const emp of newEmployees) {
                    if (emp.email) {
                        const targetEmail = emp.email;
                        
                        sendEmail({
                            to: targetEmail,
                            subject: `🗓️ New Shift Rotation Assignment: ${rotation.name}`,
                            text: `Hello ${emp.name}, you've been assigned to the rotation shift: ${rotation.name}. Schedule follows a ${rotation.frequency} pattern. Sequence: ${shiftSequence}.`,
                            html: `
                                <h2 style="color: #6366f1;">New Shift Assignment</h2>
                                <p>Hello <strong>${emp.name}</strong>,</p>
                                <p>Your automated shift schedule has been successfully updated by HR.</p>
                                
                                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
                                    <p style="margin: 0 0 10px 0;"><strong>Rotation Plan:</strong> ${rotation.name}</p>
                                    <p style="margin: 0 0 10px 0;"><strong>Change Frequency:</strong> ${rotation.frequency}</p>
                                    <p style="margin: 0;"><strong>Shift Sequence:</strong> <span style="color: #10b981; font-weight: bold;">${shiftSequence}</span></p>
                                </div>
                                
                                <p>Please log in to your HRMS portal to view your updated calendar synchronization.</p>
                            `
                        }).catch(console.error); // Safe-fail if mailer is down
                    }
                }
            }
        }

        res.json({ success: true, message: 'Rotation policy updated and staff notified.', rotation });
    } catch (err) {
        console.error('[updateRotation]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

const deleteRotation = async (req, res) => {
    try {
        await RotationShift.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Deleted successfully.' });
    } catch (err) {
        console.error('[deleteRotation]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getRotations, createRotation, updateRotationInfo, deleteRotation };
