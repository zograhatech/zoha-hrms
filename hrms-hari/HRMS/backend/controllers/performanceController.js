const Goal = require('../models/Goal');
const Employee = require('../models/Employee');
const { normalizeRole, getVisibleEmployeeScope } = require('../utils/visibilityHelper');

exports.getGoals = async (req, res) => {
    try {
        const { type, employee_id, status } = req.query;
        const role = normalizeRole(req.user.role);
        let query = {};

        if (role === 'admin') {
            if (employee_id) {
                query.employee_id = employee_id;
            }
        } else if (role === 'employee') {
            if (employee_id && employee_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden. You can only view your own performance records.'
                });
            }
            if (employee_id) {
                query.employee_id = req.user.id;
            } else {
                query = {
                    $or: [
                        { employee_id: req.user.id },
                        { type: 'team' },
                        { type: 'organization' }
                    ]
                };
            }
        } else if (role === 'team_lead') {
            const scope = await getVisibleEmployeeScope(req.user);
            if (employee_id) {
                if (!scope.visibleIds.includes(employee_id)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden. Employee is outside your team scope.'
                    });
                }
                query.employee_id = employee_id;
            } else {
                query = {
                    $or: [
                        { employee_id: { $in: scope.visibleIds } },
                        { type: 'team' },
                        { type: 'organization' }
                    ]
                };
            }
        } else if (role === 'manager') {
            const scope = await getVisibleEmployeeScope(req.user);
            if (employee_id) {
                if (!scope.visibleIds.includes(employee_id)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden. Employee is outside your department scope.'
                    });
                }
                query.employee_id = employee_id;
            } else {
                query.employee_id = { $in: scope.visibleIds };
            }
        } else {
            if (employee_id && employee_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden. You can only view your own performance records.'
                });
            }
            query.employee_id = req.user.id;
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
