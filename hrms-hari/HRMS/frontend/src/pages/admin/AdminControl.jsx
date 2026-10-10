import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { 
    FiShield, FiUsers, FiUser, FiCreditCard, FiActivity, FiLayers, 
    FiSettings, FiCheckCircle, FiXCircle, FiInfo 
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export default function AdminControl() {
    const { showToast } = useToast();
    const { user, refreshUser } = useAuth();
    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [payments, setPayments] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        Promise.all([
            API.get('/employees'),
            API.get('/settings'),
            API.get('/payments/all')
        ]).then(([uRes, sRes, pRes]) => {
            setUsers(uRes.data.employees || []);
            setSettings(sRes.data.settings || {});
            setPayments(pRes.data.payments || []);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const handleUpdatePayment = async (id, status) => {
        try {
            const res = await API.put(`/payments/${id}`, { status });
            if (res.data.success) {
                showToast(res.data.message, 'success');
                // Refresh both payments and users (permissions might have changed)
                const [uRes, pRes] = await Promise.all([
                    API.get('/employees'),
                    API.get('/payments/all')
                ]);
                setUsers(uRes.data.employees || []);
                setPayments(pRes.data.payments || []);

                // If admin approved their own payment, refresh their session
                const paymentObj = payments.find(p => p._id === id);
                if (paymentObj && paymentObj.employee_id === user.id) {
                    await refreshUser();
                }
            }
        } catch (err) {
            showToast('Error updating payment status.', 'error');
        }
    };

    const tabs = [
        { id: 'users', label: 'All Users', icon: <FiUsers /> },
        { id: 'modules', label: 'Modules & Features', icon: <FiLayers /> },
        { id: 'payment_logs', label: 'Payment Logs', icon: <FiCreditCard /> }
    ];

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiShield className="text-primary" /> Admin Control Center</div>
                    <div className="page-subtitle">Unified management for users, billing, and core modules</div>
                </div>
            </div>

            {/* Sidebar-style Tabs inside card */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            style={{
                                flex: 1,
                                padding: '16px 20px',
                                background: activeTab === t.id ? 'rgba(99, 102, 241, 0.05)' : 'none',
                                border: 'none',
                                borderBottom: activeTab === t.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                transition: '0.2s'
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                <div style={{ padding: 24 }}>
                    {activeTab === 'users' && (
                        <div>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="Search by name or email..." 
                                        style={{ background: 'var(--bg-primary)' }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <b>All Users ({users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())).length})</b>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {users.filter(u => u.role !== 'admin' && (u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()))).map((u, idx) => (
                                    <div key={u.id || u._id || idx} className="user-access-card" style={{ 
                                        background: 'var(--bg-primary)', 
                                        border: '1px solid var(--border-color)', 
                                        borderRadius: 16, 
                                        padding: '16px 20px' 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                                                    <FiUser size={20} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 800 }}>{u.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                                <select 
                                                    className="form-input" 
                                                    style={{ width: 140, padding: '6px 12px', fontSize: '0.85rem' }}
                                                    defaultValue={u.role}
                                                    onChange={async (e) => {
                                                        const newRole = e.target.value;
                                                        await API.put(`/employees/${u.id}`, { role: newRole });
                                                        if (u.id === user.id) await refreshUser(); // Sync session if updating self
                                                        setUsers(prev => prev.map(user => user.id === u.id ? { ...user, role: newRole } : user));
                                                        showToast('Role updated successfully!');
                                                    }}
                                                >
                                                    <option value="admin">Admin</option>
                                                    <option value="hr_manager">HR Manager</option>
                                                    <option value="hr">HR</option>
                                                    <option value="accountant">Accountant</option>
                                                    <option value="employee">Employee</option>
                                                </select>

                                                <button 
                                                    onClick={() => {
                                                        const current = document.getElementById(`perms-${u.id}`);
                                                        current.style.display = current.style.display === 'none' ? 'block' : 'none';
                                                    }}
                                                    style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent-primary)', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                                >
                                                    {u.permissions?.length || 0} Pages <FiSettings size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        <div id={`perms-${u.id}`} style={{ display: 'none', marginTop: 20, paddingTop: 20, borderTop: '1px dashed var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Page Access Control</div>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <button 
                                                        onClick={() => {
                                                            const checkboxes = document.querySelectorAll(`#perms-${u.id} input[type="checkbox"]`);
                                                            checkboxes.forEach(cb => cb.checked = true);
                                                        }}
                                                        className="btn btn-sm" 
                                                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                                    >
                                                        Grant All
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const checkboxes = document.querySelectorAll(`#perms-${u.id} input[type="checkbox"]`);
                                                            checkboxes.forEach(cb => { if (!cb.disabled) cb.checked = false; });
                                                        }}
                                                        className="btn btn-sm btn-outline" 
                                                        style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--accent-red)' }}
                                                    >
                                                        Revoke All
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                                                {[
                                                    { id: 'dashboard', label: 'Dashboard', always: true },
                                                    { id: 'profile', label: 'My Profile' },
                                                    { id: 'attendance', label: 'Attendance' },
                                                    { id: 'leave', label: 'Leave' },
                                                    { id: 'payroll', label: 'Payroll (Self)' },
                                                    { id: 'tickets', label: 'Support Tickets' },
                                                    { id: 'chat', label: 'Live Chat' },
                                                    { id: 'zoom', label: 'Zoom Meetings' },
                                                    { id: 'events', label: 'Events' },
                                                    { id: 'learning', label: 'My Learning' },
                                                    { id: 'analytics', label: 'Analytics' },
                                                    { id: 'departments', label: 'Departments' },
                                                    { id: 'employees', label: 'HR: Employees' },
                                                    { id: 'recruitment', label: 'HR: Recruitment' },
                                                    { id: 'performance', label: 'HR: Performance' },
                                                    { id: 'attendance_report', label: 'HR: Attendance Report' },
                                                    { id: 'shifts', label: 'HR: Shift Roster' },
                                                    { id: 'payroll_admin', label: 'HR: Payroll Management' },
                                                    { id: 'assets', label: 'HR: Assets' },
                                                    { id: 'exit', label: 'HR: Exit Management' },
                                                    { id: 'tickets_all', label: 'HR: All Tickets' },
                                                    { id: 'fun', label: 'HR: Fun Summary' },
                                                    { id: 'lms', label: 'HR: LMS Management' },
                                                    { id: 'tally', label: 'Tally: Accounting' },
                                                    { id: 'tally_inv', label: 'Tally: Inventory' },
                                                    { id: 'tally_sales', label: 'Tally: Sales' },
                                                    { id: 'tally_pur', label: 'Tally: Purchases' },
                                                    { id: 'tally_tax', label: 'Tally: GST & Taxation' },
                                                    { id: 'tally_bank', label: 'Tally: Banking' },
                                                    { id: 'settings', label: 'Settings' }
                                                ].map(p => (
                                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: 'var(--bg-secondary)', borderRadius: 10, cursor: p.always ? 'default' : 'pointer', border: '1px solid var(--border-color)' }}>
                                                        <input 
                                                            id={`perm-${u.id}-${p.id}`}
                                                            type="checkbox" 
                                                            defaultChecked={p.always || u.permissions?.includes(p.id)}
                                                            disabled={p.always}
                                                        />
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.label}</span>
                                                        {p.always && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>Always on</span>}
                                                    </label>
                                                ))}
                                            </div>
                                            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                                                <button 
                                                    className="btn btn-primary"
                                                    style={{ padding: '8px 20px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
                                                    onClick={async () => {
                                                        const checkboxes = document.querySelectorAll(`#perms-${u.id} input[type="checkbox"]`);
                                                        const newPerms = [];
                                                        checkboxes.forEach(cb => {
                                                            if (cb.checked && !cb.disabled) newPerms.push(cb.id.replace(`perm-${u.id}-`, ''));
                                                            if (cb.disabled) newPerms.push(cb.id.replace(`perm-${u.id}-`, ''));
                                                        });
                                                        await API.put(`/employees/${u.id}`, { permissions: newPerms });
                                                        if (u.id === user.id) await refreshUser();
                                                        showToast('Permissions updated successfully!');
                                                    }}
                                                >
                                                    <FiCheckCircle size={14} /> Save Configuration
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'modules' && (
                        <div>
                            <div className="grid-2">
                                {[
                                    { name: 'Payroll Engine', key: 'payroll', desc: 'Automated salary calculation and reports.' },
                                    { name: 'LMS Platform', key: 'lms', desc: 'Employee training and course management.' },
                                    { name: 'Zoom Integration', key: 'zoom', desc: 'Built-in video conferencing for meetings.' },
                                    { name: 'Tally Finance', key: 'tally', desc: 'Accounting, Inventory and GST management.' },
                                    { name: 'Performance Review', key: 'performance', desc: 'Quarterly and Yearly reviews for staff.' },
                                    { name: 'Attendance & Biometric', key: 'attendance', desc: 'Real-time attendance tracking and sync.' },
                                    { name: 'Asset Management', key: 'assets', desc: 'Track and manage company properties.' },
                                    { name: 'Recruitment & ATS', key: 'recruitment', desc: 'End-to-end recruitment pipeline.' },
                                    { name: 'Shift & Rotation', key: 'shifts', desc: 'Manage work timings and shift rosters.' },
                                    { name: 'Helpdesk Support', key: 'tickets', desc: 'Internal ticketing and support system.' },
                                    { name: 'Exit Management', key: 'exit', desc: 'Handle resignations and exit interviews.' },
                                    { name: 'Dashboard & Analytics (Free Edition)', key: 'analytics', desc: 'Core data trends, basic reports & dashboard.' },
                                    { name: 'Fun Friday & Chat', key: 'fun', desc: 'Company events, Fun Friday & AI Chatbot.' }
                                ].map(m => (
                                    <div key={m.key} style={{ padding: 20, border: '1px solid var(--border-color)', borderRadius: 16, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>{m.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.desc}</div>
                                            </div>
                                            <div style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.85rem' }}>
                                                <FiCheckCircle /> Active
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Module Price (₹):</span>
                                            <input 
                                                id={`price-${m.key}`}
                                                type="number"
                                                className="form-input"
                                                style={{ width: 120, margin: 0, padding: '4px 10px', fontSize: '0.9rem' }}
                                                defaultValue={settings?.module_pricing?.[m.key] || 0}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 24, textAlign: 'right' }}>
                                <button 
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        const inputs = document.querySelectorAll('input[id^="price-"]');
                                        const newPricing = { ...settings.module_pricing };
                                        inputs.forEach(input => {
                                            newPricing[input.id.replace('price-', '')] = parseFloat(input.value) || 0;
                                        });
                                        await API.put('/settings', { module_pricing: newPricing });
                                        setSettings(prev => ({ ...prev, module_pricing: newPricing }));
                                        showToast('Module pricing updated successfully!');
                                    }}
                                >
                                    Save Module Prices
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'payment_logs' && (
                        <div>
                            <div className="card mb-24" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                    <div style={{ width: 120, height: 120, background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        {settings?.payment_qr_code ? (
                                            <img src={settings.payment_qr_code} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        ) : (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>No QR<br/>Uploaded</div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800 }}>Marketplace QR Code</h3>
                                        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>This QR code will be displayed to employees when they request premium module upgrades.</p>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <label className="btn btn-outline" style={{ cursor: 'pointer', padding: '8px 16px', fontSize: '0.85rem' }}>
                                                Upload New QR
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    style={{ display: 'none' }} 
                                                    onChange={async (e) => {
                                                        const file = e.target.files[0];
                                                        if (!file) return;
                                                        
                                                        const formData = new FormData();
                                                        formData.append('qr_code', file);
                                                        
                                                        try {
                                                            const res = await API.put('/settings', formData, {
                                                                headers: { 'Content-Type': 'multipart/form-data' }
                                                            });
                                                            setSettings(prev => ({ ...prev, payment_qr_code: res.data.settings.payment_qr_code }));
                                                            showToast('QR Code updated successfully!', 'success');
                                                        } catch (err) {
                                                            showToast('Failed to upload QR code.');
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="card-header" style={{ marginBottom: 20 }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <FiCreditCard /> Received Payment Proofs
                                </h3>
                            </div>
                            <div className="table-responsive" style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', minWidth: '800px' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(0, 0, 0, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff Name</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Module Requested</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>UTR / TID</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                                        </tr>
                                    </thead>
                                <tbody>
                                    {payments.length === 0 ? (
                                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No payment logs found.</td></tr>
                                    ) : (
                                        payments.map((p, idx) => (
                                            <tr key={p._id || idx} style={{ borderBottom: '1px solid var(--border-color)', transition: '0.2s' }}>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{p.employee_name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.employee_id}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>{p.module_name}</td>
                                                <td style={{ padding: '16px 20px', color: 'var(--accent-primary)', fontWeight: 800 }}>₹{p.amount?.toLocaleString()}</td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <code style={{ background: 'rgba(0,0,0,0.04)', padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                                        {p.transaction_id || 'N/A'}
                                                    </code>
                                                </td>
                                                <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {new Date(p.createdAt).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <span className={`badge badge-${p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'danger' : 'warning'}`} style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 800 }}>
                                                        {p.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ display: 'flex', gap: 10 }}>
                                                        {p.receipt_image && (
                                                            <button 
                                                                className="btn btn-icon" 
                                                                title="View Receipt"
                                                                onClick={() => window.open(p.receipt_image, '_blank')}
                                                                style={{ background: 'rgba(99, 102, 241, 0.08)', color: 'var(--accent-primary)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '6px' }}
                                                            >
                                                                <FiInfo size={14} />
                                                            </button>
                                                        )}
                                                        {p.status === 'pending' && (
                                                            <>
                                                                <button 
                                                                    className="btn btn-icon" 
                                                                    title="Approve"
                                                                    onClick={() => handleUpdatePayment(p._id, 'approved')}
                                                                    style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--accent-green)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '6px' }}
                                                                >
                                                                    <FiCheckCircle size={14} />
                                                                </button>
                                                                <button 
                                                                    className="btn btn-icon" 
                                                                    title="Reject"
                                                                    onClick={() => handleUpdatePayment(p._id, 'rejected')}
                                                                    style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px' }}
                                                                >
                                                                    <FiXCircle size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    )}

                </div>
            </div>
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                System Version: 2.1.0-alpha · Organization: {settings?.company_name || 'HRMS'}
            </div>
        </div>
    );
}
