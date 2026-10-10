import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiUser, FiHash, FiMail, FiPhone,
    FiBriefcase, FiCalendar, FiGift, FiHome,
    FiCheckCircle, FiShield, FiClipboard, FiEdit2, FiSave, FiX, FiLogOut, FiAlertCircle, FiRefreshCw, FiFileText
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import ResignationModal from '../../components/ResignationModal';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';
import DocumentManager from '../../components/DocumentManager';

export default function Profile() {
    const { user, refreshUser } = useAuth();
    const { showToast } = useToast();
    const [emp, setEmp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showEdit, setShowEdit] = useState(false);
    const [form, setForm] = useState({ phone: '', address: '', gender: '', password: '' });
    const [imageFile, setImageFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [imgError, setImgError] = useState(false);

    const [resignation, setResignation] = useState(null);
    const [showResignationModal, setShowResignationModal] = useState(false);
    const [showDocManager, setShowDocManager] = useState(false);

    const fetchProfileData = () => {
        if (!user?.id) return;
        setLoading(true);
        Promise.all([
            API.get(`/employees/${user.id}`),
            API.get('/resignations/my')
        ])
            .then(([empRes, resignRes]) => {
                const e = empRes.data.employee;
                setEmp(e);
                setForm({ phone: e.phone || '', address: e.address || '', gender: e.gender || 'male', password: '' });
                setResignation(resignRes.data.resignation);
                setLoading(false);
            })
            .catch((err) => { 
                console.error('Error fetching profile data:', err);
                setError('Failed to load profile.'); 
                setLoading(false); 
            });
    };

    useEffect(() => {
        setImgError(false); // Reset error when employee changes
    }, [emp?.profile_image]);

    useEffect(() => {
        fetchProfileData();
    }, [user]);

    const handleUpdate = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('phone', form.phone);
            formData.append('gender', form.gender);
            formData.append('address', form.address);
            if (form.password) {
                formData.append('password', form.password);
            }
            if (imageFile) {
                formData.append('profile_image', imageFile);
            }

            const { data } = await API.put(`/employees/${user.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEmp(data.employee);
            await refreshUser(); // Refresh global user state for Sidebar/Avatar
            setShowEdit(false);
            setImageFile(null);
            setPreview(null);
            showToast('Profile updated successfully!', 'success');
        } catch (err) {
            console.error('Update profile error:', err);
            showToast(err.response?.data?.message || 'Failed to update profile.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /><span>Loading profile...</span></div>;
    if (error) return <div className="alert alert-error">{error}</div>;
    if (!emp) return null;

    const fields = [
        { label: 'Employee ID', value: emp.id, icon: <FiHash /> },
        { label: 'Email', value: emp.email, icon: <FiMail /> },
        { label: 'Phone', value: emp.phone || 'N/A', icon: <FiPhone /> },
        { label: 'Designation', value: emp.designation || 'N/A', icon: <FiBriefcase /> },
        { label: 'Department', value: emp.department_name || 'N/A', icon: <FiBriefcase /> },
        { label: 'Joining Date', value: formatDate(emp.date_of_joining), icon: <FiCalendar /> },
        { label: 'Date of Birth', value: formatDate(emp.date_of_birth), icon: <FiGift /> },
        { label: 'Gender', value: emp.gender || 'N/A', icon: <FiUser /> },
        { label: 'Address', value: emp.address || 'N/A', icon: <FiHome /> },
        { label: 'Status', value: emp.status, icon: <FiCheckCircle /> },
        { label: 'Role', value: emp.role, icon: <FiShield /> },
    ];

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';

    const handleRevoke = async () => {
        const reason = window.prompt('Please provide a reason for revoking your resignation (staying in the company):');
        if (reason === null) return; // Cancelled prompt
        if (!reason.trim()) {
            showToast('Please provide a reason for revocation.', 'warning');
            return;
        }

        try {
            await API.put(`/resignations/${resignation._id}/revoke`, { reason });
            showToast('Revoke request submitted for HR approval.', 'success');
            fetchProfileData(); // Refresh status
        } catch (error) {
            showToast('Failed to submit revoke request.', 'error');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <span className="badge badge-warning">Pending</span>;
            case 'approved': return <span className="badge badge-success">Approved</span>;
            case 'rejected': return <span className="badge badge-danger">Rejected</span>;
            case 'revoke': return <span className="badge badge-outline" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>Revoked</span>;
            case 'revoke_requested': return <span className="badge badge-warning" style={{ background: '#8b5cf6', color: '#fff' }}>Revocation Requested</span>;
            default: return <span className="badge">{status}</span>;
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiUser style={{ marginRight: 8, verticalAlign: 'middle' }} /> My Profile</div>
                    <div className="page-subtitle">View and manage your employee information</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-outline" onClick={() => setShowEdit(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiEdit2 /> Edit Profile
                    </button>
                    {(!resignation || resignation.status === 'revoke' || resignation.status === 'rejected') && (
                        <button className="btn btn-danger" onClick={() => setShowResignationModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiLogOut /> Submit Resignation
                        </button>
                    )}
                </div>
            </div>

            {resignation && (
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #6366f1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiLogOut className="text-primary" /> Resignation Status
                            </h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                Your resignation request is currently <strong>{resignation.status}</strong>.
                            </p>
                            {(resignation.status === 'approved' || resignation.status === 'pending') && (
                                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 10, border: '1px solid rgba(99, 102, 241, 0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Notice Period Tracking</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                                            {(() => {
                                                const lastDay = new Date(resignation.last_working_day);
                                                const today = new Date();
                                                today.setHours(0,0,0,0);
                                                const diffTime = lastDay - today;
                                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                return diffDays > 0 ? `${diffDays} Days Remaining` : 'Last Day Today';
                                            })()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Last Working Day: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(resignation.last_working_day)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {(resignation.status === 'approved' || resignation.status === 'rejected' || resignation.status === 'pending') && (
                                <>
                                    <button className="btn btn-sm btn-warning" onClick={() => setShowResignationModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        Update
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={handleRevoke} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        Revoke
                                    </button>
                                </>
                            )}
                            {resignation.status === 'revoke_requested' && (
                                <span style={{ fontSize: '0.8rem', color: '#8b5cf6', fontStyle: 'italic' }}>Pending Revoke Approval...</span>
                            )}
                            {getStatusBadge(resignation.status)}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {/* Avatar card */}
                <div className="card text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '30px 20px' }}>
                    <div style={{
                        width: 120, height: 120, borderRadius: '50%',
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '3rem', fontWeight: 900, color: '#fff',
                        boxShadow: '0 8px 30px rgba(99,102,241,0.4)',
                        border: '4px solid var(--bg-card)',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        {emp.profile_image && !imgError ? (
                            <img
                                src={(emp.profile_image.startsWith('http') || emp.profile_image.startsWith('data:')) ? emp.profile_image : `${baseUrl}${emp.profile_image}`}
                                alt={emp.name}
                                loading="lazy"
                                onError={() => setImgError(true)}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            emp.name?.[0] || '?'
                        )}
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{emp.name}</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>{emp.designation}</p>
                        <span className={`badge badge-${emp.role === 'hr_manager' ? 'purple' : emp.role === 'admin' ? 'badge-info' : emp.role === 'hr' ? 'info' : 'success'}`} style={{ marginTop: 8 }}>
                            {emp.role}
                        </span>
                    </div>
                    <div style={{ width: '100%', padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Employee Since</div>
                        <div style={{ fontWeight: 700 }}>
                            {formatDate(emp.date_of_joining)}
                        </div>
                    </div>
                    <div style={{ width: '100%', padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
                        {(() => {
                            const isPowerful = isManagerRole(user);
                            
                            // Check Permissions strictly: Override > Role Defaults
                            const userPerms = user?.permissions;
                            let hasAccess = false;
                            
                            if (userPerms && Array.isArray(userPerms)) {
                                // If individual overrides exist, they are absolute
                                hasAccess = userPerms.includes('documents_user') || userPerms.includes('manage_documents');
                            } else {
                                // Default mode: Only managers get it by default
                                hasAccess = isPowerful;
                            }
                            
                            if (hasAccess) {
                                return (
                                    <button 
                                        className="btn btn-outline btn-sm" 
                                        onClick={() => setShowDocManager(true)}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 }}
                                    >
                                        <FiFileText /> My Documents
                                    </button>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className="card">
                        <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiClipboard className="text-primary" /> Personal Information
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {fields.map(f => (
                                <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: 150, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {f.icon} {f.label}
                                    </span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right', textTransform: f.label.includes('Role') || f.label.includes('Gender') || f.label.includes('Status') ? 'capitalize' : undefined }}>
                                        {f.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {showEdit && (
                <div className="modal-overlay" onClick={() => setShowEdit(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiEdit2 /> Edit Personal Info
                            </h3>
                            <button className="modal-close" onClick={() => setShowEdit(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleUpdate}>
                            <div className="modal-body">
                                <div className="form-group" style={{ textAlign: 'center', marginBottom: 24 }}>
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <div style={{
                                            width: 100, height: 100, borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.03)',
                                            border: '2px dashed var(--border-color)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', cursor: 'pointer'
                                        }} onClick={() => document.getElementById('profileImgInput').click()}>
                                            {(preview || emp.profile_image) ? (
                                                <img
                                                    src={preview || (emp.profile_image.startsWith('http') ? emp.profile_image : `${baseUrl}${emp.profile_image}`)}
                                                    alt="Preview"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <FiUser size={40} style={{ color: 'var(--text-muted)' }} />
                                            )}
                                        </div>
                                        <input
                                            id="profileImgInput"
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={handleImageChange}
                                        />
                                        <div style={{
                                            position: 'absolute', bottom: 0, right: 0,
                                            background: 'var(--accent-primary)', color: '#fff',
                                            width: 32, height: 32, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', border: '2px solid var(--bg-card)'
                                        }} onClick={() => document.getElementById('profileImgInput').click()}>
                                            <FiEdit2 size={14} />
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Click to change profile picture</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Phone Number</label>
                                    <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Your phone number" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Gender</label>
                                    <select className="form-select" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Address</label>
                                    <textarea className="form-textarea" rows="2" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Your residential address" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Change Password <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>(leave blank to keep current)</span></label>
                                    <input type="password" className="form-input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Enter new password" />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowEdit(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {saving ? 'Saving...' : <><FiSave /> Save Changes</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showResignationModal && (
                <ResignationModal 
                    isOpen={showResignationModal} 
                    onClose={(refresh) => {
                        setShowResignationModal(false);
                        if (refresh) fetchProfileData();
                    }}
                    employee={emp}
                    existingRequest={resignation && !['revoke', 'rejected'].includes(resignation.status) ? resignation : null}
                />
            )}
            <DocumentManager 
                isOpen={showDocManager} 
                onClose={() => setShowDocManager(false)}
                employeeId={emp.id}
                employeeName={emp.name}
            />
        </div>
    );
}

