import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiActivity, FiEdit3,
    FiX, FiCheckCircle, FiList, FiPlus
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';
import DateInput from '../../components/DateInput';

export default function Leave() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ leave_type: 'sick', start_date: '', end_date: '', reason: '' });
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const load = useCallback(() => {
        if (!user?.id) return;
        API.get(`/leaves/${user.id}`).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, [user?.id]);

    useEffect(() => { load(); }, [load]);

    const applyLeave = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMsg({ text: '', type: '' });
        try {
            const { data: res } = await API.post('/leaves/apply', { ...form, employee_id: user.id });
            setMsg({ text: res.message, type: 'success' });
            setShowForm(false);
            setForm({ leave_type: 'sick', start_date: '', end_date: '', reason: '' });
            load();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Failed to apply leave.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const bal = data?.balance;

    if (loading) return <div className="page-loader"><div className="loading-spinner" /><span>Loading...</span></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiActivity style={{ marginRight: 8, verticalAlign: 'middle' }} /> Sick Leave Management</div>
                    <div className="page-subtitle">View your sick leave balance and apply for sick leave</div>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setMsg({ text: '', type: '' }); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FiPlus /> Apply Sick Leave
                </button>
            </div>

            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            {/* Sick Leave Balance */}
            {bal && (
                <div className="grid-2" style={{ marginBottom: 24 }}>
                    <div className="card text-center">
                        <div style={{ fontSize: '2rem', marginBottom: 8, color: '#f59e0b', display: 'flex', justifyContent: 'center' }}>
                            <FiActivity />
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b' }}>{bal.sick_leave}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Sick Leave Available</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>of {data?.policies?.sick_leave || 0} total</div>
                    </div>
                </div>
            )}

            {/* Apply Sick Leave Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiEdit3 /> Apply Sick Leave
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={applyLeave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Leave Type</label>
                                    <select className="form-select" value="sick" disabled style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                                        <option value="sick">Sick Leave</option>
                                    </select>
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Only sick leave applications are allowed</small>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Start Date</label>
                                        <DateInput value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">End Date</label>
                                        <DateInput value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Reason</label>
                                    <textarea className="form-textarea" placeholder="Reason for sick leave..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? <><div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Applying...</> : <><FiCheckCircle /> Apply Sick Leave</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Leave History */}
            <div className="card">
                <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FiList className="text-primary" /> Sick Leave History
                </h3>
                {data?.leaves?.length > 0 ? (
                    <table className="data-table">
                        <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Applied On</th></tr></thead>
                        <tbody>
                            {data.leaves.map(l => (
                                <tr key={l._id || l.id}>
                                    <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{l.leave_type}</td>
                                    <td>{formatDate(l.start_date)}</td>
                                    <td>{formatDate(l.end_date)}</td>
                                    <td>{l.total_days}</td>
                                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                                    <td><span className={`badge badge-${l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}`}>{l.status}</span></td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatDate(l.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                            <FiActivity opacity={0.3} />
                        </div>
                        <p>No sick leave applications yet. Apply your first sick leave!</p>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setShowForm(true)}>
                            <FiPlus /> Apply Sick Leave
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

