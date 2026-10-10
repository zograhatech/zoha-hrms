import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { FiPlus, FiAlignLeft, FiCheckCircle, FiFileText, FiMonitor, FiUsers, FiAward, FiTrash2, FiEdit2, FiX, FiUserCheck } from 'react-icons/fi';

const STAGES = [
    { id: 'Offer Accepted', icon: <FiCheckCircle />, color: 'var(--accent-blue, #3b82f6)' },
    { id: 'Documents Verification', icon: <FiFileText />, color: 'var(--accent-yellow, #eab308)' },
    { id: 'IT Setup', icon: <FiMonitor />, color: 'var(--accent-purple, #a855f7)' },
    { id: 'Orientation', icon: <FiUsers />, color: 'var(--accent-orange, #f97316)' }
];

export default function OnboardingManagement() {
    const [onboardings, setOnboardings] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', applied_role: '', department_id: '', qualification: '', experience_type: 'fresher', experience_years: '', address: '', status: 'Offer Accepted', start_date: '', notes: '' });
    const [editingId, setEditingId] = useState(null);

    const fetchOnboardings = async () => {
        try {
            const { data } = await API.get('/onboarding');
            if (data.success) {
                setOnboardings(data.onboardings);
            }
        } catch (err) {
            showToast('Failed to fetch onboarding data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOnboardings();
        
        const handleClickOutside = (e) => {
            document.querySelectorAll('details[open]').forEach(details => {
                if (!details.contains(e.target)) details.removeAttribute('open');
            });
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                const { data } = await API.put(`/onboarding/${editingId}`, formData);
                if (data.success) {
                    showToast('Candidate updated', 'success');
                    setIsModalOpen(false);
                    fetchOnboardings();
                }
            } else {
                const { data } = await API.post('/onboarding', formData);
                if (data.success) {
                    showToast('Candidate added', 'success');
                    setIsModalOpen(false);
                    fetchOnboardings();
                }
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Action failed', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            const { data } = await API.delete(`/onboarding/${id}`);
            if (data.success) {
                showToast('Candidate removed', 'success');
                fetchOnboardings();
            }
        } catch (err) {
            showToast('Failed to delete', 'error');
        }
    };

    const handleEdit = (candidate) => {
        setFormData({
            ...candidate,
            start_date: candidate.start_date ? new Date(candidate.start_date).toISOString().substring(0, 10) : ''
        });
        setEditingId(candidate._id);
        setIsModalOpen(true);
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            const { data } = await API.put(`/onboarding/${id}`, { status: newStatus });
            if (data.success) {
                fetchOnboardings();
                showToast(`Moved to ${newStatus}`, 'success');
            }
        } catch (err) {
            showToast('Failed to move candidate', 'error');
        }
    };

    const handlePromote = async (id) => {
        try {
            const { data } = await API.post(`/onboarding/${id}/promote`);
            if (data.success) {
                showToast(data.message, 'success');
                fetchOnboardings();
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to convert to employee.', 'error');
        }
    };

    if (loading) return <div className="p-6">Loading Onboarding Management...</div>;

    return (
        <div className="p-6 fade-in flex-col" style={{ gap: '20px', height: '100%' }}>
            <div className="card flex-row justify-between" style={{ padding: '20px', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Onboarding Pipeline</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Structured lifecycle of a new hire from offer acceptance to productive employee.</p>
                </div>
                <button className="btn btn-primary hover-grow" onClick={() => { setEditingId(null); setFormData({ name: '', email: '', phone: '', applied_role: '', department_id: '', qualification: '', experience_type: 'fresher', experience_years: '', address: '', status: 'Offer Accepted', start_date: '', notes: '' }); setIsModalOpen(true); }}>
                    <FiPlus /> Add Candidate
                </button>
            </div>

            {/* Kanban Board */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', overflowX: 'auto', flex: 1, paddingBottom: '15px', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {STAGES.map((stage) => {
                    const columnCards = onboardings.filter(o => o.status === stage.id);
                    return (
                        <div key={stage.id} className="card" style={{ flex: '0 0 320px', padding: '15px', background: 'var(--bg-secondary, #fafafa)', border: 'none', height: '100%', minHeight: '600px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid var(--border-color)' }}>
                                <span style={{ color: stage.color, fontSize: '1.2rem', padding: '6px', borderRadius: '8px', background: `${stage.color}15` }}>{stage.icon}</span>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{stage.id}</h3>
                                <span className="badge" style={{ marginLeft: 'auto', background: 'var(--bg-primary)', fontWeight: 'bold' }}>{columnCards.length}</span>
                            </div>

                            <div className="flex-col" style={{ gap: '12px' }}>
                                {columnCards.map(c => (
                                    <div key={c._id} className="card hover-grow" style={{ padding: '15px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', position: 'relative', overflow: 'visible' }}>
                                        <div className="flex-row justify-between" style={{ marginBottom: '8px', alignItems:'center' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}>{c.name}</h4>
                                            
                                            <details style={{ position: 'relative' }}>
                                                <summary style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'flex', padding: '5px', borderRadius: '4px', listStyle: 'none' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background='none'}>
                                                    <span style={{ display: 'none' }}>&nbsp;</span><FiAlignLeft size={14} />
                                                </summary>
                                                <ul style={{ 
                                                    position: 'absolute', right: 0, top: '100%', marginTop: '5px',
                                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', 
                                                    padding: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', 
                                                    zIndex: 50, listStyle: 'none', minWidth: '160px', margin: 0
                                                }}>
                                                    {c.status === 'Orientation' ? (
                                                        <li style={{ padding: 0, margin: 0 }}>
                                                            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '6px 12px', fontSize: '0.85rem', color: '#10b981', cursor: 'pointer', borderRadius: '4px', fontWeight: 600 }} onMouseOver={e=>e.currentTarget.style.background='#ecfdf5'} onMouseOut={e=>e.currentTarget.style.background='none'} onClick={(e) => { e.target.closest('details').removeAttribute('open'); handlePromote(c._id); }}><FiUserCheck /> Change to Employee</button>
                                                        </li>
                                                    ) : (
                                                        <>
                                                            <li style={{ padding: 0, margin: 0 }}>
                                                                <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '6px 12px', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', borderRadius: '4px' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background='none'} onClick={(e) => { e.target.closest('details').removeAttribute('open'); handleEdit(c); }}><FiEdit2 /> Edit</button>
                                                            </li>
                                                            <li style={{ padding: 0, margin: 0 }}>
                                                                <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '6px 12px', fontSize: '0.85rem', color: '#ef4444', cursor: 'pointer', borderRadius: '4px' }} onMouseOver={e=>e.currentTarget.style.background='#fef2f2'} onMouseOut={e=>e.currentTarget.style.background='none'} onClick={(e) => { e.target.closest('details').removeAttribute('open'); handleDelete(c._id); }}><FiTrash2 /> Delete</button>
                                                            </li>
                                                            <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
                                                            <li style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Move to...</li>
                                                            {STAGES.map((s, sIndex) => {
                                                                const currIndex = STAGES.findIndex(x => x.id === stage.id);
                                                                if (sIndex <= currIndex) return null;
                                                                return (
                                                                    <li key={s.id} style={{ padding: 0, margin: 0 }}>
                                                                        <button style={{ 
                                                                            display: 'block', width: '100%', textAlign: 'left',
                                                                            background: 'none', border: 'none', padding: '6px 12px', 
                                                                            fontSize: '0.85rem', color: '#334155', cursor: 'pointer', borderRadius: '4px' 
                                                                        }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                                        onClick={(e) => { e.target.closest('details').removeAttribute('open'); handleStatusChange(c._id, s.id); }}>
                                                                            {s.id}
                                                                        </button>
                                                                    </li>
                                                                );
                                                            })}
                                                        </>
                                                    )}
                                                </ul>
                                            </details>
                                        </div>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{c.applied_role}</p>
                                        
                                        <div style={{ padding: '8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', marginBottom: '10px' }}>
                                            <div><strong>Qualification:</strong> {c.qualification || 'N/A'}</div>
                                            <div><strong>Experience:</strong> {c.experience_type || 'N/A'} {c.experience_type === 'experienced' && c.experience_years ? ` (${c.experience_years}y)` : ''}</div>
                                            <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{c.address ? `${c.address.substring(0, 30)}...` : 'Addr TBD'}</div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color }}></div>
                                                {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'Date TBD'}
                                            </div>
                                            <div style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                                                {c.email.substring(0, 10)}...
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {columnCards.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                        No candidates in this stage
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingId ? 'Edit Candidate Details' : 'Add New Candidate'}
                            </h3>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}><FiX /></button>
                        </div>
                        
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Full Name</label>
                                        <input required type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Sarah Connor" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email Address</label>
                                        <input required type="email" className="form-input" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="sarah@example.com" />
                                    </div>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Phone Number</label>
                                        <input type="tel" className="form-input" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 123-4567" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Applied Role</label>
                                        <input required type="text" className="form-input" value={formData.applied_role} onChange={e => setFormData({ ...formData, applied_role: e.target.value })} placeholder="Frontend Developer" />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Qualification</label>
                                        <input type="text" className="form-input" value={formData.qualification} onChange={e => setFormData({ ...formData, qualification: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Experience</label>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <select className="form-select" value={formData.experience_type || 'fresher'} onChange={e => setFormData({ ...formData, experience_type: e.target.value, experience_years: e.target.value === 'fresher' ? '' : formData.experience_years })} style={{ flex: 1 }}>
                                                <option value="fresher">Fresher</option>
                                                <option value="experienced">Experienced</option>
                                            </select>
                                            {formData.experience_type === 'experienced' && (
                                                <input type="text" placeholder="Yrs" className="form-input" style={{ width: '60px' }} value={formData.experience_years} onChange={e => setFormData({ ...formData, experience_years: e.target.value })} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Residential Address</label>
                                    <textarea className="form-input" rows="1" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}></textarea>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Start Date</label>
                                        <input type="date" className="form-input" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Current Status</label>
                                        <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                            {STAGES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Additional Notes</label>
                                    <textarea className="form-input" rows="3" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Equipment needs, special requests..."></textarea>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Create Record'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
