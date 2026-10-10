import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiClock, FiPlus, FiX, FiEdit2, FiTrash2,
    FiCheckCircle, FiLoader, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ShiftRoster() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || user?.role === 'admin' || permissions.includes('manage_shifts');


    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [form, setForm] = useState({
        name: '',
        start_time: '09:00',
        end_time: '18:00',
        grace_period: 5,
        half_day_min_hours: 4.5,
        full_day_min_hours: 9,
        days: [],
        is_default: false,
        allowed_clock_ins: 1
    });
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [submitting, setSubmitting] = useState(false);

    const loadShifts = async () => {
        try {
            const { data } = await API.get('/shifts');
            setShifts(data.shifts || []);
        } catch {
            setMsg({ text: 'Failed to load shifts.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadShifts();
    }, []);

    const handleOpenForm = (shift = null) => {
        if (!canManage) return;
        if (shift) {
            setEditingShift(shift);
            setForm({
                name: shift.name,
                start_time: shift.start_time,
                end_time: shift.end_time,
                grace_period: shift.grace_period,
                half_day_min_hours: shift.half_day_min_hours,
                full_day_min_hours: shift.full_day_min_hours,
                days: shift.days || [],
                is_default: shift.is_default || false,
                allowed_clock_ins: shift.allowed_clock_ins || 1
            });
        } else {
            setEditingShift(null);
            setForm({
                name: '',
                start_time: '09:00',
                end_time: '18:00',
                grace_period: 5,
                half_day_min_hours: 4.5,
                full_day_min_hours: 9,
                days: [],
                is_default: false,
                allowed_clock_ins: 1
            });
        }
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMsg({ text: '', type: '' });
        try {
            if (editingShift) {
                const { data } = await API.put(`/shifts/${editingShift._id}`, form);
                setMsg({ text: data.message, type: 'success' });
            } else {
                const { data } = await API.post('/shifts', form);
                setMsg({ text: data.message, type: 'success' });
            }
            setShowForm(false);
            loadShifts();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Operation failed.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!canManage || !window.confirm('Are you sure you want to delete this shift?')) return;
        try {
            const { data } = await API.delete(`/shifts/${id}`);
            setMsg({ text: data.message, type: 'success' });
            loadShifts();
        } catch {
            setMsg({ text: 'Failed to delete shift.', type: 'error' });
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiClock style={{ marginRight: 8, verticalAlign: 'middle' }} /> Shift Roster</div>
                    <div className="page-subtitle">{shifts.length} shifts configured</div>
                </div>
                {canManage && (
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn btn-outline" onClick={() => navigate('/dashboard/rotation-shift')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiRefreshCw /> Rotation Shift
                        </button>
                        <button className="btn btn-primary" onClick={() => handleOpenForm()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiPlus /> New Shift
                        </button>
                    </div>
                )}
            </div>

            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiClock /> {editingShift ? 'Edit Shift' : 'Create Shift'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Shift Name</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. Morning Shift"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Start Time</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={form.start_time}
                                            onChange={e => setForm({ ...form, start_time: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">End Time</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={form.end_time}
                                            onChange={e => setForm({ ...form, end_time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                    <div className="form-group">
                                        <label className="form-label">Clock Ins #</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={form.allowed_clock_ins}
                                            onChange={e => setForm({ ...form, allowed_clock_ins: +e.target.value })}
                                            min="1"
                                        />
                                    </div>
                                <div className="grid-3" style={{ marginTop: 10 }}>
                                    <div className="form-group">
                                        <label className="form-label">Grace (min)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={form.grace_period}
                                            onChange={e => setForm({ ...form, grace_period: +e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Half Day (hrs)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={form.half_day_min_hours}
                                            onChange={e => setForm({ ...form, half_day_min_hours: +e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Full Day (hrs)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={form.full_day_min_hours}
                                            onChange={e => setForm({ ...form, full_day_min_hours: +e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: 10 }}>
                                    <label className="form-label">Applicable Days</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5 }}>
                                        {DAYS.map(day => (
                                            <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={form.days.includes(day)}
                                                    onChange={e => {
                                                        const newDays = e.target.checked
                                                            ? [...form.days, day]
                                                            : form.days.filter(d => d !== day);
                                                        setForm({ ...form, days: newDays });
                                                    }}
                                                />
                                                {day.slice(0, 3)}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: 15 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                                        <input
                                            type="checkbox"
                                            checked={form.is_default}
                                            onChange={e => setForm({ ...form, is_default: e.target.checked })}
                                            style={{ width: 16, height: 16 }}
                                        />
                                        Mark as Default Shift
                                    </label>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 24, marginTop: 4 }}>
                                        Used for employees who don't have a specific shift assigned.
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? <><FiLoader className="spin" /> Processing...</> : <><FiCheckCircle /> {editingShift ? 'Update' : 'Create'}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="card" style={{ marginTop: 20 }}>
                {shifts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        <FiAlertCircle size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                        <p>No shifts configured yet.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Shift Name</th>
                                <th>Timing</th>
                                <th>Grace</th>
                                <th>Clock Ins</th>
                                <th>Working Days</th>
                                <th>Min Hrs (HD/FD)</th>
                                {canManage && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {shifts.map(s => (
                                <tr key={s._id}>
                                    <td style={{ fontWeight: 600 }}>
                                        {s.name}
                                        {s.is_default && <span className="badge badge-success" style={{ marginLeft: 8, fontSize: '0.65rem', padding: '2px 6px' }}>Default</span>}
                                    </td>
                                    <td>
                                        <span className="badge badge-info" style={{ fontSize: '0.8rem' }}>
                                            {s.start_time} - {s.end_time}
                                        </span>
                                    </td>
                                    <td>{s.grace_period} min</td>
                                    <td>{s.allowed_clock_ins || 1} session(s)</td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {(s.days && s.days.length > 0) ? s.days.map(d => (
                                                <span key={d} className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-primary)' }}>
                                                    {d.slice(0, 3)}
                                                </span>
                                            )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Not set</span>}
                                        </div>
                                    </td>
                                    <td>{s.half_day_min_hours}h / {s.full_day_min_hours}h</td>
                                    {canManage && (
                                        <td>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button
                                                    className="btn btn-icon"
                                                    style={{ color: 'var(--accent-light)' }}
                                                    onClick={() => handleOpenForm(s)}
                                                    title="Edit Shift"
                                                >
                                                    <FiEdit2 size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-icon"
                                                    style={{ color: 'var(--accent-red)' }}
                                                    onClick={() => handleDelete(s._id)}
                                                    title="Delete Shift"
                                                >
                                                    <FiTrash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
