const Department = require('../models/Department');
const Employee = require('../models/Employee');

// GET /api/departments
const getDepartments = async (req, res) => {
    try {
        const departments = await Department.find().sort({ name: 1 }).lean();

        // Count employees per department
        const counts = await Employee.aggregate([
            { $match: { status: 'active', department_id: { $ne: null } } },
            { $group: { _id: '$department_id', count: { $sum: 1 } } },
        ]);
        const countMap = Object.fromEntries(counts.map(c => [c._id?.toString(), c.count]));

        // Resolve manager names in one batch query
        const managerIds = [...new Set(departments.map(d => d.manager_id).filter(Boolean))];
        const managers = managerIds.length
            ? await Employee.find({ id: { $in: managerIds } }).select('id name').lean()
            : [];
        const managerMap = Object.fromEntries(managers.map(m => [m.id, m.name]));

        const result = departments.map(d => ({
            ...d,
            employee_count: countMap[d._id?.toString()] || 0,
            manager_name: d.manager_id ? (managerMap[d.manager_id] || null) : null,
        }));

        res.json({ success: true, departments: result });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/departments
const createDepartment = async (req, res) => {
    try {
        const { name, description, manager_id } = req.body;
        const existing = await Department.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existing) return res.status(400).json({ success: false, message: 'Department with this name already exists.' });

        const dept = await Department.create({ name, description, manager_id });
        res.status(201).json({ success: true, message: 'Department created.', department: { ...dept.toObject(), employee_count: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/departments/:id
const updateDepartment = async (req, res) => {
    try {
        const { name, description, manager_id } = req.body;
        const dept = await Department.findByIdAndUpdate(req.params.id, { name, description, manager_id }, { returnDocument: 'after', runValidators: true });
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
        res.json({ success: true, message: 'Department updated.', department: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// DELETE /api/departments/:id
const deleteDepartment = async (req, res) => {
    try {
        const empCount = await Employee.countDocuments({ department_id: req.params.id });
        if (empCount > 0) return res.status(400).json({ success: false, message: `Cannot delete: ${empCount} employee(s) still assigned to this department.` });
        const dept = await Department.findByIdAndDelete(req.params.id);
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
        res.json({ success: true, message: 'Department deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getDepartments, createDepartment, updateDepartment, deleteDepartment };
