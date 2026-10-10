import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import DateInput from '../../components/DateInput';
import TimeInput from '../../components/TimeInput';
import {
    FiUsers, FiDownload, FiEdit2, FiSave, FiX,
    FiCheckCircle, FiXCircle, FiClock, FiCalendar
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default function AttendanceReport() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || user?.role === 'admin' || permissions.includes('manage_attendance');
    const canApproveLeaves = user?.role === 'hr_manager' || user?.role === 'hr' || permissions.includes('manage_leaves');

    const today = new Date();

    const [date, setDate] = useState(today.toISOString().split('T')[0]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [exportMonth, setExportMonth] = useState(today.getMonth() + 1);
    const [exportYear, setExportYear] = useState(today.getFullYear());
    const [editingRecord, setEditingRecord] = useState(null);
    const [form, setForm] = useState({ status: 'present', check_in: '', check_out: '', work_hours: '' });
    const [holidayForm, setHolidayForm] = useState({ startDate: date, endDate: date });
    const [saving, setSaving] = useState(false);
    const [markingHoliday, setMarkingHoliday] = useState(false);
    const [showHolidayModal, setShowHolidayModal] = useState(false);

    useEffect(() => {
        setLoading(true);
        API.get(`/attendance/team?date=${date}`).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, [date]);

    const handleExportDaily = async () => {
        setExporting(true);
        try {
            const res = await API.get(`/attendance/export?date=${date}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = `attendance_${date}.xlsx`; a.click();
            window.URL.revokeObjectURL(url);
            showToast('Daily report downloaded successfully.');
        } catch { showToast('No records found for this date or export failed.', 'error'); }
        finally { setExporting(false); setShowExportMenu(false); }
    };

    const handleExportMonthly = async () => {
        setExporting(true);
        try {
            const res = await API.get(`/attendance/export?month=${exportMonth}&year=${exportYear}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = `attendance_${MONTHS[exportMonth]}_${exportYear}.xlsx`; a.click();
            window.URL.revokeObjectURL(url);
            showToast('Monthly report downloaded successfully.');
        } catch { showToast('No records found for this month or export failed.', 'error'); }
        finally { setExporting(false); setShowExportMenu(false); }
    };

    const handleEdit = (rec) => {
        setEditingRecord(rec);
        setForm({
            status: rec.status,
            check_in: rec.check_in || '',
            check_out: rec.check_out || '',
            work_hours: rec.work_hours || ''
        });
    };

    const handleSaveManual = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await API.put('/attendance/update-manual', {
                employee_id: editingRecord.employee_id,
                date: date,
                ...form
            });
            setEditingRecord(null);
            showToast('Attendance updated successfully.');
            // Refresh data
            API.get(`/attendance/team?date=${date}`).then(r => setData(r.data));
        } catch {
            showToast('Failed to update attendance.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleMarkHoliday = async (e) => {
        e.preventDefault();
        setMarkingHoliday(true);
        try {
            await API.post('/attendance/mark-holiday', holidayForm);
            showToast('Holiday(s) marked successfully.');
            setShowHolidayModal(false);
            // Refresh data for current report date
            API.get(`/attendance/team?date=${date}`).then(r => setData(r.data));
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to mark holiday.', 'error');
        } finally {
            setMarkingHoliday(false);
        }
    };

    const s = data?.summary;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiUsers style={{ marginRight: 8, verticalAlign: 'middle' }} /> Team Attendance</div>
                    <div className="page-subtitle">Daily team attendance overview</div>
                </div>
                <div className="attendance-actions">
                    <DateInput
                        className="form-input"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/dashboard/leave-approvals')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                        <FiCheckCircle size={15} /> Leave Approvals
                    </button>
                    {canManage && (
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                setHolidayForm({ startDate: date, endDate: date });
                                setShowHolidayModal(true);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
                        >
                            <FiCalendar size={15} /> Mark as Holiday
                        </button>
                    )}
                    {canManage && (
                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowExportMenu(v => !v)}
                                disabled={exporting}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FiDownload size={15} /> {exporting ? 'Exporting...' : 'Export'} ▾
                            </button>
                            {showExportMenu && (
                                <div className="dropdown-menu export-menu" style={{ padding: 16, minWidth: 240 }} onClick={e => e.stopPropagation()}>
                                    {/* Daily export */}
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Daily Export</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                                            Exports attendance for <strong>{formatDate(date)}</strong>
                                        </div>
                                        <button className="btn btn-primary btn-sm w-full" onClick={handleExportDaily} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            <FiDownload size={13} /> Export {formatDate(date)}
                                        </button>
                                    </div>

                                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />

                                    {/* Monthly export */}
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Monthly Export</div>
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <select className="form-select" style={{ flex: 1 }} value={exportMonth} onChange={e => setExportMonth(+e.target.value)}>
                                                {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                            </select>
                                            <select className="form-select" style={{ width: 90 }} value={exportYear} onChange={e => setExportYear(+e.target.value)}>
                                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                        <button className="btn btn-success btn-sm w-full" onClick={handleExportMonthly} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            <FiDownload size={13} /> Export {MONTHS[exportMonth]} {exportYear}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* Close export menu on outside click */}
            {showExportMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowExportMenu(false)} />}

            {s && (
                <div className="grid-4" style={{ marginBottom: 24 }}>
                    {[
                        { label: 'Total', value: s.total, color: '#6366f1', icon: <FiUsers /> },
                        { label: 'Present', value: s.present, color: '#10b981', icon: <FiCheckCircle /> },
                        { label: 'Absent', value: s.absent, color: '#ef4444', icon: <FiXCircle /> },
                        { label: 'Late', value: s.late, color: '#f59e0b', icon: <FiClock /> },
                    ].map(st => (
                        <div key={st.label} className="card text-center">
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: st.color }}>{st.value}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {st.icon} {st.label}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {loading ? <div className="page-loader"><div className="loading-spinner" /></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th>{(canManage || canApproveLeaves) && <th>Actions</th>}</tr></thead>
                        <tbody>
                            {data?.attendance?.length === 0 && (
                                <tr><td colSpan={(canManage || canApproveLeaves) ? 8 : 7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No attendance records for this date.</td></tr>
                            )}
                            {data?.attendance?.map((a) => (
                                <tr key={a.employee_id}>
                                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                                    <td>{a.department || '—'}</td>
                                    <td>{a.designation || '—'}</td>
                                    <td><span className={`badge badge-${a.status === 'present' ? 'success' : a.status === 'late' ? 'warning' : 'danger'}`}>{a.status}</span></td>
                                    <td>{a.check_in || '—'}</td>
                                    <td>{a.check_out || '—'}</td>
                                    <td>{a.work_hours != null ? `${a.work_hours}h` : '—'}</td>
                                    {(canManage || canApproveLeaves) && (
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {canManage && (
                                                    <button className="btn btn-icon btn-sm" title="Edit Attendance" onClick={() => handleEdit(a)}>
                                                        <FiEdit2 size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-icon btn-sm text-success"
                                                    title="Manage Leaves"
                                                    onClick={() => navigate('/dashboard/leave-approvals')}
                                                >
                                                    <FiCheckCircle size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingRecord && (
                <div className="modal-overlay" onClick={() => setEditingRecord(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiEdit2 /> Edit Attendance
                            </h3>
                            <button className="modal-close" onClick={() => setEditingRecord(null)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSaveManual}>
                            <div className="modal-body">
                                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.1)', borderRadius: 8, borderLeft: '4px solid var(--accent-primary)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Updating for</div>
                                    <div style={{ fontWeight: 800 }}>{editingRecord.name} ({editingRecord.employee_id})</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: 2 }}>Date: {formatDate(date)}</div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                        <option value="present">Present</option>
                                        <option value="absent">Absent</option>
                                        <option value="late">Late</option>
                                        <option value="half-day">Half Day</option>
                                        <option value="holiday">Holiday</option>
                                    </select>
                                </div>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Check In</label>
                                        <TimeInput
                                            className="form-input"
                                            value={form.check_in}
                                            onChange={e => setForm({ ...form, check_in: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Check Out</label>
                                        <TimeInput
                                            className="form-input"
                                            value={form.check_out}
                                            onChange={e => setForm({ ...form, check_out: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Work Hours</label>
                                    <input type="number" step="0.5" className="form-input" placeholder="e.g. 8.5" value={form.work_hours} onChange={e => setForm({ ...form, work_hours: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setEditingRecord(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {saving ? 'Saving...' : <><FiSave /> Update Attendance</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showHolidayModal && (
                <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiCalendar /> Mark Team Holiday
                            </h3>
                            <button className="modal-close" onClick={() => setShowHolidayModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleMarkHoliday}>
                            <div className="modal-body">
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                                    Select a date range to mark as a holiday for ALL active employees.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Start Date</label>
                                    <DateInput
                                        className="form-input"
                                        value={holidayForm.startDate}
                                        onChange={e => setHolidayForm({ ...holidayForm, startDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">End Date (Optional)</label>
                                    <DateInput
                                        className="form-input"
                                        value={holidayForm.endDate}
                                        onChange={e => setHolidayForm({ ...holidayForm, endDate: e.target.value })}
                                        placeholder="Same as start date"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                                        Leave empty for a single-day holiday.
                                    </small>
                                </div>
                                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)', fontSize: '0.8rem' }}>
                                    <strong>Caution:</strong> This will override any existing attendance records for the selected range.
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowHolidayModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={markingHoliday} style={{ background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
                                    {markingHoliday ? 'Marking...' : 'Mark as Holiday'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
