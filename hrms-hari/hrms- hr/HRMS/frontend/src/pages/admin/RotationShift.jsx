import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiRefreshCw, FiPlus, FiX, FiEdit2, FiTrash2,
    FiCheckCircle, FiLoader, FiAlertCircle, FiArrowLeft, FiUsers
} from 'react-icons/fi';

export default function RotationShift() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || user?.role === 'admin' || permissions.includes('manage_shifts');

    const [rotations, setRotations] = useState([]);
    const [loading, setLoading] = useState(false); // Make it fake load for now since no backend
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form dummy state
    const [form, setForm] = useState({ name: '', frequency: 'Weekly', shifts: [''] });
    const [rosterShifts, setRosterShifts] = useState([]);

    // Bulk Assignment states
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedRotation, setSelectedRotation] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    useEffect(() => {
        API.get('/shifts').then(res => setRosterShifts(res.data.shifts || [])).catch(() => {});
        API.get('/employees?status=active').then(res => setEmployees(res.data.employees || [])).catch(() => {});
        
        setLoading(true);
        API.get('/rotation-shifts').then(res => setRotations(res.data.rotations || [])).finally(() => setLoading(false));
    }, []);

    const handleOpenForm = () => {
        if (!canManage) return;
        setForm({ name: '', frequency: 'Weekly', shifts: [''] });
        setShowForm(true);
    };

    const handleAddShiftSlot = () => {
        setForm(prev => ({ ...prev, shifts: [...prev.shifts, ''] }));
    };

    const handleShiftChange = (index, value) => {
        const newShifts = [...form.shifts];
        newShifts[index] = value;
        setForm(prev => ({ ...prev, shifts: newShifts }));
    };

    const handleRemoveShiftSlot = (index) => {
        const newShifts = form.shifts.filter((_, i) => i !== index);
        setForm(prev => ({ ...prev, shifts: newShifts }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data } = await API.post('/rotation-shifts', {
                name: form.name,
                frequency: form.frequency,
                shifts: form.shifts
            });
            setRotations(prev => [...prev, data.rotation]);
            setShowForm(false);
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || 'Failed to create rotation policy');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this rotation strategy?')) return;
        try {
            await API.delete(`/rotation-shifts/${id}`);
            setRotations(prev => prev.filter(r => r._id !== id));
        } catch (err) {
            alert('Failed to delete rotation policy');
        }
    };

    const openAssignModal = (r) => {
        setSelectedRotation(r);
        setSelectedEmployees(r.assigned_staff || []);
        setAssignModalOpen(true);
    };

    const handleToggleEmployee = (empId) => {
        if (selectedEmployees.includes(empId)) {
            setSelectedEmployees(prev => prev.filter(id => id !== empId));
        } else {
            setSelectedEmployees(prev => [...prev, empId]);
        }
    };

    const handleSaveAssignment = async () => {
        setSubmitting(true);
        try {
            const { data } = await API.put(`/rotation-shifts/${selectedRotation._id}`, { assigned_staff: selectedEmployees });
            setRotations(prev => prev.map(rot => rot._id === selectedRotation._id ? data.rotation : rot));
            setAssignModalOpen(false);
        } catch (err) {
            alert('Failed to update assignments');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/dashboard/shift-roster')} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <FiArrowLeft /> Back to Roster
                    </button>
                    <div className="page-title"><FiRefreshCw style={{ marginRight: 8, verticalAlign: 'middle' }} /> Rotation Shifts</div>
                    <div className="page-subtitle">Manage automated shift swapping schedules for your employees</div>
                </div>
                {canManage && (
                    <button className="btn btn-primary" onClick={handleOpenForm} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> New Rotation
                    </button>
                )}
            </div>

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiRefreshCw /> Create Rotation Policy
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Rotation Plan Name</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. Call Center Rotational"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Rotation Frequency</label>
                                    <select className="form-select" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                                        <option value="Daily">Daily</option>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Bi-Weekly">Bi-Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Shift Sequence Flow</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }} onClick={handleAddShiftSlot}>
                                            + Add Phase
                                        </span>
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {form.shifts.map((s, index) => (
                                            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <div style={{ padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                    Phase {index + 1}
                                                </div>
                                                <select 
                                                    className="form-select" 
                                                    style={{ flex: 1 }}
                                                    value={s}
                                                    onChange={(e) => handleShiftChange(index, e.target.value)}
                                                    required
                                                >
                                                    <option value="">— Select Shift from Roster —</option>
                                                    <option value="Off">Off (Rest Day)</option>
                                                    {rosterShifts.map(rs => (
                                                        <option key={rs._id} value={rs.name}>{rs.name}</option>
                                                    ))}
                                                </select>
                                                {form.shifts.length > 1 && (
                                                    <button type="button" className="btn btn-icon" onClick={() => handleRemoveShiftSlot(index)} style={{ color: 'var(--accent-red)' }}>
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Employees assigned to this policy will cycle through these exact shifts in the order you define based on the rotation frequency.
                                    </div>
                                </div>

                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {submitting ? <><FiLoader className="spin" /> Processing...</> : <><FiCheckCircle /> Create Policy</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {assignModalOpen && (
                <div className="modal-overlay" onClick={() => setAssignModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiUsers /> Assign Staff to {selectedRotation?.name}
                            </h3>
                            <button className="modal-close" onClick={() => setAssignModalOpen(false)}><FiX /></button>
                        </div>
                        <div className="modal-body" style={{ overflowY: 'auto' }}>
                            <div style={{ marginBottom: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Select the employees who will follow this rotating schedule.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {employees.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No active employees found.</div>
                                ) : (
                                    employees.map(emp => (
                                        <label key={emp._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedEmployees.includes(emp._id)}
                                                onChange={() => handleToggleEmployee(emp._id)}
                                                style={{ width: 16, height: 16 }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.department?.name || 'No Dept'} • {emp.designation}</div>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setAssignModalOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveAssignment} disabled={submitting}>
                                {submitting ? <><FiLoader className="spin" /> Saving...</> : <><FiCheckCircle /> Confirm Selection ({selectedEmployees.length})</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card" style={{ marginTop: 20 }}>
                {rotations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        <FiAlertCircle size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                        <p>No rotation policies configured yet.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Rotation Plan</th>
                                <th>Frequency</th>
                                <th>Sequence Path</th>
                                <th>Assigned Staff</th>
                                {canManage && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rotations.map(r => (
                                <tr key={r._id}>
                                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                                    <td><span className="badge badge-info">{r.frequency}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                            {r.shifts.map((s, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="badge" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent-primary)', fontSize: '0.75rem' }}>{s || 'Unknown Shift'}</span>
                                                    {idx < r.shifts.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>→</span>}
                                                </div>
                                            ))}
                                            <FiRefreshCw size={12} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 600 }}>{r.assigned_staff?.length || 0} Person</span>
                                            {canManage && (
                                                <button className="btn btn-outline btn-sm" onClick={() => openAssignModal(r)} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                                                    <FiUsers /> Assign
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    {canManage && (
                                        <td>
                                            <button className="btn btn-icon" style={{ color: 'var(--accent-red)' }} onClick={() => handleDelete(r._id)} >
                                                <FiTrash2 size={16} />
                                            </button>
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
