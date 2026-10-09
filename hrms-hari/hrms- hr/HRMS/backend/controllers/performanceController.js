const Goal = require('../models/Goal');
const Employee = require('../models/Employee');

exports.getGoals = async (req, res) => {
    try {
        const { type, employee_id, status } = req.query;
        let query = {};
        
        // Employee only sees their own or their team/org goals
        if (req.user.role === 'employee') {
            query = { 
                $or: [
                    { employee_id: req.user.id },
                    { type: 'team' }, // To be refined by department in a real scenario
                    { type: 'organization' }
                ]
            };
        } else if (employee_id) {
            query.employee_id = employee_id;
        }

        if (type) query.type = type;
        if (status) query.status = status;

        const goals = await Goal.find(query).sort({ createdAt: -1 });
        res.json({ success: true, goals });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createGoal = async (req, res) => {
    try {
        const goal = await Goal.create({ ...req.body, creator_id: req.user.id });
        res.status(201).json({ success: true, message: 'Goal created successfully', goal });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateGoal = async (req, res) => {
    try {
        const goal = await Goal.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json({ success: true, message: 'Goal updated', goal });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteGoal = async (req, res) => {
    try {
        await Goal.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Goal deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// KPI Update specific endpoint (for easy progress tracking)
exports.updateKPI = async (req, res) => {
    try {
        const { goalId, kpiId, current } = req.body;
        const goal = await Goal.findById(goalId);
        const kpi = goal.kpis.id(kpiId);
        if (kpi) {
            kpi.current = current;
            kpi.last_updated = Date.now();
            await goal.save(); // Triggers progress recalculation
            res.json({ success: true, message: 'KPI updated', progress: goal.progress });
        } else {
            res.status(404).json({ success: false, message: 'KPI not found' });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
