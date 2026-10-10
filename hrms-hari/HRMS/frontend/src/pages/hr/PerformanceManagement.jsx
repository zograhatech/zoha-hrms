import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { isManagerRole } from '../../utils/roleHelper';
import { 
    FiPlus, FiStar, FiX, FiCheckCircle, FiTrash2, FiEdit2, 
    FiTarget, FiTrendingUp, FiActivity, FiLayers, FiCalendar, FiSearch, FiFlag, FiInfo
} from 'react-icons/fi';

export default function PerformanceManagement() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const canManage = isManagerRole(user) || user?.permissions?.includes('manage_employees');

    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('all');

    const emptyForm = {
        employee_id: '',
        type: 'individual',
        title: '',
        description: '',
        status: 'draft',
        due_date: '',
        smart_details: {
            specific: '', measurable: '', achievable: '', relevant: '', time_bound: ''
        },
        kpis: [{ name: '', target: 100, current: 0, unit: '%', weight: 10 }]
    };

    const [formData, setFormData] = useState(emptyForm);
    const [employees, setEmployees] = useState([]);
    const [editingId, setEditingId] = useState(null);

    const fetchGoals = async () => {
        try {
            const { data } = await API.get('/performance');
            if (data.success) setGoals(data.goals);
        } catch (err) {
            showToast('Failed to load performance goals', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const { data } = await API.get('/employees?limit=1000');
            if (data.success) setEmployees(data.employees || []);
        } catch (err) { }
    };

    useEffect(() => { 
        fetchGoals(); 
        if (canManage) fetchEmployees();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                const { data } = await API.put(`/performance/${editingId}`, formData);
                if (data.success) showToast('Goal updated', 'success');
            } else {
                const { data } = await API.post('/performance', { ...formData });
                if (data.success) showToast('Goal created', 'success');
            }
            setIsModalOpen(false);
            fetchGoals();
        } catch (err) {
            showToast('Action failed', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this goal and all associated KPIs?')) return;
        try {
            await API.delete(`/performance/${id}`);
            showToast('Goal deleted', 'success');
            fetchGoals();
        } catch (err) {
            showToast('Delete failed', 'error');
        }
    };

    const handleEdit = (g) => {
        setFormData({
            ...emptyForm,
            ...g,
            due_date: g.due_date ? g.due_date.split('T')[0] : ''
        });
        setEditingId(g._id);
        setIsModalOpen(true);
    };

    const updateKPI = (index, field, value) => {
        const newKPIs = [...formData.kpis];
        newKPIs[index][field] = value;
        setFormData({ ...formData, kpis: newKPIs });
    };

    const addKPI = () => {
        setFormData({ 
            ...formData, 
            kpis: [...formData.kpis, { name: '', target: 100, current: 0, unit: '%', weight: 10 }] 
        });
    };

    const removeKPI = (index) => {
        setFormData({ 
            ...formData, 
            kpis: formData.kpis.filter((_, i) => i !== index) 
        });
    };

    const filteredGoals = goals.filter(g => {
        const matchesSearch = g.title.toLowerCase().includes(search.toLowerCase()) || (g.employee_id || '').toLowerCase().includes(search.toLowerCase());
        const matchesType = filterType === 'all' || g.type === filterType;
        return matchesSearch && matchesType;
    });

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className="p-6 fade-in flex-col" style={{ gap: '24px' }}>
            <div className="card flex-row justify-between" style={{ padding: '24px', alignItems: 'center', background: 'var(--gradient-primary)', color: '#fff', border: 'none' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FiTarget /> Performance Tracking
                    </h2>
                    <p style={{ opacity: 0.8, margin: '5px 0 0 0' }}>Align employee objectives with SMART goals and measurable KPIs.</p>
                </div>
                {canManage && (
                    <button className="btn btn-light" onClick={() => { 
                        setEditingId(null); 
                        setFormData(emptyForm); 
                        setIsModalOpen(true); 
                    }} style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                        <FiPlus /> New Strategic Goal
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex-row" style={{ gap: '15px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        className="form-input" 
                        placeholder="Search goals or employee ID..." 
                        style={{ paddingLeft: 40 }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-select" style={{ width: '200px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="all">All Goal Levels</option>
                    <option value="organization">Organization</option>
                    <option value="team">Team</option>
                    <option value="individual">Individual</option>
                </select>
            </div>

            <div className="grid-3" style={{ gap: '24px' }}>
                {filteredGoals.map(g => (
                    <div key={g._id} className="card hover-grow" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: g.type === 'organization' ? '#f59e0b' : g.type === 'team' ? '#10b981' : '#6366f1' }}></div>
                        
                        <div className="flex-row justify-between" style={{ alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <FiFlag /> {g.type} Goal
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{g.title}</h3>
                            </div>
                            <span className={`badge badge-${g.status === 'completed' ? 'success' : g.status === 'active' ? 'info' : 'warning'}`}>{g.status.replace('_', ' ')}</span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {g.description}
                        </div>

                        {/* Progress Bar */}
                        <div>
                            <div className="flex-row justify-between" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
                                <span style={{ fontWeight: 600 }}>Total Progress</span>
                                <span style={{ color: 'var(--accent-primary)', fontWeight: 800 }}>{g.progress}%</span>
                            </div>
                            <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 10, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${g.progress}%`, background: 'var(--gradient-primary)', transition: 'width 0.5s ease' }}></div>
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: '12px', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                                <FiActivity /> {g.kpis?.length || 0} KPIs Active
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                                <FiCalendar /> Due: {new Date(g.due_date).toLocaleDateString()}
                            </div>
                        </div>
                        
                        <div className="flex-row" style={{ gap: '8px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => handleEdit(g)} style={{ flex: 1 }}><FiEdit2 /> View Actions</button>
                            {canManage && <button className="btn btn-icon btn-sm text-error" onClick={() => handleDelete(g._id)} title="Delete"><FiTrash2 /></button>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Goal Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '90%' }}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">{editingId ? 'Strategic Goal Management' : 'Define Strategic Goal'}</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Configure SMART objectives and measurable key performance indicators.</p>
                            </div>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                                <div className="grid-2" style={{ gap: '20px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Goal Level</label>
                                        <select className="form-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                            <option value="individual">Individual Level</option>
                                            <option value="team">Team / Department Level</option>
                                            <option value="organization">Corporate / Organization Level</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                            <option value="draft">Draft / Planning</option>
                                            <option value="active">Active / In Progress</option>
                                            <option value="on_hold">On Hold</option>
                                            <option value="completed">Completed</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    {formData.type === 'individual' && (
                                        <div className="form-group">
                                            <label className="form-label">Assign to Employee</label>
                                            <select required className="form-select" value={formData.employee_id} onChange={e => setFormData({ ...formData, employee_id: e.target.value })}>
                                                <option value="">Select Employee...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Goal Title</label>
                                        <input required type="text" className="form-input" placeholder="e.g. Expand Market Share by 15%" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Target Completion Date</label>
                                        <input required type="date" className="form-input" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Strategic Narrative</label>
                                    <textarea className="form-input" rows="2" placeholder="Describe the overarching importance of this goal..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}></textarea>
                                </div>

                                {/* SMART Framework Section */}
                                <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)' }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-primary)' }}>
                                        <FiActivity /> SMART Framework Configuration
                                    </h4>
                                    <div className="grid-2" style={{ gap: '12px' }}>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Specific</label>
                                            <input className="form-input" placeholder="What exactly?" value={formData.smart_details.specific} onChange={e => setFormData({ ...formData, smart_details: { ...formData.smart_details, specific: e.target.value } })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Measurable</label>
                                            <input className="form-input" placeholder="How to track?" value={formData.smart_details.measurable} onChange={e => setFormData({ ...formData, smart_details: { ...formData.smart_details, measurable: e.target.value } })} />
                                        </div>
                                    </div>
                                </div>

                                {/* KPI Management */}
                                <div style={{ marginTop: 24 }}>
                                    <div className="flex-row justify-between" style={{ alignItems: 'center', marginBottom: 16 }}>
                                        <h4 style={{ margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <FiLayers /> Performance Indicators (KPIs)
                                        </h4>
                                        <button type="button" className="btn btn-outline btn-sm" onClick={addKPI}><FiPlus /> Add KPI</button>
                                    </div>
                                    
                                    <div className="flex-col" style={{ gap: '12px' }}>
                                        {formData.kpis.map((kpi, index) => (
                                            <div key={index} className="flex-row card" style={{ padding: '12px', gap: '10px', alignItems: 'flex-end', background: 'var(--bg-secondary)', border: 'none' }}>
                                                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.65rem' }}>KPI Name</label>
                                                    <input required className="form-input" style={{ fontSize: '0.8rem' }} placeholder="KPI Name" value={kpi.name} onChange={e => updateKPI(index, 'name', e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.65rem' }}>Target</label>
                                                    <input required type="number" className="form-input" style={{ fontSize: '0.8rem' }} value={kpi.target} onChange={e => updateKPI(index, 'target', e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.65rem' }}>Current</label>
                                                    <input required type="number" className="form-input" style={{ fontSize: '0.8rem' }} value={kpi.current} onChange={e => updateKPI(index, 'current', e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ flex: 0.5, marginBottom: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.65rem' }}>Weight (%)</label>
                                                    <input required type="number" className="form-input" style={{ fontSize: '0.8rem' }} value={kpi.weight} onChange={e => updateKPI(index, 'weight', e.target.value)} />
                                                </div>
                                                <button type="button" className="btn btn-icon" style={{ marginBottom: 4 }} onClick={() => removeKPI(index)}><FiTrash2 size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel Management</button>
                                <button type="submit" className="btn btn-primary" style={{ padding: '10px 30px' }}>
                                    {editingId ? 'Update Strategy' : 'Launch Goal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
