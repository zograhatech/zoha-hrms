import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { FiSearch, FiRefreshCcw, FiShield, FiTrash2, FiUser, FiMail, FiKey, FiX, FiCheck } from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];

const ALL_MODULES = [
    { header: 'BASIC MODULE (WORKSPACE)' },
    { label: 'Dashboard Access', key: 'dashboard' },
    { label: 'My Profile', key: 'profile' },
    { label: 'Attendance (User)', key: 'attendance_user' },
    { label: 'Leave (Apply)', key: 'leave_apply' },
    { label: 'Payroll (View)', key: 'payroll_user' },
    { label: 'Support Tickets', key: 'tickets_user' },
    { label: 'Events View', key: 'events' },

    { header: 'HR MANAGEMENT (INSIGHTS/HR)' },
    { label: 'Analytics & Reports', key: 'analytics' },
    { label: 'Manage Departments', key: 'manage_departments' },
    { label: 'Manage Employees', key: 'manage_employees' },
    { label: 'Attendance Report', key: 'manage_attendance' },
    { label: 'Shift Roster (Admin)', key: 'manage_shifts' },
    { label: 'Payroll Management', key: 'payroll' },
    { label: 'Asset Management', key: 'assets' },
    { label: 'All Tickets (Admin)', key: 'all_tickets' },
    { label: 'AI Chatbot', key: 'chat' },

    { header: 'MODULE 2: ZOOM' },
    { label: 'Zoom (New Meeting)', key: 'zoom_create' },
    { label: 'Zoom (Upcoming & Past)', key: 'zoom' },
    { label: 'Zoom Settings (Integrations)', key: 'zoom_settings' },

    { header: 'MODULE 3: RECRUITMENT' },
    { label: 'Recruitment & Onboarding', key: 'recruitment' },

    { header: 'MODULE 4: LIVE CHAT' },
    { label: 'Live Chat (Team)', key: 'live_chat' },

    { header: 'MODULE 5: FUN FRIDAY' },
    { label: 'Fun Chatbot', key: 'fun' },
    { label: 'Fun Summary', key: 'fun_summary' },

    { header: 'MODULE 6: LMS' },
    { label: 'LMS Management', key: 'lms' },
    { label: 'My Learning (User)', key: 'learning' },
    { label: 'Performance', key: 'performance' },

    { header: 'MODULE 7: TALLY' },
    { label: 'Accounting Management', key: 'tally_accounting' },
    { label: 'Inventory Management', key: 'tally_inventory' },
    { label: 'Sales Management', key: 'tally_sales' },
    { label: 'Purchases Management', key: 'tally_purchases' },
    { label: 'GST & Taxation', key: 'tally_tax' },
    { label: 'Banking Management', key: 'tally_banking' },

    { header: 'MODULE 8: EXIT MANAGEMENT' },
    { label: 'Manage Resignations (Admin)', key: 'exit' },
    { label: 'Approve Resignations (Admin Power)', key: 'exit_approve' },
    { label: 'Submit Resignation (User)', key: 'exit_user' },

    { header: 'MODULE 9: DOCUMENTS' },
    { label: 'Manage Documents (Admin)', key: 'manage_documents' },
    { label: 'My Documents (User)', key: 'documents_user' },

    { header: 'ADMINISTRATION' },
    { label: 'System Settings', key: 'manage_settings' },
];

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const { showToast } = useToast();
    const { user } = useAuth();
    const [roles, setRoles] = useState(['hr_manager', 'hr', 'employee']);
    
    // Permission Modal State
    const [selectedUser, setSelectedUser] = useState(null);
    const [userPerms, setUserPerms] = useState([]);
    const [savingPerms, setSavingPerms] = useState(false);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const { data } = await API.get('/employees');
            setUsers(data.employees || []);
            
            const settingsRes = await API.get('/settings');
            if (settingsRes.data.settings?.roles_permissions) {
                setRoles(Object.keys(settingsRes.data.settings.roles_permissions));
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to load users', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleRoleChange = async (userId, newRole) => {
        try {
            await API.put(`/employees/${userId}`, { role: newRole });
            showToast('User role updated successfully!', 'success');
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err) {
            showToast('Error updating role', 'error');
        }
    };

    const handleResetPassword = async (user) => {
        const newPassword = window.prompt(`Enter new password for ${user.name}:`);
        if (!newPassword || newPassword.length < 4) {
             if (newPassword) showToast('Password too short!', 'error');
             return;
        }
        try {
            await API.put(`/employees/${user.id}`, { password: newPassword });
            showToast('Password reset successfully!', 'success');
        } catch (err) {
            showToast('Error resetting password', 'error');
        }
    };

    // Open modal with effective permissions (Role Defaults + Overrides if any)
    const openPermsModal = (u) => {
        setSelectedUser(u);
        const roleKey = (u.role || '').toLowerCase().replace(/\s+/g, '');
        const isManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleKey);
        
        if (u.permissions && Array.isArray(u.permissions)) {
            // If individual permissions exist, use them precisely
            setUserPerms(u.permissions);
        } else {
            // If they are null, show the role-based effective defaults in the UI
            // This makes the transition to individual access much clearer.
            const defaults = isManager ? ALL_MODULES.filter(m => m.key).map(m => m.key) : BASIC_PERMISSIONS;
            setUserPerms(defaults || []);
        }
    };

    const togglePerm = (key) => {
        setUserPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const saveUserPerms = async () => {
        setSavingPerms(true);
        try {
            await API.put(`/employees/${selectedUser.id}`, { permissions: userPerms });
            showToast('Individual permissions updated!', 'success');
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, permissions: userPerms } : u));
            setSelectedUser(null);
        } catch (err) {
            showToast('Error saving permissions', 'error');
        } finally {
            setSavingPerms(false);
        }
    };

    const resetToDefaults = async () => {
        if (!window.confirm('Are you sure you want to remove individual overrides and reset to role-based defaults?')) return;
        setSavingPerms(true);
        try {
            await API.put(`/employees/${selectedUser.id}`, { permissions: null });
            showToast('Reset to role-based defaults!', 'success');
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, permissions: null } : u));
            setSelectedUser(null);
        } catch (err) {
            showToast('Error resetting permissions', 'error');
        } finally {
            setSavingPerms(false);
        }
    };

    const deleteUser = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await API.delete(`/employees/${id}`);
            showToast('User deleted successfully!', 'success');
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err) {
            showToast('Error deleting user', 'error');
        }
    };

    const filteredUsers = users.filter(u => 
        u.name?.toLowerCase().includes(search.toLowerCase()) || 
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.id?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="user-management-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiUser /> User & Access Management
                    </h3>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Manage individual module access and security roles.
                    </p>
                </div>
                <div style={{ position: 'relative' }}>
                    <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        className="form-input" 
                        style={{ paddingLeft: 36, width: 250 }} 
                        placeholder="Search users..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>User Details</th>
                            <th>Current Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40 }}><div className="loading-spinner" /></td></tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40 }}>No users found.</td></tr>
                        ) : filteredUsers.map(u => (
                            <tr key={u.id}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, background: 'var(--bg-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                            {u.name?.charAt(0)}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.id} · {u.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <select 
                                        className="form-select" 
                                        style={{ width: 'auto', fontSize: '0.85rem' }}
                                        value={u.role}
                                        onChange={e => handleRoleChange(u.id, e.target.value)}
                                        disabled={u.role === 'hr_manager' && users.filter(usr => usr.role === 'hr_manager').length <= 1}
                                    >
                                        {roles.map(r => (
                                            <option key={r} value={r}>
                                                {r === 'hr_manager' ? 'HR Manager' : r === 'hr' ? 'HR' : r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ')}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td><span className={`badge badge-${u.status === 'active' ? 'success' : 'danger'}`}>{u.status}</span></td>
                                <td>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {(() => {
                                            const roleLower = (user?.role || '').toLowerCase().replace(/\s+/g, '');
                                            const isHRManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleLower);
                                            if (isHRManager) {
                                                return (
                                                    <button 
                                                        className="btn btn-sm btn-outline" 
                                                        title="Individual Module Access"
                                                        onClick={() => openPermsModal(u)}
                                                        style={{ color: 'var(--accent-primary)', border: '1px solid rgba(99,102,241,0.2)' }}
                                                    >
                                                        <FiShield size={14} />
                                                    </button>
                                                );
                                            }
                                            return null;
                                        })()}
                                        <button className="btn btn-sm btn-outline" title="Reset Password" onClick={() => handleResetPassword(u)}>
                                            <FiKey size={14} />
                                        </button>
                                        <button className="btn btn-sm btn-danger-outline" title="Delete Account" disabled={u.role === 'hr_manager'} onClick={() => deleteUser(u.id)}>
                                            <FiTrash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedUser && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: 700 }}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title" style={{ margin: 0 }}>Individual Module Access</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                    Grant specific permissions to <b>{selectedUser.name}</b> override their role settings.
                                </p>
                            </div>
                            <button className="btn-close" onClick={() => setSelectedUser(null)}><FiX /></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', padding: '0 24px 24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                {ALL_MODULES.map((m, idx) => {
                                    if (m.header) {
                                        return (
                                            <div key={`modal-header-${idx}`} style={{ 
                                                gridColumn: '1 / -1', 
                                                fontSize: '0.65rem', 
                                                fontWeight: 800, 
                                                color: 'var(--accent-primary)', 
                                                textTransform: 'uppercase', 
                                                letterSpacing: '0.1em',
                                                marginTop: 20,
                                                marginBottom: 8,
                                                paddingBottom: 4,
                                                borderBottom: '1px solid var(--border-color)'
                                            }}>
                                                {m.header}
                                            </div>
                                        );
                                    }
                                    const isSelected = userPerms.includes(m.key);
                                    return (
                                        <div 
                                            key={m.key} 
                                            onClick={() => togglePerm(m.key)}
                                            style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center', 
                                                padding: '10px 14px', 
                                                borderRadius: 10,
                                                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                                background: isSelected ? 'rgba(99,102,241,0.05)' : 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <span style={{ fontSize: '0.82rem', fontWeight: isSelected ? 600 : 500 }}>{m.label}</span>
                                            {isSelected ? (
                                                <div style={{ width: 18, height: 18, background: 'var(--accent-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                    <FiCheck size={12} />
                                                </div>
                                            ) : (
                                                <div style={{ width: 18, height: 18, border: '2px solid var(--border-color)', borderRadius: '50%' }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                            <div>
                                <button className="btn btn-outline-danger" onClick={resetToDefaults} disabled={savingPerms}>Reset to Role Defaults</button>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn" onClick={() => setSelectedUser(null)}>Cancel</button>
                                <button className="btn btn-primary" onClick={saveUserPerms} disabled={savingPerms}>
                                    {savingPerms ? 'Saving...' : 'Update Individual Access'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
