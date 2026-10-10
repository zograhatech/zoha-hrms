import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import {
    FiCheckCircle, FiCheck, FiX, FiLoader,
    FiMessageSquare
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';

export default function LeaveApprovals() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const permissions = user?.permissions || [];
    const canManage = isManagerRole(user) || permissions.includes('manage_leaves');

    const [leaves, setLeaves] = useState([]);

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState({});

    const load = () => {
        API.get('/leaves/pending').then(r => { setLeaves(r.data.leaves || []); setLoading(false); }).catch(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const action = async (id, type) => {
        setProcessing(p => ({ ...p, [id]: type }));
        try {
            await API.put(`/leaves/${id}/${type}`, { rejection_reason: type === 'reject' ? 'Not approved by HR' : undefined });
            showToast(`Leave ${type}d successfully!`, 'success');
            load();
        } catch (err) {
            showToast(err.response?.data?.message || `Failed to ${type} leave.`, 'error');
        } finally {
            setProcessing(p => ({ ...p, [id]: null }));
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiCheckCircle style={{ marginRight: 8, verticalAlign: 'middle' }} /> Leave Approvals</div>
                    <div className="page-subtitle">{leaves.length} pending leave request{leaves.length !== 1 ? 's' : ''}</div>
                </div>
            </div>

            {leaves.length === 0 ? (
                <div className="card text-center" style={{ padding: 60 }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                        <FiCheckCircle opacity={0.3} />
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>No pending leave requests. All caught up!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {leaves.map(l => (
                        <div key={l._id} className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: '0.9rem' }}>
                                            {l.employee_name?.[0]}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{l.employee_name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.department_name} · {l.designation}</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leave Type</div>
                                            <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{l.leave_type} Leave</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
                                            <div style={{ fontWeight: 700 }}>{formatDate(l.start_date)} – {formatDate(l.end_date)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({l.total_days} day{l.total_days > 1 ? 's' : ''})</span></div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Applied On</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{formatDate(l.createdAt)}</div>
                                        </div>
                                    </div>
                                    {l.reason && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                            <FiMessageSquare size={14} /> {l.reason}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    {canManage ? (
                                        <>
                                            <button className="btn btn-success btn-sm" disabled={!!processing[l._id]} onClick={() => action(l._id, 'approve')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {processing[l._id] === 'approve' ? <FiLoader className="spin" /> : <FiCheck />} Approve
                                            </button>
                                            <button className="btn btn-danger btn-sm" disabled={!!processing[l._id]} onClick={() => action(l._id, 'reject')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {processing[l._id] === 'reject' ? <FiLoader className="spin" /> : <FiX />} Reject
                                            </button>
                                        </>
                                    ) : (
                                        <span className="badge badge-outline">Read Only</span>
                                    )}
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

