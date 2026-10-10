import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { FiPlus, FiDatabase, FiX, FiCheckCircle, FiTrash2, FiEdit2 } from 'react-icons/fi';

export default function AssetManagement() {
    const { showToast } = useToast();
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', category: '', serial_number: '', assigned_to: '', status: 'Available' });
    const [editingId, setEditingId] = useState(null);
    const [employees, setEmployees] = useState([]);

    const fetchAssets = async () => {
        try {
            const { data } = await API.get('/assets');
            if (data.success) setAssets(data.assets);
        } catch (err) {
            showToast('Failed to load assets', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchAssets(); 
        API.get('/employees?status=active')
            .then(r => setEmployees(r.data.employees || []))
            .catch(() => { });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await API.put(`/assets/${editingId}`, formData);
                showToast('Asset updated', 'success');
            } else {
                await API.post('/assets', formData);
                showToast('Asset created', 'success');
            }
            setIsModalOpen(false);
            fetchAssets();
        } catch (err) {
            showToast('Action failed', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this asset?')) return;
        try {
            await API.delete(`/assets/${id}`);
            showToast('Asset deleted', 'success');
            fetchAssets();
        } catch (err) {
            showToast('Delete failed', 'error');
        }
    };

    const handleEdit = (a) => {
        setFormData(a);
        setEditingId(a._id);
        setIsModalOpen(true);
    };

    if (loading) return <div className="p-6">Loading Asset Management...</div>;

    return (
        <div className="p-6 fade-in flex-col" style={{ gap: '20px', height: '100%' }}>
            <div className="card flex-row justify-between" style={{ padding: '20px', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}><FiDatabase style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Asset Management</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Track and manage company resources seamlessly.</p>
                </div>
                <button className="btn btn-primary" onClick={() => { 
                    setEditingId(null); 
                    setFormData({ name: '', category: '', serial_number: '', assigned_to: '', status: 'Available' }); 
                    setIsModalOpen(true); 
                }}>
                    <FiPlus /> Record Asset
                </button>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Serial No</th>
                                <th>Status</th>
                                <th>Assigned To</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assets.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No resources recorded.</td></tr>
                            ) : assets.map(a => (
                                <tr key={a._id}>
                                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                                    <td>{a.category}</td>
                                    <td>{a.serial_number}</td>
                                    <td><span className={`badge ${a.status === 'Available' ? 'badge-success' : a.status === 'Assigned' ? 'badge-info' : 'badge-warning'}`}>{a.status}</span></td>
                                    <td>{a.assigned_to ? (employees.find(e => e.id === a.assigned_to)?.name || a.assigned_to) : '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                            <button className="btn btn-icon btn-sm" onClick={() => handleEdit(a)}><FiEdit2 size={14} /></button>
                                            <button className="btn btn-icon btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleDelete(a._id)}><FiTrash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingId ? 'Edit Asset' : 'Add Asset'}</h3>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Asset Name (e.g. MacBook Pro)</label>
                                    <input required type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Category (e.g. Laptop, Keyboard)</label>
                                    <input required type="text" className="form-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Serial Number</label>
                                    <input required type="text" className="form-input" value={formData.serial_number} onChange={e => setFormData({ ...formData, serial_number: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                        <option value="Available">Available</option>
                                        <option value="Assigned">Assigned</option>
                                        <option value="Under Maintenance">Under Maintenance</option>
                                        <option value="Retired">Retired</option>
                                    </select>
                                </div>
                                {formData.status === 'Assigned' && (
                                    <div className="form-group">
                                        <label className="form-label">Assign To (Employee ID)</label>
                                        <select 
                                            required 
                                            className="form-select" 
                                            value={formData.assigned_to} 
                                            onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                                        >
                                            <option value="">— Select Employee —</option>
                                            {employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingId ? 'Save' : 'Add'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
