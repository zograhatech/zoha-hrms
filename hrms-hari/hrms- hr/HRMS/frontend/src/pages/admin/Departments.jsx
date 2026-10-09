import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import {
    FiBriefcase, FiPlus, FiX, FiLoader,
    FiCheckCircle, FiUser, FiUsers, FiEdit2, FiTrash2
} from 'react-icons/fi';

export default function Departments() {
    const { user } = useAuth();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || user?.role === 'admin' || permissions.includes('manage_departments');

    const [depts, setDepts] = useState([]);

    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', manager_id: '' });
    const [employees, setEmployees] = useState([]);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [submitting, setSubmitting] = useState(false);
    const [editingDept, setEditingDept] = useState(null);

    const load = () => {
        API.get('/departments').then(r => { setDepts(r.data.departments || []); setLoading(false); }).catch(() => setLoading(false));
    };

    useEffect(() => {
        load();
        API.get('/employees?status=active').then(r => setEmployees(r.data.employees || [])).catch(() => { });
    }, []);

    const saveDept = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg({ text: '', type: '' });
        try {
            if (editingDept) {
                const { data } = await API.put(`/departments/${editingDept._id}`, form);
                setMsg({ text: data.message, type: 'success' });
            } else {
                const { data } = await API.post('/departments', form);
                setMsg({ text: data.message, type: 'success' });
            }
            setShowForm(false);
            setEditingDept(null);
            setForm({ name: '', description: '', manager_id: '' });
            load();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Failed to save department.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (dept) => {
        setEditingDept(dept);
        setForm({ name: dept.name, description: dept.description || '', manager_id: dept.manager_id || '' });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this department? All employees must be unassigned first.')) return;
        try {
            const { data } = await API.delete(`/departments/${id}`);
            setMsg({ text: data.message, type: 'success' });
            load();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Delete failed.', type: 'error' });
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiBriefcase style={{ marginRight: 8, verticalAlign: 'middle' }} /> Departments</div>
                    <div className="page-subtitle">{depts.length} departments</div>
                </div>
                {canManage && (
                    <button className="btn btn-primary" onClick={() => { setEditingDept(null); setForm({ name: '', description: '', manager_id: '' }); setShowForm(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> New Department
                    </button>
                )}
            </div>


            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            {showForm && (
                <div className="modal-overlay" onClick={() => { setShowForm(false); setEditingDept(null); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiBriefcase /> {editingDept ? 'Edit Department' : 'Create Department'}
                            </h3>
                            <button className="modal-close" onClick={() => { setShowForm(false); setEditingDept(null); }}><FiX /></button>
                        </div>
                        <form onSubmit={saveDept}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Department Name</label>
                                    <input className="form-input" placeholder="e.g. Engineering" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" placeholder="Department description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Manager (optional)</label>
                                    <select className="form-select" value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                                        <option value="">— No Manager Assigned —</option>
                                        {employees.map(em => <option key={em.id} value={em.id}>{em.name} ({em.id})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditingDept(null); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? <><FiLoader className="spin" /> Saving...</> : <><FiCheckCircle /> {editingDept ? 'Save Changes' : 'Create'}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                {depts.map(d => (
                    <div key={d._id} className="card" style={{ minWidth: 0, overflowWrap: 'break-word' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', color: '#fff', flexShrink: 0 }}>
                                    <FiBriefcase />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {d._id}</div>
                                </div>
                            </div>
                            {canManage && (
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                                    <button className="btn btn-icon btn-sm" onClick={() => handleEdit(d)} title="Edit"><FiEdit2 size={14} /></button>
                                    <button className="btn btn-icon btn-sm text-error" onClick={() => handleDelete(d._id)} title="Delete"><FiTrash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                        {d.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>{d.description}</p>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FiUser size={14} /> Manager
                            </span>
                            <span style={{ fontWeight: 600 }}>{d.manager_name || 'Unassigned'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FiUsers size={14} /> Employees
                            </span>
                            <span style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{d.employee_count || 0}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

