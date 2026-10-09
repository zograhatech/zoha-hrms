import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import DateInput from '../../components/DateInput';
import {
    FiUsers, FiPlus, FiSearch, FiUserPlus,
    FiX, FiCheckCircle, FiTrash2, FiEdit2, FiRefreshCw, FiEye, FiEyeOff,
    FiDownload, FiUpload, FiFileText, FiAlertCircle, FiCreditCard,
    FiChevronUp, FiChevronDown
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import DocumentManager from '../../components/DocumentManager';

export default function EmployeeList() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || permissions.includes('manage_employees');

    const [employees, setEmployees] = useState([]);

    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [depts, setDepts] = useState([]);
    const [filterDept, setFilterDept] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        id: '', name: '', email: '', password: '', role: 'employee',
        department_id: '', shift_id: '', manager_id: '', phone: '', designation: '',
        date_of_joining: '', date_of_birth: '', gender: 'male', address: '', status: 'active', pan: '', uan: '', pf_account_no: '',
        salary_details: {
            basic: 0, da: 0, oa: 0, leave_wages: 0, esi_wages: 0, epf_wages: 0,
            provident_fund: 0, esi_deduction: 0, pt: 0, lwf: 0, tds: 0, leave_deduction: 0, other_deductions: 0, bank_ac_no: '', bank_ifsc_code: '', bank_name: ''
        }
    });
    const [shifts, setShifts] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [showSalaryModal, setShowSalaryModal] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [settings, setSettings] = useState({
        roles_permissions: { admin: [], hr: [], employee: [] }
    });
    const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'asc' });
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
    const [showDocManager, setShowDocManager] = useState(false);
    const [selectedEmployeeForDocs, setSelectedEmployeeForDocs] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        API.get('/settings').then(r => {
            if (r.data.settings) setSettings(r.data.settings);
        }).catch(() => { });
    }, []);

    const generateID = () => {
        const num = Math.floor(1000 + Math.random() * 9000);
        setForm(prev => ({ ...prev, id: `EMP${num}` }));
    };

    const generatePassword = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let retVal = "";
        for (let i = 0; i < 10; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        setForm(prev => ({ ...prev, password: retVal }));
        setShowPassword(true);
    };

    const load = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams({ 
            status: 'active',
            page: pagination.page,
            limit: pagination.limit
        });
        if (search) params.append('search', search);
        if (filterDept) params.append('department', filterDept);
        API.get(`/employees?${params}`).then(r => { 
            setEmployees(r.data.employees || []); 
            if (r.data.pagination) setPagination(prev => ({ ...prev, ...r.data.pagination }));
            setLoading(false); 
        }).catch(() => setLoading(false));
    }, [search, filterDept, pagination.page, pagination.limit]);

    useEffect(() => {
        API.get('/departments').then(r => setDepts(r.data.departments || [])).catch(() => { });
        API.get('/shifts').then(r => setShifts(r.data.shifts || [])).catch(() => { });
    }, []);

    useEffect(() => { load(); }, [load]);

    const saveEmployee = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingEmployee) {
                const { data } = await API.put(`/employees/${editingEmployee.id}`, form);
                showToast(data.message, 'success');
            } else {
                const { data } = await API.post('/employees', form);
                showToast(data.message, 'success');
            }
            setShowForm(false);
            setShowSalaryModal(false);
            setEditingEmployee(null);
            load();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to save employee.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (emp) => {
        setEditingEmployee(emp);
        setForm({
            id: emp.id,
            name: emp.name,
            email: emp.email,
            password: '', // Don't show password hash
            role: emp.role || 'employee',
            department_id: emp.department_id || '',
            shift_id: emp.shift_id || '',
            manager_id: emp.manager_id || '',
            phone: emp.phone || '',
            designation: emp.designation || '',
            date_of_joining: emp.date_of_joining ? emp.date_of_joining.split('T')[0] : '',
            date_of_birth: emp.date_of_birth ? emp.date_of_birth.split('T')[0] : '',
            gender: emp.gender || 'male',
            address: emp.address || '',
            status: emp.status || 'active',
            pan: emp.pan || '',
            uan: emp.uan || '',
            pf_account_no: emp.pf_account_no || '',
            salary_details: emp.salary_details || {
                basic: 0, da: 0, oa: 0, leave_wages: 0, esi_wages: 0, epf_wages: 0,
                provident_fund: 0, esi_deduction: 0, pt: 0, lwf: 0, tds: 0, leave_deduction: 0, other_deductions: 0, bank_ac_no: '', bank_ifsc_code: '', bank_name: ''
            }
        });
        setShowForm(true);
    };

    function handleSalaryEdit(emp) {
        setEditingEmployee(emp);
        setForm({
            ...form,
            id: emp.id,
            name: emp.name,
            email: emp.email,
            salary_details: emp.salary_details || {
                basic: 0, da: 0, oa: 0, leave_wages: 0, esi_wages: 0, epf_wages: 0,
                provident_fund: 0, esi_deduction: 0, pt: 0, lwf: 0, tds: 0, leave_deduction: 0, other_deductions: 0, bank_ac_no: '', bank_ifsc_code: '', bank_name: ''
            }
        });
        setShowSalaryModal(true);
    }

    // PT slab: dynamic based on settings
    const calcPT = (gross, f = settings?.payroll_formulas) => {
        if (!f) return gross <= 10000 ? 0 : gross <= 15000 ? 150 : 200;
        if (gross <= f.pt_slab1_limit) return f.pt_slab1_amount;
        if (gross <= f.pt_slab2_limit) return f.pt_slab2_amount;
        return f.pt_above_amount;
    };

    // Helper: recalculates all derived salary fields whenever basic/da/oa changes
    const recalcSalary = (sd) => {
        const f = settings?.payroll_formulas;
        const basic = parseFloat(sd.basic) || 0;
        const da = parseFloat(sd.da) || 0;
        const oa = parseFloat(sd.oa) || 0;
        const gross = basic + da + oa;
        const esi_wages = basic + da;
        const epf_wages = gross;

        // PF calculation using settings or defaults
        const provident_fund = f
            ? (gross > f.pf_wage_ceiling ? f.pf_fixed_amount : Math.round(epf_wages * f.pf_rate))
            : (gross > 15000 ? 1800 : Math.round(epf_wages * 0.12));

        // ESI calculation using settings or defaults
        const esi_deduction = f
            ? (esi_wages > f.esi_wage_limit ? 0 : Math.round(esi_wages * f.esi_employee_rate))
            : (esi_wages > 21000 ? 0 : Math.round(esi_wages * 0.0075));

        // PT slab-based auto calculation
        const pt = calcPT(gross, f);

        return { ...sd, gross, esi_wages, epf_wages, provident_fund, esi_deduction, pt };
    };

    const setSalaryField = (field, value) => {
        const updated = recalcSalary({ ...form.salary_details, [field]: value });
        setForm({ ...form, salary_details: updated });
    };
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this employee?')) return;
        try {
            await API.delete(`/employees/${id}`);
            showToast('Employee status updated successfully.', 'success');
            load();
        } catch {
            showToast('Failed to deactivate employee.', 'error');
        }
    };

    const handleExport = async () => {
        try {
            const res = await API.get('/employees/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'employees_export.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
            showToast('Export successful', 'success');
        } catch { showToast('Export failed.', 'error'); }
    };

    const handleTemplate = async () => {
        try {
            const res = await API.get('/employees/template', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'employee_import_template.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
        } catch { setMsg({ text: 'Template download failed.', type: 'error' }); }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        setImporting(true);
        try {
            const { data } = await API.post('/employees/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setImportResult(data);
            showToast('Import completed', 'success');
            load();
        } catch (err) {
            showToast(err.response?.data?.message || 'Import failed.', 'error');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedEmployees = [...employees].sort((a, b) => {
        if (!sortConfig.key) return 0;
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiUsers style={{ marginRight: 8, verticalAlign: 'middle' }} /> Employees</div>
                    <div className="page-subtitle">{employees.length} active employees</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={handleImport} />
                    {canManage && (
                        <>
                            <button className="btn btn-outline btn-sm" onClick={handleTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <FiFileText size={14} /> <span>Template</span>
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={handleExport} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <FiDownload size={14} /> <span>Export</span>
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current.click()} disabled={importing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <FiUpload size={14} /> <span>{importing ? 'Importing...' : 'Import'}</span>
                            </button>
                            <button className="btn btn-primary" onClick={() => {
                                setEditingEmployee(null);
                                setForm({
                                    id: '', name: '', email: '', password: 'emp123', role: 'employee',
                                    department_id: '', shift_id: '', phone: '', designation: '', date_of_joining: '',
                                    pan: '', uan: '', pf_account_no: '',
                                    salary_details: {
                                        basic: 0, da: 0, oa: 0, leave_wages: 0, esi_wages: 0, epf_wages: 0,
                                        provident_fund: 0, esi_deduction: 0, pt: 0, lwf: 0, tds: 0, leave_deduction: 0, other_deductions: 0, bank_ac_no: ''
                                    }
                                });
                                setShowForm(true);
                            }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <FiPlus /> <span>Add Employee</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        className="form-input"
                        placeholder="Search by name, email, ID..."
                        style={{ paddingLeft: 38 }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-select" style={{ width: 180 }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                    <option value="">All Departments</option>
                    {depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
            </div>

            {/* Add Employee Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {editingEmployee ? <><FiEdit2 /> Edit Employee</> : <><FiUserPlus /> Add New Employee</>}
                            </h3>
                            <button className="modal-close" onClick={() => { setShowForm(false); setEditingEmployee(null); }}><FiX /></button>
                        </div>
                        <form onSubmit={saveEmployee}>
                            <div className="modal-body">
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            Employee ID
                                            <button type="button" onClick={generateID} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <FiRefreshCw /> Auto
                                            </button>
                                        </label>
                                        <input className="form-input" placeholder="" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Full Name</label>
                                        <input className="form-input" placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input type="email" className="form-input" placeholder="email@gmail.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>
                                                Password
                                                {editingEmployee && <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>(optional — leave blank to keep current)</span>}
                                            </span>
                                            <button type="button" onClick={generatePassword} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <FiRefreshCw /> Generate
                                            </button>
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                className="form-input"
                                                placeholder={editingEmployee ? 'Leave blank to keep current password' : 'Enter or generate password'}
                                                value={form.password}
                                                onChange={e => setForm({ ...form, password: e.target.value })}
                                                required={!editingEmployee}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                                            >
                                                {showPassword ? <FiEyeOff /> : <FiEye />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input className="form-input" placeholder="Phone Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Gender</label>
                                        <select className="form-select" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Address</label>
                                        <input className="form-input" placeholder="Full Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">PAN Number</label>
                                        <input className="form-input" placeholder="ABCDE1234F" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">UAN</label>
                                        <input className="form-input" placeholder="100..." value={form.uan} onChange={e => setForm({ ...form, uan: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">PF Account No</label>
                                        <input className="form-input" placeholder="MH/BAN/..." value={form.pf_account_no} onChange={e => setForm({ ...form, pf_account_no: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Role</label>
                                        <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} required>
                                            <option value="">— Select Role —</option>
                                            {Object.keys(settings?.roles_permissions || { employee: [], hr: [], hr_manager: [] }).map(r => (
                                                <option key={r} value={r}>
                                                    {r === 'hr_manager' ? 'HR Manager' : r === 'hr' ? 'HR' : r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ')}
                                                </option>
                                            ))}

                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Department</label>
                                        <select className="form-select" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                                            <option value="">Select Department</option>
                                            {depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Designation</label>
                                        <input className="form-input" placeholder="Job Title" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
                                    </div>
                                    <DateInput
                                        label="Joining Date"
                                        value={form.date_of_joining}
                                        onChange={e => setForm({ ...form, date_of_joining: e.target.value })}
                                    />
                                    <DateInput
                                        label="Date of Birth"
                                        value={form.date_of_birth}
                                        onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                                    />
                                    <div className="form-group">
                                        <label className="form-label">Working Shift</label>
                                        <select className="form-select" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })}>
                                            <option value="">Select Shift</option>
                                            {shifts.map(s => <option key={s._id} value={s._id}>{s.name} ({s.start_time} - {s.end_time})</option>)}
                                        </select>
                                    </div>
                                    {editingEmployee && (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Reporting Manager</label>
                                                <select className="form-select" value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                                                    <option value="">— No Manager —</option>
                                                    {employees
                                                        .filter(m => m.id !== form.id)
                                                        .map(m => (
                                                            <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                                                        ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Status</label>
                                                <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="terminated">Terminated</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Salary Details Section */}
                                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                                    <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-primary)' }}>
                                        <FiFileText /> Salary & Bank Details
                                    </h4>
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label className="form-label">Basic Salary</label>
                                            <input type="number" className="form-input" value={form.salary_details.basic} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, basic: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Bank A/C No.</label>
                                            <input type="text" className="form-input" value={form.salary_details.bank_ac_no} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, bank_ac_no: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">DA (Dearness Allowance)</label>
                                            <input type="number" className="form-input" value={form.salary_details.da} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, da: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">OA (Other Allowance)</label>
                                            <input type="number" className="form-input" value={form.salary_details.oa} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, oa: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">ESI Wages (Applicable for ESI)</label>
                                            <input type="number" className="form-input" value={form.salary_details.esi_wages} onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, salary_details: { ...form.salary_details, esi_wages: e.target.value, esi_deduction: Math.round(val * 0.0075) } });
                                            }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">EPF Wages (Applicable for PF)</label>
                                            <input type="number" className="form-input" value={form.salary_details.epf_wages} onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setForm({ ...form, salary_details: { ...form.salary_details, epf_wages: e.target.value, provident_fund: Math.round(val * 0.12) } });
                                            }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Provident Fund (PF)</label>
                                            <input type="number" className="form-input" value={form.salary_details.provident_fund} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, provident_fund: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">ESI Deduction</label>
                                            <input type="number" className="form-input" value={form.salary_details.esi_deduction} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, esi_deduction: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Professional Tax (PT)</label>
                                            <input type="number" className="form-input" value={form.salary_details.pt} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, pt: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">LWF (Labour Welfare Fund)</label>
                                            <input type="number" className="form-input" value={form.salary_details.lwf} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, lwf: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">TDS</label>
                                            <input type="number" className="form-input" value={form.salary_details.tds} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, tds: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Leave Deduction</label>
                                            <input type="number" className="form-input" value={form.salary_details.leave_deduction} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, leave_deduction: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Other Deductions</label>
                                            <input type="number" className="form-input" value={form.salary_details.other_deductions} onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, other_deductions: e.target.value } })} />
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                        <FiAlertCircle style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                        These default values will be used to pre-fill the monthly payroll.
                                    </p>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditingEmployee(null); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? 'Saving...' : (editingEmployee ? <><FiCheckCircle /> Save Changes</> : <><FiCheckCircle /> Add Employee</>)}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="card" style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)' }}>
                    <table className="data-table" style={{ minWidth: 1000 }}>
                        <thead>
                            <tr>
                                <th onClick={() => requestSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        ID
                                        {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown />) : <FiChevronUp style={{ opacity: 0.2 }} />}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        Name
                                        {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown />) : <FiChevronUp style={{ opacity: 0.2 }} />}
                                    </div>
                                </th>
                                <th>Email</th>
                                <th>Designation</th>
                                <th>Department</th>
                                <th>Joined</th>
                                <th>Role</th>
                                {canManage && <th style={{ width: 160, textAlign: 'center' }}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No employees found.</td></tr>
                            ) : sortedEmployees.map(e => (
                                <tr key={e.id}>
                                    <td style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: '0.85rem' }}>{e.id}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%',
                                                background: 'var(--gradient-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: '0.8rem', color: '#fff', flexShrink: 0,
                                                overflow: 'hidden'
                                            }}>
                                                {e.profile_image ? (
                                                    <img
                                                        src={(e.profile_image.startsWith('http') || e.profile_image.startsWith('data:')) ? e.profile_image : `${import.meta.env.VITE_API_BASE_URL || ''}${e.profile_image}`}
                                                        alt={e.name}
                                                        loading="lazy"
                                                        onError={(t) => {
                                                            t.target.style.display = 'none';
                                                            t.target.parentElement.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${e.name?.[0] || '?'}</span>`;
                                                        }}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    e.name?.[0] || '?'
                                                )}
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{e.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '0.8rem' }}>{e.email}</td>
                                    <td>{e.designation || '—'}</td>
                                    <td>{e.department_name || '—'}</td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatDate(e.date_of_joining)}</td>
                                    <td><span className={`badge badge-${e.role === 'hr_manager' ? 'purple' : e.role === 'hr' ? 'info' : 'success'}`}>{e.role === 'hr_manager' ? 'HR Manager' : e.role === 'hr' ? 'HR' : e.role.charAt(0).toUpperCase() + e.role.slice(1).replace(/_/g, ' ')}</span></td>
                                    {canManage && (
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                                <button className="btn btn-icon btn-sm" title="Edit Profile" onClick={() => handleEdit(e)}><FiEdit2 size={14} /></button>
                                                
                                                {/* Payroll Action */}
                                                {(() => {
                                                    if (user?.permissions && Array.isArray(user.permissions)) return user.permissions.includes('payroll');
                                                    return user?.role === 'admin' || user?.role === 'hr_manager';
                                                })() && (
                                                    <button className="btn btn-icon btn-sm" title="Salary Details" style={{ color: 'var(--accent-primary)' }} onClick={() => handleSalaryEdit(e)}><FiCreditCard size={14} /></button>
                                                )}

                                                {/* Document Action - Strict Individual Toggle */}
                                                {(() => {
                                                    if (user?.permissions && Array.isArray(user.permissions)) return user.permissions.includes('manage_documents');
                                                    return user?.role === 'admin' || user?.role === 'hr_manager';
                                                })() && (
                                                    <button className="btn btn-icon btn-sm" title="Documents" style={{ color: 'var(--accent-info)' }} onClick={() => { setSelectedEmployeeForDocs(e); setShowDocManager(true); }}><FiFileText size={14} /></button>
                                                )}

                                                <button className="btn btn-icon btn-sm text-error" title="Deactivate" onClick={() => handleDelete(e.id)}><FiTrash2 size={14} /></button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 12, padding: '12px 0' }}>
                    <button 
                        className="btn btn-outline btn-sm" 
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    >
                        Previous
                    </button>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        Page {pagination.page} of {pagination.pages}
                    </div>
                    <button 
                        className="btn btn-outline btn-sm" 
                        disabled={pagination.page >= pagination.pages}
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Import Result Modal */}
            {importResult && (
                <div className="modal-overlay" onClick={() => setImportResult(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Import Result</h3>
                            <button className="modal-close" onClick={() => setImportResult(null)}><FiX /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                <div style={{ flex: 1, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981' }}>{importResult.imported}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Imported</div>
                                </div>
                                <div style={{ flex: 1, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444' }}>{importResult.skipped}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Skipped</div>
                                </div>
                            </div>
                            {importResult.errors?.length > 0 && (
                                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.78rem', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                                    {importResult.errors.map((e, i) => (
                                        <div key={i} style={{ color: '#f87171', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{e}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary w-full" onClick={() => setImportResult(null)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Salary Modal */}
            {showSalaryModal && (
                <div className="modal-overlay" onClick={() => setShowSalaryModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiCreditCard /> Salary Details: {form.name} ({form.id})
                            </h3>
                            <button className="modal-close" onClick={() => setShowSalaryModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={saveEmployee}>
                            <div className="modal-body">
                                <div className="grid-2">
                                    {/* Editable Inputs */}
                                    <div className="form-group">
                                        <label className="form-label">Basic Salary</label>
                                        <input type="number" className="form-input" value={form.salary_details.basic}
                                            onChange={e => setSalaryField('basic', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bank A/C No.</label>
                                        <input type="text" className="form-input" value={form.salary_details.bank_ac_no || ''}
                                            onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, bank_ac_no: e.target.value } })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bank Name</label>
                                        <input type="text" className="form-input" value={form.salary_details.bank_name || ''}
                                            onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, bank_name: e.target.value } })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">IFSC Code</label>
                                        <input type="text" className="form-input" value={form.salary_details.bank_ifsc_code || ''}
                                            onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, bank_ifsc_code: e.target.value.toUpperCase() } })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">DA (Dearness Allowance)</label>
                                        <input type="number" className="form-input" value={form.salary_details.da}
                                            onChange={e => setSalaryField('da', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">OA (Other Allowance)</label>
                                        <input type="number" className="form-input" value={form.salary_details.oa}
                                            onChange={e => setSalaryField('oa', e.target.value)} />
                                    </div>
                                </div>

                                {/* Auto-calculated section */}
                                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
                                        Calculated Fields (Editable)
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label className="form-label">Gross Salary <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>Basic + DA + OA</span></label>
                                            <input type="number" className="form-input" readOnly value={form.salary_details.gross || 0} style={{ opacity: 0.7 }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">ESI Wages <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>Basic + DA</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.esi_wages || 0}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    // ESI = IF(esi_wages > 21000, 0, esi_wages * 0.75%)
                                                    const esi_deduction = val > 21000 ? 0 : Math.round(val * 0.0075);
                                                    setForm({ ...form, salary_details: { ...form.salary_details, esi_wages: val, esi_deduction } });
                                                }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">EPF Wages <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>= Gross</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.epf_wages || 0}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    // PF = IF(epf_wages > 15000, 1800, epf_wages * 12%)
                                                    const provident_fund = val > 15000 ? 1800 : Math.round(val * 0.12);
                                                    setForm({ ...form, salary_details: { ...form.salary_details, epf_wages: val, provident_fund } });
                                                }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Employee PF <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>IF(EPF &gt; ₹15K → ₹1800, else 12%)</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.provident_fund || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, provident_fund: parseFloat(e.target.value) || 0 } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">ESI Deduction <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>IF(ESI &gt; ₹21K → 0, else 0.75%)</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.esi_deduction || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, esi_deduction: parseFloat(e.target.value) || 0 } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Professional Tax (PT) <span style={{ color: 'var(--accent-light)', fontSize: '0.65rem' }}>Auto (≤₹10K→0, ≤₹15K→150, &gt;₹15K→200)</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.pt ?? calcPT(form.salary_details.gross || 0)}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, pt: parseFloat(e.target.value) || 0 } })} />
                                        </div>
                                    </div>
                                </div>

                                {/* Manual / Optional Fields */}
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
                                        Manual / Optional Fields
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label className="form-label">LWF <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>₹20 in Jun &amp; Dec</span></label>
                                            <input type="number" className="form-input" value={form.salary_details.lwf || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, lwf: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">TDS</label>
                                            <input type="number" className="form-input" value={form.salary_details.tds || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, tds: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Leave Deduction</label>
                                            <input type="number" className="form-input" value={form.salary_details.leave_deduction || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, leave_deduction: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Other Deductions</label>
                                            <input type="number" className="form-input" value={form.salary_details.other_deductions || 0}
                                                onChange={e => setForm({ ...form, salary_details: { ...form.salary_details, other_deductions: e.target.value } })} />
                                        </div>
                                    </div>
                                </div>

                                {/* Live Summary */}
                                {(() => {
                                    const s = form.salary_details;
                                    const gross = (parseFloat(s.basic) || 0) + (parseFloat(s.da) || 0) + (parseFloat(s.oa) || 0);
                                    const totalDed = (parseFloat(s.provident_fund) || 0) + (parseFloat(s.esi_deduction) || 0) + (parseFloat(s.pt) || 208) + (parseFloat(s.lwf) || 0) + (parseFloat(s.tds) || 0) + (parseFloat(s.leave_deduction) || 0) + (parseFloat(s.other_deductions) || 0);
                                    const net = gross - totalDed;
                                    const empPF = Math.round((parseFloat(s.epf_wages) || 0) * 0.13);
                                    const empESI = gross < 21000 ? Math.round((parseFloat(s.esi_wages) || 0) * 0.0325) : 0;
                                    return (
                                        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontWeight: 700 }}>Live Summary</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                                                {[['Gross', `₹${gross.toLocaleString('en-IN')}`], ['Total Deductions', `₹${totalDed.toLocaleString('en-IN')}`], ['Net Pay', `₹${net.toLocaleString('en-IN')}`], ['Employer PF (13%)', `₹${empPF.toLocaleString('en-IN')}`], ['Employer ESI (3.25%)', `₹${empESI.toLocaleString('en-IN')}`]].map(([lbl, val]) => (
                                                    <div key={lbl} style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{lbl}</div>
                                                        <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>{val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 12 }}>
                                    <FiAlertCircle style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                    Changes to salary details will be applied to future payroll cycles.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowSalaryModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? 'Updating...' : <><FiCheckCircle /> Update Salary</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Document Manager Modal */}
            <DocumentManager 
                isOpen={showDocManager} 
                onClose={() => { setShowDocManager(false); setSelectedEmployeeForDocs(null); }}
                employeeId={selectedEmployeeForDocs?.id}
                employeeName={selectedEmployeeForDocs?.name}
            />
        </div>
    );
}

