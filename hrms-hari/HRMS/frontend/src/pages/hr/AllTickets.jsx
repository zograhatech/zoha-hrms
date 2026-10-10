import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import { FiMessageSquare } from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';

export default function AllTickets() {
    const { user } = useAuth();
    const permissions = user?.permissions || [];
    const canManage = isManagerRole(user) || permissions.includes('manage_tickets');

    const [tickets, setTickets] = useState([]);

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [msg, setMsg] = useState({ text: '', type: '' });

    const load = (status = '') => {
        const q = status ? `?status=${status}` : '';
        API.get(`/tickets/all${q}`).then(r => { setTickets(r.data.tickets || []); setLoading(false); }).catch(() => setLoading(false));
    };

    useEffect(() => { load(filter); }, [filter]);

    const updateStatus = async (id, status) => {
        try {
            await API.put(`/tickets/${id}/update`, { status });
            setMsg({ text: `Ticket #${id} updated to "${status}"`, type: 'success' });
            load(filter);
        } catch {
            setMsg({ text: 'Failed to update ticket.', type: 'error' });
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiMessageSquare style={{ marginRight: 8, verticalAlign: 'middle' }} /> All Support Tickets</div>
                    <div className="page-subtitle">{tickets.length} tickets</div>
                </div>
                <select className="form-select" style={{ width: 160 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                </select>
            </div>

            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            <div className="card" style={{ padding: 0 }}>
                <table className="data-table">
                    <thead><tr><th>Ticket #</th><th>Employee</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
                    <tbody>
                        {tickets.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No tickets found.</td></tr>
                        ) : tickets.map(t => (
                            <tr key={t._id}>
                                <td style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: '0.8rem' }}>{t.ticket_number}</td>
                                <td>
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.employee_name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.department_name}</div>
                                </td>
                                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>{t.subject}</td>
                                <td><span className="badge badge-default">{t.category}</span></td>
                                <td><span className={`badge badge-${t.priority === 'high' || t.priority === 'critical' ? 'danger' : t.priority === 'medium' ? 'warning' : 'info'}`}>{t.priority}</span></td>
                                <td><span className={`badge badge-${t.status === 'resolved' ? 'success' : t.status === 'open' ? 'warning' : 'info'}`}>{t.status}</span></td>
                                <td style={{ fontSize: '0.8rem' }}>{formatDate(t.createdAt)}</td>
                                <td>
                                    {canManage ? (
                                        <select
                                            className="form-select"
                                            style={{ width: 130, padding: '4px 8px', fontSize: '0.78rem' }}
                                            value={t.status}
                                            onChange={e => updateStatus(t._id, e.target.value)}
                                        >
                                            <option value="open">Open</option>
                                            <option value="in-progress">In Progress</option>
                                            <option value="resolved">Resolved</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    ) : (
                                        <span className="badge badge-outline">Read Only</span>
                                    )}
                                </td>

                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

