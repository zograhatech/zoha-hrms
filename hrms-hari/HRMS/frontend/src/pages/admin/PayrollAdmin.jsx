import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import {
    FiPlus, FiX, FiCheckCircle,
    FiTrendingUp, FiTrendingDown, FiPieChart,
    FiDownload, FiUpload, FiFileText, FiSearch, FiCreditCard
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole, isSuperAdmin } from '../../utils/roleHelper';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollAdmin() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const permissions = user?.permissions || [];
    const canManage = isManagerRole(user) || permissions.includes('manage_payroll');

    const today = new Date();

    const [month, setMonth] = useState(today.getMonth() + 1);
    const [year, setYear] = useState(today.getFullYear());
    const [data, setData] = useState([]);
    const [selected, setSelected] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [employees, setEmployees] = useState([]);
    const emptyForm = {
        employee_id: '',
        annual_ctc: '',
        days_worked: 0,
        bank_ac_no: '',
        custom_columns: [],
        basic: 0, da: 0, oa: 0, leave_wages: 0, esi_wages: 0, epf_wages: 0,
        provident_fund: 0, esi_deduction: 0, pt: 0, lwf: 0, tds: 0,
        leave_deduction: 0, other_deductions: 0, employer_pf: 0, employer_esi: 0,
        unpaid_leave_days: 0, unpaid_leave_deduction: 0, unpaid_leave_adjustment: 0
    };
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [form, setForm] = useState({ ...emptyForm });
    const [submitting, setSubmitting] = useState(false);
    const [, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const payrollFileRef = useRef(null);
    const [confirmAction, setConfirmAction] = useState(null); // { message, onConfirm, type }

    useEffect(() => {
        if (!showForm || !form.annual_ctc || isNaN(form.annual_ctc) || Number(form.annual_ctc) <= 0) {
            setPreview(null);
            setPreviewError('');
            return;
        }
        setPreviewLoading(true);
        setPreviewError('');
        const timer = setTimeout(() => {
            API.post('/payroll/preview', {
                annual_ctc: Number(form.annual_ctc),
                custom_columns: form.custom_columns || []
            })
                .then(res => {
                    setPreview(res.data);
                    setPreviewLoading(false);
                })
                .catch(err => {
                    setPreview(null);
                    setPreviewError(err.response?.data?.message || 'Failed to calculate preview');
                    setPreviewLoading(false);
                });
        }, 300);
        return () => clearTimeout(timer);
    }, [showForm, form.annual_ctc, form.custom_columns]);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            API.get(`/payroll/all?month=${month}&year=${year}`),
            API.get(`/payroll/analytics?year=${year}`),
        ]).then(([p, a]) => {
            setData(p.data.payrolls || p.data.payroll || []);
            const analytics = a.data.analytics || [];
            const currentMonth = analytics.find(m => m.month === month);
            setAnalytics(currentMonth);
            setSelected([]);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [month, year]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (showForm && employees.length === 0) {
            API.get('/employees?status=active').then(r => setEmployees(r.data.employees || [])).catch(() => { });
        }
    }, [showForm, employees.length]);

    // Auto-fetch days worked from attendance
    useEffect(() => {
        if (!form.employee_id) return;
        const fetchAttendanceDays = async () => {
            try {
                const res = await API.get(`/attendance/${form.employee_id}?month=${month}&year=${year}`);
                if (res.data.success) {
                    const { present, late, halfDay, holiday } = res.data.summary;
                    const totalPaidDays = present + late + (halfDay * 0.5) + holiday;
                    setForm(prev => ({ ...prev, days_worked: totalPaidDays }));
                }
            } catch (err) {
                console.error('Attendance fetch failed:', err);
            }
        };
        fetchAttendanceDays();
    }, [form.employee_id, month, year]);

    const runPayroll = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await API.post('/payroll/create', { ...form, month, year });
            showToast('Payroll created successfully!', 'success');
            setShowForm(false);
            setForm({ ...emptyForm });
            load();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to create payroll.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const markPaid = async (id) => {
        setConfirmAction({
            message: 'Mark this payroll as PAID? This cannot be undone.',
            onConfirm: async () => {
                try {
                    await API.put(`/payroll/${id}/pay`);
                    showToast('Marked as Paid', 'success');
                    load();
                } catch {
                    showToast('Failed to update status.', 'error');
                }
            }
        });
    };

    const markBulkPaid = async () => {
        if (selected.length === 0) return;
        setConfirmAction({
            message: `Mark ${selected.length} records as PAID?`,
            onConfirm: async () => {
                try {
                    await API.put('/payroll/bulk-pay', { ids: selected });
                    showToast(`Marked ${selected.length} records as Paid`, 'success');
                    setSelected([]);
                    load();
                } catch {
                    showToast('Failed to update records.', 'error');
                }
            }
        });
    };

    const fmt = v => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
    const daysInMonth = new Date(year, month, 0).getDate();




    // Payroll register table cell styles
    const thS = { padding: '10px 15px', border: '1px solid var(--border-color)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', background: 'var(--bg-primary)' };
    const tdS = { padding: '10px 15px', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' };
    const tdGreen = { ...tdS, color: '#10b981', fontWeight: 600 };
    const tdRed = { ...tdS, color: '#ef4444', fontWeight: 600 };
    const tdBold = { ...tdS, fontWeight: 800, color: 'var(--text-primary)' };


    const handlePayrollExport = async () => {
        try {
            const res = await API.get('/payroll/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'payroll_export.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
            showToast('Payroll Exported', 'success');
        } catch { showToast('Export failed.', 'error'); }
    };

    const handleExportPayslipsExcel = async () => {
        try {
            const res = await API.get(`/payroll/payslips/export?month=${month}&year=${year}`, { responseType: 'blob' });
            const padM = String(month).padStart(2, '0');
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `payslips-${year}-${padM}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Payslips Exported', 'success');
        } catch {
            showToast('Export failed.', 'error');
        }
    };

    const handleDownloadPayslipPdf = async (payrollRecord) => {
        try {
            const res = await API.get(`/payroll/payslip/${payrollRecord._id}/pdf`, { responseType: 'blob' });
            const padM = String(payrollRecord.month).padStart(2, '0');
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `payslip-${payrollRecord.employee_id}-${payrollRecord.year}-${padM}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Payslip PDF downloaded', 'success');
        } catch {
            showToast('Download failed.', 'error');
        }
    };

    const handlePayrollTemplate = async () => {
        try {
            const res = await API.get('/payroll/template', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'payroll_import_template.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
            showToast('Template downloaded', 'success');
        } catch { showToast('Template download failed.', 'error'); }
    };

    const handlePayrollImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        setImporting(true);
        try {
            const { data } = await API.post('/payroll/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setImportResult(data);
            showToast('Payroll imported', 'success');
            load();
        } catch (err) {
            showToast(err.response?.data?.message || 'Import failed.', 'error');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    return (
        <div>
            {/* Always mount the file input so the ref works regardless of canManage */}
            <input
                ref={payrollFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handlePayrollImport}
            />

            <div className="page-header">
                <div>
                    <div className="page-title"><FiCreditCard style={{ marginRight: 8, verticalAlign: 'middle' }} /> Payroll Management</div>
                    <div className="page-subtitle">Monthly salary overview for all employees</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="form-select" style={{ width: 130 }} value={month} onChange={e => setMonth(+e.target.value)}>
                        {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                        <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search employee..."
                            style={{ paddingLeft: 36, width: 220 }}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Toolbar Card — Template / Export / Import / Run Payroll */}
            {canManage && (
                <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Actions</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                        {/* Export */}
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={handlePayrollExport}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'rgba(16,185,129,0.4)', color: '#10b981' }}
                        >
                            <FiDownload size={14} /> <span>Export Excel</span>
                        </button>

                        {isSuperAdmin(user) && (
                            <button
                                className="btn btn-outline btn-sm"
                                onClick={handleExportPayslipsExcel}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'rgba(99,102,241,0.4)', color: '#6366f1' }}
                            >
                                <FiDownload size={14} /> <span>Export Payslips (Excel)</span>
                            </button>
                        )}

                        <button
                            className="btn btn-outline btn-sm"
                            onClick={handlePayrollTemplate}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <FiFileText size={14} /> <span>Template</span>
                        </button>

                        {selected.length > 0 && (
                            <button
                                className="btn btn-success btn-sm"
                                onClick={markBulkPaid}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                                <FiCheckCircle size={14} /> Mark ({selected.length}) Paid
                            </button>
                        )}

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Run Payroll */}
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowForm(true)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <FiPlus /> <span>Run Payroll</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Run Payroll Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiCreditCard /> Run Payroll for {MONTHS[month]} {year}
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={runPayroll}>
                            <div className="modal-body">
                                <div className="grid-2" style={{ marginBottom: 16 }}>
                                    <div className="form-group">
                                        <label className="form-label">Month</label>
                                        <select className="form-select" value={month} onChange={e => setMonth(+e.target.value)}>
                                            {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Year</label>
                                        <select className="form-select" value={year} onChange={e => setYear(+e.target.value)}>
                                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Select Employee</label>
                                    <select
                                        className="form-select"
                                        value={form.employee_id}
                                        onChange={e => {
                                            const empId = e.target.value;
                                            const emp = employees.find(emp => emp.id === empId);
                                            setForm(prev => ({
                                                ...prev,
                                                employee_id: empId,
                                                bank_ac_no: emp?.salary_details?.bank_ac_no || prev.bank_ac_no || ''
                                            }));
                                        }}
                                        required
                                    >
                                        <option value="">— Select Employee —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                                        Annual CTC (₹) <span style={{ color: 'var(--accent-red)' }}>*</span>
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 600000"
                                        className="form-input"
                                        style={{ fontSize: '1rem', fontWeight: 700 }}
                                        value={form.annual_ctc ?? ''}
                                        onChange={e => setForm({ ...form, annual_ctc: e.target.value })}
                                        required
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                        Monthly components are automatically computed from the SuperAdmin Payroll Formula.
                                    </small>
                                </div>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Days Worked</label>
                                        <input type="number" className="form-input" value={form.days_worked} onChange={e => setForm({ ...form, days_worked: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bank A/C No.</label>
                                        <input type="text" className="form-input" placeholder="Employee bank account number" value={form.bank_ac_no} onChange={e => setForm({ ...form, bank_ac_no: e.target.value })} />
                                    </div>
                                </div>

                                {/* Per-Employee Custom Columns */}
                                <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Custom Columns (This Employee Only)
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '4px 8px' }}
                                            onClick={() => {
                                                const cols = [...(form.custom_columns || []), {
                                                    name: '',
                                                    type: 'deduction',
                                                    percentage: 0,
                                                    formula: 'GROSS * PCT / 100'
                                                }];
                                                setForm({ ...form, custom_columns: cols });
                                            }}
                                        >
                                            <FiPlus /> Add Column
                                        </button>
                                    </div>

                                    {(form.custom_columns || []).length === 0 ? (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            No employee-specific custom columns. Global Payroll Formula columns apply automatically.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {(form.custom_columns || []).map((col, idx) => (
                                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 110px 90px 1.8fr 36px', gap: 8, alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Name (e.g. Loan Recovery)"
                                                        className="form-input"
                                                        style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                                                        value={col.name || ''}
                                                        onChange={e => {
                                                            const cols = [...form.custom_columns];
                                                            cols[idx] = { ...cols[idx], name: e.target.value };
                                                            setForm({ ...form, custom_columns: cols });
                                                        }}
                                                    />
                                                    <select
                                                        className="form-select"
                                                        style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                                                        value={col.type || 'deduction'}
                                                        onChange={e => {
                                                            const cols = [...form.custom_columns];
                                                            cols[idx] = { ...cols[idx], type: e.target.value };
                                                            setForm({ ...form, custom_columns: cols });
                                                        }}
                                                    >
                                                        <option value="deduction">Deduction</option>
                                                        <option value="addition">Addition</option>
                                                    </select>
                                                    <input
                                                        type="number"
                                                        placeholder="%"
                                                        className="form-input"
                                                        style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                                                        value={col.percentage ?? ''}
                                                        onChange={e => {
                                                            const cols = [...form.custom_columns];
                                                            cols[idx] = { ...cols[idx], percentage: parseFloat(e.target.value) || 0 };
                                                            setForm({ ...form, custom_columns: cols });
                                                        }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Formula (e.g. GROSS * PCT / 100)"
                                                        className="form-input"
                                                        style={{ padding: '6px 8px', fontSize: '0.78rem', fontFamily: 'monospace' }}
                                                        value={col.formula || ''}
                                                        onChange={e => {
                                                            const cols = [...form.custom_columns];
                                                            cols[idx] = { ...cols[idx], formula: e.target.value };
                                                            setForm({ ...form, custom_columns: cols });
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline btn-sm"
                                                        style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)', padding: '6px', display: 'flex', justifyContent: 'center' }}
                                                        onClick={() => {
                                                            const cols = form.custom_columns.filter((_, i) => i !== idx);
                                                            setForm({ ...form, custom_columns: cols });
                                                        }}
                                                    >
                                                        <FiX />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {previewError && (
                                    <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                                        {previewError}
                                    </div>
                                )}

                                {previewLoading && (
                                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                        Calculating preview...
                                    </div>
                                )}

                                {preview && !previewLoading && (
                                    <div style={{ marginTop: 16 }}>
                                        <div className="grid-2" style={{ gap: 16 }}>
                                            {/* Additions */}
                                            <div style={{ background: 'rgba(16,185,129,0.05)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                                <h4 style={{ marginBottom: 10, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                                                    <FiTrendingUp /> Wages Earned (Monthly)
                                                </h4>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>Basic:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.BASIC)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>HRA:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.HRA)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>Medical Allowance:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.MEDICAL)}</span>
                                                </div>
                                                {(preview.custom_components || []).filter(c => c.type === 'addition').map(c => (
                                                    <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                        <span>{c.name}:</span> <span style={{ fontWeight: 600 }}>{fmt(c.amount)}</span>
                                                    </div>
                                                ))}
                                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 800 }}>
                                                    <span>Gross Salary:</span> <span style={{ color: 'var(--accent-green)' }}>{fmt(preview.gross_salary)}</span>
                                                </div>
                                            </div>

                                            {/* Deductions */}
                                            <div style={{ background: 'rgba(239,68,68,0.05)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                                <h4 style={{ marginBottom: 10, color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                                                    <FiTrendingDown /> Deductions (Monthly)
                                                </h4>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>PF:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.PF)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>ESI:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.ESI)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>PT:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.PT)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>LWF:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.LWF)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                    <span>Gratitude:</span> <span style={{ fontWeight: 600 }}>{fmt(preview.components?.GRATITUDE)}</span>
                                                </div>
                                                {(preview.custom_components || []).filter(c => c.type === 'deduction').map(c => (
                                                    <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                                        <span>{c.name}:</span> <span style={{ fontWeight: 600 }}>{fmt(c.amount)}</span>
                                                    </div>
                                                ))}
                                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 800 }}>
                                                    <span>Total Deductions:</span> <span style={{ color: 'var(--accent-red)' }}>{fmt(preview.total_deductions)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800 }}>
                                                <span>Monthly Net Salary:</span> <span style={{ color: 'var(--accent-primary)' }}>{fmt(preview.net_salary)}</span>
                                            </div>
                                        </div>

                                        <div style={{ background: 'linear-gradient(135deg, var(--accent-primary), #4f46e5)', padding: 16, borderRadius: 8, marginTop: 12, color: 'white', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>ESTIMATED PAYABLE FOR {form.days_worked || 0} DAYS</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>
                                                {fmt(daysInMonth > 0 ? (preview.net_salary / daysInMonth) * (parseFloat(form.days_worked) || 0) : 0)}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? 'processing...' : <><FiCheckCircle /> Create Payroll</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Summary */}
            {analytics && (
                <div className="grid-3" style={{ marginBottom: 24 }}>
                    <div className="card text-center">
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{fmt(analytics.total)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Total Payroll</div>
                    </div>
                    <div className="card text-center">
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#6366f1' }}>{fmt(analytics.avgSalary)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Avg Net Salary</div>
                    </div>
                    <div className="card text-center">
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b' }}>{analytics.employees}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Employees on Payroll</div>
                    </div>
                </div>
            )}

            {/* Payroll Register Table / Card View */}
            {loading ? <div className="page-loader"><div className="loading-spinner" /></div> : (
                <>
                    {/* Desktop/Tablet Table View */}
                    <div className="card desktop-only" style={{ padding: 0, overflowX: 'auto', border: 'none', background: 'transparent', boxShadow: 'none' }}>
                        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1600 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-primary)' }}>
                                        <th rowSpan={2} style={thS}>
                                            <input
                                                type="checkbox"
                                                checked={data.length > 0 && selected.length === data.filter(p => p.status === 'pending').length}
                                                onChange={e => {
                                                    if (e.target.checked) setSelected(data.filter(p => p.status === 'pending').map(p => p._id));
                                                    else setSelected([]);
                                                }}
                                            />
                                        </th>
                                        <th rowSpan={2} style={thS}>Sl.No</th>
                                        <th rowSpan={2} style={{ ...thS, textAlign: 'left', minWidth: 220 }}>Employee Name</th>
                                        <th rowSpan={2} style={thS}>Gender</th>
                                        <th rowSpan={2} style={thS}>Designation</th>
                                        <th rowSpan={2} style={thS}>Days Worked</th>
                                        <th colSpan={7} style={{ ...thS, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Wages Earned</th>
                                        <th colSpan={5} style={{ ...thS, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Deductions</th>
                                        <th rowSpan={2} style={{ ...thS, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Total Deduction</th>
                                        <th rowSpan={2} style={{ ...thS, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)' }}>Net Wages</th>
                                        <th rowSpan={2} style={{ ...thS, background: 'var(--accent-primary)', color: 'white' }}>Actual Payable</th>
                                        <th rowSpan={2} style={thS}>Date Paid</th>
                                        {canManage && <th rowSpan={2} style={thS}>Action</th>}
                                    </tr>
                                    <tr style={{ background: 'var(--bg-primary)' }}>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>Basic</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>D.A</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>OA</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>Leave Wages</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>ESI Wages</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.05)' }}>EPF Wages</th>
                                        <th style={{ ...thS, background: 'rgba(16,185,129,0.08)', fontWeight: 900 }}>Gross Salary</th>
                                        <th style={{ ...thS, background: 'rgba(239,68,68,0.05)' }}>PF</th>
                                        <th style={{ ...thS, background: 'rgba(239,68,68,0.05)' }}>ESI</th>
                                        <th style={{ ...thS, background: 'rgba(239,68,68,0.05)' }}>PT</th>
                                        <th style={{ ...thS, background: 'rgba(239,68,68,0.05)' }}>LWF</th>
                                        <th style={{ ...thS, background: 'rgba(239,68,68,0.05)' }}>Others</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const filtered = data.filter(p =>
                                            p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            p.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
                                        );
                                        if (filtered.length === 0) return null;
                                        return filtered.map((p, idx) => (
                                            <tr key={p._id} style={{ borderBottom: '1px solid var(--border-color)', background: selected.includes(p._id) ? 'rgba(99,102,241,0.05)' : undefined }}>
                                                <td style={tdS}>
                                                    {p.status === 'pending' && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.includes(p._id)}
                                                            onChange={e => {
                                                                if (e.target.checked) setSelected([...selected, p._id]);
                                                                else setSelected(selected.filter(id => id !== p._id));
                                                            }}
                                                        />
                                                    )}
                                                </td>
                                                <td style={tdS}>{idx + 1}</td>
                                                <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>
                                                    {p.employee_name}
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.employee_id}</div>
                                                </td>
                                                <td style={tdS}>{p.gender || '—'}</td>
                                                <td style={tdS}>{p.designation || '—'}</td>
                                                <td style={tdBold}>{p.days_worked}</td>
                                                <td style={tdGreen}>{fmt(p.basic)}</td>
                                                <td style={tdGreen}>{fmt(p.da)}</td>
                                                <td style={tdGreen}>{fmt(p.oa)}</td>
                                                <td style={tdGreen}>{fmt(p.leave_wages)}</td>
                                                <td style={tdGreen}>{fmt(p.esi_wages)}</td>
                                                <td style={tdGreen}>{fmt(p.epf_wages)}</td>
                                                <td style={{ ...tdGreen, fontWeight: 900, background: 'rgba(16,185,129,0.03)' }}>{fmt(p.gross_salary)}</td>
                                                <td style={tdRed}>{fmt(p.provident_fund)}</td>
                                                <td style={tdRed}>{fmt(p.esi_deduction)}</td>
                                                <td style={tdRed}>{fmt(p.pt)}</td>
                                                <td style={tdRed}>{fmt(p.lwf)}</td>
                                                <td style={tdRed}>{fmt(p.other_deductions)}</td>
                                                <td style={{ ...tdRed, fontWeight: 900, background: 'rgba(239,68,68,0.03)' }}>{fmt(p.total_deductions)}</td>
                                                <td style={{ ...tdBold, color: 'var(--accent-primary)' }}>{fmt(p.net_salary)}</td>
                                                <td style={{ ...tdBold, background: 'var(--accent-primary)', color: 'white', fontSize: '0.85rem' }}>{fmt(p.actual_payable)}</td>
                                                <td style={tdS}>{formatDate(p.paid_date) || (p.status === 'paid' ? 'N/A' : 'Pending')}</td>
                                                {canManage && (
                                                    <td style={tdS}>
                                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                                                            {p.status === 'pending' && (
                                                                <button className="btn btn-sm btn-success" onClick={() => markPaid(p._id)}>Pay</button>
                                                            )}
                                                            {isSuperAdmin(user) && (
                                                                <button
                                                                    className="btn btn-sm btn-outline"
                                                                    onClick={() => handleDownloadPayslipPdf(p)}
                                                                    title="Download Payslip PDF"
                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    <FiFileText size={12} /> <span>Payslip PDF</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {data.filter(p =>
                            p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            p.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
                        ).map((p) => (
                            <div key={p._id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ background: 'var(--bg-primary)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>{p.employee_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.employee_id} · {p.designation}</div>
                                    </div>
                                    <span className={`badge badge-${p.status === 'paid' ? 'success' : 'warning'}`} style={{ textTransform: 'uppercase' }}>{p.status}</span>
                                </div>
                                
                                <div style={{ padding: 16 }}>
                                    <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
                                        <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>DAYS WORKED</div>
                                            <div style={{ fontWeight: 800 }}>{p.days_worked}</div>
                                        </div>
                                        <div style={{ background: 'rgba(99,102,241,0.1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginBottom: 2 }}>ACTUAL PAYABLE</div>
                                            <div style={{ fontWeight: 900, color: 'var(--accent-primary)', fontSize: '1.1rem' }}>{fmt(p.actual_payable)}</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                        <div>
                                            <h5 style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 800, marginBottom: 8, borderBottom: '1px solid rgba(16,185,129,0.1)', paddingBottom: 4 }}>WAGES</h5>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}><span>Basic</span> <span style={{ fontWeight: 600 }}>{fmt(p.basic)}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}><span>D.A</span> <span style={{ fontWeight: 600 }}>{fmt(p.da)}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 800, color: '#10b981', marginTop: 8 }}><span>Gross</span> <span>{fmt(p.gross_salary)}</span></div>
                                        </div>
                                        <div>
                                            <h5 style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 800, marginBottom: 8, borderBottom: '1px solid rgba(239,68,68,0.1)', paddingBottom: 4 }}>DEDUCTIONS</h5>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}><span>PF</span> <span style={{ fontWeight: 600 }}>{fmt(p.provident_fund)}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}><span>ESI</span> <span style={{ fontWeight: 600 }}>{fmt(p.esi_deduction)}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', marginTop: 8 }}><span>Total</span> <span>{fmt(p.total_deductions)}</span></div>
                                        </div>
                                    </div>
                                </div>

                                {canManage && (p.status === 'pending' || isSuperAdmin(user)) && (
                                    <div style={{ padding: 12, background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
                                        {p.status === 'pending' && (
                                            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => markPaid(p._id)}>
                                                <FiCheckCircle style={{ marginRight: 8 }} /> Mark as Paid
                                            </button>
                                        )}
                                        {isSuperAdmin(user) && (
                                            <button className="btn btn-outline" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => handleDownloadPayslipPdf(p)}>
                                                <FiFileText size={14} /> Payslip PDF
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {data.length === 0 && (
                        <div className="card text-center" style={{ padding: 60 }}>
                            <FiCreditCard size={40} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                            <h3 style={{ color: 'var(--text-muted)' }}>No records found for {MONTHS[month]} {year}</h3>
                        </div>
                    )}
                </>
            )}


            {/* Import Result Modal */}
            {importResult && (
                <div className="modal-overlay" onClick={() => setImportResult(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Payroll Import Result</h3>
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
            {/* Custom Confirmation Modal */}
            {confirmAction && (
                <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '32px 24px' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent-primary)' }}>
                            <FiCheckCircle size={32} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 12 }}>Confirm Action</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
                            {confirmAction.message}
                        </p>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button 
                                className="btn btn-outline" 
                                style={{ flex: 1 }} 
                                onClick={() => setConfirmAction(null)}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary" 
                                style={{ flex: 1 }} 
                                onClick={() => {
                                    confirmAction.onConfirm();
                                    setConfirmAction(null);
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
