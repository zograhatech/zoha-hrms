import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiMessageSquare, FiPlus, FiX, FiSend,
    FiLoader, FiUser, FiFilter
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';

const CATEGORIES = ['general', 'payroll', 'leave', 'attendance', 'it', 'hr'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function Tickets() {
    const { user } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ subject: '', description: '', category: 'general', priority: 'medium' });
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const load = useCallback(() => {
        API.get(`/tickets/${user?.id}`).then(r => { setTickets(r.data.tickets || []); setLoading(false); }).catch(() => setLoading(false));
    }, [user?.id]);

    useEffect(() => { if (user?.id) load(); }, [user?.id, load]);

    const createTicket = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg({ text: '', type: '' });
        try {
            const { data } = await API.post('/tickets/create', { ...form, employee_id: user.id });
            setMsg({ text: data.message, type: 'success' });
            setShowForm(false);
            setForm({ subject: '', description: '', category: 'general', priority: 'medium' });
            load();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Failed to create ticket.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const statusBadge = (s) => ({ open: 'warning', 'in-progress': 'info', resolved: 'success', closed: 'default' })[s] || 'default';
    const priorityBadge = (p) => ({ low: 'info', medium: 'warning', high: 'danger', critical: 'danger' })[p] || 'default';

    if (loading) return <div className="page-loader"><div className="loading-spinner" />Loading tickets...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiMessageSquare style={{ marginRight: 8, verticalAlign: 'middle' }} /> Support Tickets</div>
                    <div className="page-subtitle">Raise and track your HR support requests</div>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setMsg({ text: '', type: '' }); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FiPlus /> Raise Ticket
                </button>
            </div>

            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            {/* Stats */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                {[
                    { label: 'Total', count: tickets.length, color: '#6366f1' },
                    { label: 'Open', count: tickets.filter(t => t.status === 'open').length, color: '#f59e0b' },
                    { label: 'In Progress', count: tickets.filter(t => t.status === 'in-progress').length, color: '#3b82f6' },
                    { label: 'Resolved', count: tickets.filter(t => t.status === 'resolved').length, color: '#10b981' },
                ].map(st => (
                    <div key={st.label} className="card text-center">
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: st.color }}>{st.count}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>{st.label}</div>
                    </div>
                ))}
            </div>

            {/* Create Ticket Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiMessageSquare /> Raise Support Ticket
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={createTicket}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Subject</label>
                                    <input className="form-input" placeholder="Brief description of your issue" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Priority</label>
                                        <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                                            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" placeholder="Describe your issue in detail..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? <><FiLoader className="spin" /> Creating...</> : <><FiSend /> Submit Ticket</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Tickets List */}
            {tickets.length === 0 ? (
                <div className="card text-center" style={{ padding: 60 }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                        <FiMessageSquare opacity={0.3} />
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>No tickets yet. Raise a ticket if you need HR assistance!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tickets.map(t => (
                        <div key={t._id || t.id} className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 800, color: 'var(--accent-light)', fontSize: '0.85rem' }}>{t.ticket_number}</span>
                                        <span className={`badge badge-${priorityBadge(t.priority)}`}>{t.priority}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <FiFilter size={10} /> {t.category}
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>{t.subject}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.description}</div>
                                    {t.assigned_to_name && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <FiUser size={12} /> Assigned to: {t.assigned_to_name}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <span className={`badge badge-${statusBadge(t.status)}`} style={{ marginBottom: 8, display: 'block' }}>{t.status}</span>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(t.createdAt)}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

