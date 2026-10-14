import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { isManagerRole, isSuperAdmin } from '../../utils/roleHelper';

import {
    FiSettings, FiBriefcase, FiMail, FiClock,
    FiSave, FiSend, FiPlus, FiEye, FiEyeOff,
    FiX, FiUmbrella, FiTrash2, FiEdit2, FiLock, FiShield, FiUserCheck, FiPercent, FiVideo, FiLayers, FiCreditCard, FiCalendar
} from 'react-icons/fi';

import ZoomSettings from '../zoom/ZoomSettings';
import UserManagement from './UserManagement';
import { useToast } from '../../context/ToastContext';
import './Settings.css';

export default function Settings() {
    const auth = useAuth();
    const { showToast } = useToast();
    const user = auth?.user || null;
    const permissions = user?.permissions || [];



    const [settings, setSettings] = useState({
        company_name: '',
        company_subtext: '',
        company_logo: '',
        company_address: '',
        company_email: '',
        company_phone: '',
        company_gstin: '',
        leave_policies: {
            casual_leave: 12,
            sick_leave: 12,
            earned_leave: 15,
            maternity_leave: 0,
            paternity_leave: 0
        },
        email_settings: {
            mail_from_name: '',
            mail_from_email: '',
            enable_email_queue: 'No',
            mail_driver: 'smtp',
            mail_host: '',
            mail_port: '',
            mail_encryption: 'ssl',
            mail_username: '',
            mail_password: ''
        },
        roles_permissions: {
            hr_manager: [],
            hr: [],
            employee: []
        },
        payroll_formulas: {
            pf_wage_ceiling: 15000,
            pf_fixed_amount: 1800,
            pf_rate: 0.12,
            esi_wage_limit: 21000,
            esi_employee_rate: 0.0075,
            esi_employer_rate: 0.0325,
            pt_slab1_limit: 10000,
            pt_slab1_amount: 0,
            pt_slab2_limit: 15000,
            pt_slab2_amount: 150,
            pt_above_amount: 200
        },
        require_email_verification: false,
        require_2fa: false,
        security_pilot_employee_ids: []
    });

    const [shifts, setShifts] = useState([]);
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [activeTab, setActiveTab] = useState('company');

    useEffect(() => {
        if (!user) return;
        const canManageGen = isManagerRole(user) || permissions.includes('manage_settings');
        const canManageZoom = permissions.includes('zoom_settings');
        const canManageShifts = isManagerRole(user) || permissions.includes('manage_shifts');

        if (!canManageGen) {
            if (canManageZoom && activeTab === 'company') setActiveTab('integrations');
            else if (canManageShifts && activeTab === 'company') setActiveTab('shifts');
            else if (activeTab === 'company') setActiveTab('users'); // Fallback to something safe or users if permitted
        }
    }, [user, permissions]);




    const [shiftForm, setShiftForm] = useState({
        name: '', start_time: '09:00', end_time: '18:00',
        grace_period: 5, half_day_min_hours: 4.5, full_day_min_hours: 9,
        allowed_clock_ins: 1
    });
    const [editingShift, setEditingShift] = useState(null);




    const [showPassword, setShowPassword] = useState(false);
    const { refreshBranding } = useBranding();
    const { refreshUser } = auth; // Use auth from top

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [logoError, setLogoError] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    useEffect(() => {
        setLoading(true);
        const canManageShifts = isManagerRole(user) || permissions.includes('manage_shifts') || permissions.includes('manage_employees');
        
        const promises = [API.get('/settings')];
        if (canManageShifts) {
            promises.push(API.get('/shifts'));
        }

        Promise.all(promises).then(([resSet, resShi]) => {
            if (resSet.data.settings) {
                const s = resSet.data.settings;
                // Ensure roles_permissions is always an object
                if (!s.roles_permissions) s.roles_permissions = { hr_manager: [], hr: [], employee: [] };
                if (!Array.isArray(s.security_pilot_employee_ids)) {
                    s.security_pilot_employee_ids = [];
                }
                setSettings(s);
            }
            if (resShi && resShi.data.shifts) setShifts(resShi.data.shifts);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const handleChange = (e, section) => {
        const { name, value } = e.target;
        if (section === 'leave_policies') {
            setSettings(prev => ({
                ...prev,
                leave_policies: {
                    ...prev.leave_policies,
                    [name]: Number(value)
                }
            }));
        } else if (section === 'email_settings') {
            setSettings(prev => ({
                ...prev,
                email_settings: {
                    ...prev.email_settings,
                    [name]: value
                }
            }));
        } else if (section === 'payroll_formulas') {
            setSettings(prev => ({
                ...prev,
                payroll_formulas: {
                    ...(prev.payroll_formulas || {}),
                    [name]: parseFloat(value) || 0
                }
            }));
        } else {
            setSettings(prev => ({ ...prev, [name]: value }));
        }
    };




    const handleSendTestEmail = async () => {
        setSaving(true);
        setMsg({ text: '', type: '' });
        try {
            const res = await API.post('/settings/test-email', settings.email_settings);
            setMsg({ text: res.data.message, type: 'success' });
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Error sending test email.', type: 'danger' });
        } finally {
            setSaving(false);
        }
    };


    const saveSettings = async (customSettings = null) => {
        setSaving(true);
        setMsg({ text: '', type: '' });

        try {
            const dataToSave = customSettings || settings;
            const formData = new FormData();
            formData.append('settings', JSON.stringify(dataToSave));
            if (logoFile && !customSettings) {
                formData.append('logo', logoFile);
            }

            const res = await API.put('/settings', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                if (res.data.settings) {
                    if (!Array.isArray(res.data.settings.security_pilot_employee_ids)) {
                        res.data.settings.security_pilot_employee_ids = [];
                    }
                    setSettings(res.data.settings);
                }
                setMsg({ text: 'Settings saved successfully!', type: 'success' });
                if (refreshBranding) refreshBranding();
                if (refreshUser) await refreshUser();
                if (!customSettings) setLogoFile(null);
            } else {
                setMsg({ text: res.data.message || 'Error saving settings.', type: 'danger' });
            }
        } catch (err) {
            console.error('[saveSettings] Error:', err);
            setMsg({ text: err.response?.data?.message || 'Error saving settings. Please check console.', type: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = (e) => {
        if (e) e.preventDefault();
        saveSettings();
    };


    const handleShiftSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingShift) {
                await API.put(`/shifts/${editingShift._id}`, shiftForm);
            } else {
                await API.post('/shifts', shiftForm);
            }
            const res = await API.get('/shifts');
            setShifts(res.data.shifts);
            setShowShiftModal(false);
            setEditingShift(null);
            showToast('Shift saved successfully!');
            setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', grace_period: 15, half_day_min_hours: 4, full_day_min_hours: 8 });
        } catch {
            showToast('Error saving shift', 'error');
        } finally {
            setSaving(false);
        }
    };

    const deleteShift = async (id) => {
        if (!window.confirm('Are you sure you want to delete this shift?')) return;
        try {
            await API.delete(`/shifts/${id}`);
            setShifts(prev => prev.filter(s => s._id !== id));
            showToast('Shift deleted successfully!');
        } catch {
            showToast('Error deleting shift', 'error');
        }
    };

    const [holidays, setHolidays] = useState([]);
    const [loadingHolidays, setLoadingHolidays] = useState(false);
    const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
    const [submittingHoliday, setSubmittingHoliday] = useState(false);

    const fetchHolidays = async () => {
        try {
            setLoadingHolidays(true);
            const res = await API.get('/holidays');
            if (res.data.success) {
                setHolidays(res.data.holidays || []);
            }
        } catch (err) {
            console.error('[fetchHolidays]', err);
        } finally {
            setLoadingHolidays(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'holidays' && isSuperAdmin(user)) {
            fetchHolidays();
        }
    }, [activeTab, user]);

    const handleCreateHoliday = async (e) => {
        e.preventDefault();
        if (!holidayForm.date || !holidayForm.name.trim()) {
            showToast('Please provide both holiday date and name.', 'error');
            return;
        }
        try {
            setSubmittingHoliday(true);
            const res = await API.post('/holidays', {
                date: holidayForm.date,
                name: holidayForm.name.trim()
            });
            if (res.data.success) {
                showToast('Holiday created successfully!');
                setHolidayForm({ date: '', name: '' });
                fetchHolidays();
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to create holiday.', 'error');
        } finally {
            setSubmittingHoliday(false);
        }
    };

    const handleDeleteHoliday = async (id) => {
        if (!window.confirm('Are you sure you want to delete this holiday?')) return;
        try {
            const res = await API.delete(`/holidays/${id}`);
            if (res.data.success) {
                showToast('Holiday deleted successfully!');
                setHolidays(prev => prev.filter(h => h._id !== id));
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to delete holiday.', 'error');
        }
    };

    const [allEmployees, setAllEmployees] = useState([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [pilotSearch, setPilotSearch] = useState('');
    const [pilotDepartment, setPilotDepartment] = useState('');

    const fetchAllEmployees = async () => {
        try {
            setLoadingEmployees(true);
            let page = 1;
            let totalPages = 1;
            let collected = [];
            do {
                const res = await API.get('/employees', { params: { page, limit: 100 } });
                if (res.data && res.data.success) {
                    const emps = res.data.employees || [];
                    collected = collected.concat(emps);
                    totalPages = res.data.pagination?.pages || 1;
                } else {
                    break;
                }
                page++;
            } while (page <= totalPages);
            setAllEmployees(collected);
        } catch (err) {
            console.error('Failed to load employees for pilot picker', err);
        } finally {
            setLoadingEmployees(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'security' && isSuperAdmin(user) && allEmployees.length === 0) {
            fetchAllEmployees();
        }
    }, [activeTab, user]);

    const distinctDepartments = Array.from(
        new Set(allEmployees.map(emp => emp.department_name).filter(Boolean))
    ).sort();

    const filteredEmployees = allEmployees.filter(emp => {
        const query = pilotSearch.trim().toLowerCase();
        const matchesSearch = !query ||
            (emp.name && emp.name.toLowerCase().includes(query)) ||
            (emp.id && String(emp.id).toLowerCase().includes(query));
        const matchesDept = !pilotDepartment || emp.department_name === pilotDepartment;
        return matchesSearch && matchesDept;
    });

    const selectedPilotIds = settings.security_pilot_employee_ids || [];

    const togglePilotEmployee = (empId) => {
        setSettings(prev => {
            const current = prev.security_pilot_employee_ids || [];
            const next = current.includes(empId)
                ? current.filter(id => id !== empId)
                : [...current, empId];
            return { ...prev, security_pilot_employee_ids: next };
        });
    };

    const removePilotEmployee = (empId) => {
        setSettings(prev => ({
            ...prev,
            security_pilot_employee_ids: (prev.security_pilot_employee_ids || []).filter(id => id !== empId)
        }));
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiSettings style={{ marginRight: 8, verticalAlign: 'middle' }} /> Admin Settings</div>
                    <div className="page-subtitle">Configure global HRMS parameters and shift timings</div>
                </div>
            </div>

            <div className="tabs" style={{ marginBottom: 24 }}>
                {(isManagerRole(user) || permissions.includes('manage_settings')) && (
                    <>
                        <button className={`tab-link ${activeTab === 'company' ? 'active' : ''}`} onClick={() => setActiveTab('company')}><FiBriefcase /> Company &amp; Leaves</button>
                        <button className={`tab-link ${activeTab === 'email' ? 'active' : ''}`} onClick={() => setActiveTab('email')}><FiMail /> Email Settings</button>
                        <button className={`tab-link ${activeTab === 'payroll' ? 'active' : ''}`} onClick={() => setActiveTab('payroll')}><FiPercent /> Payroll Formulas</button>
                    </>
                )}
                {(isManagerRole(user) || permissions.includes('manage_shifts')) && (
                    <button className={`tab-link ${activeTab === 'shifts' ? 'active' : ''}`} onClick={() => setActiveTab('shifts')}><FiClock /> Shift Management</button>
                )}

                {(isManagerRole(user) || permissions.includes('manage_settings') || permissions.includes('zoom_settings')) && (
                    <button className={`tab-link ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => setActiveTab('integrations')}><FiVideo /> Integrations</button>
                )}
                {(isManagerRole(user) || permissions.includes('manage_settings')) && (
                    <button className={`tab-link ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}><FiUserCheck /> User Management</button>
                )}
                {isSuperAdmin(user) && (
                    <>
                        <button className={`tab-link ${activeTab === 'holidays' ? 'active' : ''}`} onClick={() => setActiveTab('holidays')}><FiCalendar /> Holidays</button>
                        <button className={`tab-link ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}><FiShield /> Security</button>
                    </>
                )}

            </div>



            {msg.text && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 20 }}>{msg.text}</div>}

            {activeTab === 'company' && (
                <form onSubmit={handleSave} className="grid-2" style={{ gap: 24 }}>
                    <div className="card">
                        <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiBriefcase /> Company Information
                        </h3>
                        <div className="form-group">
                            <label className="form-label">Company Logo</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
                                <div style={{ width: 80, height: 80, borderRadius: 12, border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.03)' }}>
                                    {(logoPreview || settings.company_logo) && !logoError ? (
                                        <img 
                                            src={logoPreview || `${import.meta.env.VITE_API_BASE_URL || ''}${settings.company_logo}`} 
                                            alt="Logo Preview" 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                            onError={() => setLogoError(true)}
                                        />
                                    ) : (
                                        <FiBriefcase size={30} style={{ opacity: 0.2 }} />
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                setLogoFile(file);
                                                setLogoPreview(URL.createObjectURL(file));
                                                setLogoError(false);
                                            }
                                        }}
                                        className="form-input"
                                        style={{ display: 'block', marginBottom: 5 }}
                                    />
                                    <small style={{ color: 'var(--text-muted)' }}>Recommended: Square image, max 2MB</small>
                                </div>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Name</label>
                            <input type="text" name="company_name" className="form-input" value={settings.company_name} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Subtext (Tagline)</label>
                            <input type="text" name="company_subtext" className="form-input" value={settings.company_subtext} onChange={handleChange} placeholder="e.g. HR Management System" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Email</label>
                            <input type="email" name="company_email" className="form-input" value={settings.company_email} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Phone</label>
                            <input type="text" name="company_phone" className="form-input" value={settings.company_phone} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Address</label>
                            <textarea name="company_address" className="form-textarea" rows="3" value={settings.company_address} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company GSTIN</label>
                            <input type="text" name="company_gstin" className="form-input" value={settings.company_gstin} onChange={handleChange} placeholder="e.g. 33AAAAA0000A1Z5" />
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiUmbrella /> Global Leave Policies (Monthly)
                        </h3>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Casual Leave (per month)</label>
                                <input type="number" name="casual_leave" className="form-input" value={settings.leave_policies.casual_leave} onChange={(e) => handleChange(e, 'leave_policies')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sick Leave (per month)</label>
                                <input type="number" name="sick_leave" className="form-input" value={settings.leave_policies.sick_leave} onChange={(e) => handleChange(e, 'leave_policies')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Earned Leave</label>
                                <input type="number" name="earned_leave" className="form-input" value={settings.leave_policies.earned_leave} onChange={(e) => handleChange(e, 'leave_policies')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Maternity Leave</label>
                                <input type="number" name="maternity_leave" className="form-input" value={settings.leave_policies.maternity_leave} onChange={(e) => handleChange(e, 'leave_policies')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Paternity Leave</label>
                                <input type="number" name="paternity_leave" className="form-input" value={settings.leave_policies.paternity_leave} onChange={(e) => handleChange(e, 'leave_policies')} />
                            </div>
                        </div>
                    </div>

                    <div className="grid-span-2" style={{ textAlign: 'right' }}>
                        <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiSave /> Save General Settings
                        </button>
                    </div>
                </form>
            )}

            {activeTab === 'email' && (
                <form onSubmit={handleSave} className="card">
                    <h3 style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiMail /> Email Configuration
                    </h3>

                    <div className="grid-2" style={{ gap: 24 }}>
                        <div className="form-group">
                            <label className="form-label">Mail From Name <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                            <input type="text" name="mail_from_name" className="form-input" value={settings.email_settings.mail_from_name} onChange={(e) => handleChange(e, 'email_settings')} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Mail From Email <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                            <input type="email" name="mail_from_email" className="form-input" value={settings.email_settings.mail_from_email} onChange={(e) => handleChange(e, 'email_settings')} required />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Enable Email Queue</label>
                            <select name="enable_email_queue" className="form-input" value={settings.email_settings.enable_email_queue} onChange={(e) => handleChange(e, 'email_settings')}>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mail Driver</label>
                            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="radio" name="mail_driver" value="mail" checked={settings.email_settings.mail_driver === 'mail'} onChange={(e) => handleChange(e, 'email_settings')} /> Mail
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="radio" name="mail_driver" value="smtp" checked={settings.email_settings.mail_driver === 'smtp'} onChange={(e) => handleChange(e, 'email_settings')} /> SMTP
                                </label>
                            </div>
                        </div>

                        <div className="form-group grid-span-2">
                            <label className="form-label">Mail Host <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                            <input type="text" name="mail_host" className="form-input" placeholder="smtp.gmail.com" value={settings.email_settings.mail_host} onChange={(e) => handleChange(e, 'email_settings')} required />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mail Port <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                            <input type="text" name="mail_port" className="form-input" placeholder="465" value={settings.email_settings.mail_port} onChange={(e) => handleChange(e, 'email_settings')} required />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mail Encryption</label>
                            <select name="mail_encryption" className="form-input" value={settings.email_settings.mail_encryption} onChange={(e) => handleChange(e, 'email_settings')}>
                                <option value="none">None</option>
                                <option value="ssl">SSL</option>
                                <option value="tls">TLS</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mail Username <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                            <input type="text" name="mail_username" className="form-input" value={settings.email_settings.mail_username} onChange={(e) => handleChange(e, 'email_settings')} required />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mail Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="mail_password"
                                    className="form-input"
                                    style={{ paddingRight: 40 }}
                                    value={settings.email_settings.mail_password}
                                    onChange={(e) => handleChange(e, 'email_settings')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', display: 'flex' }}
                                >
                                    {showPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                            </div>
                            {settings.email_settings.mail_host?.includes('gmail.com') && (
                                <small style={{ color: 'var(--accent-primary)', display: 'block', marginTop: 5, fontSize: '0.75rem' }}>
                                    💡 <strong>Gmail User?</strong> You must use a 16-character <b>App Password</b>, not your regular password. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Generate one here</a>.
                                </small>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 40, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline" onClick={handleSendTestEmail} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiSend /> Send Test Email
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiSave /> Save Email Settings
                        </button>
                    </div>
                </form>
            )}

            {activeTab === 'users' && (
                <UserManagement />
            )}



            {activeTab === 'shifts' && (
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: 16 }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiClock /> Shifts List
                        </h3>
                        <button className="btn btn-primary" onClick={() => { setEditingShift(null); setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', grace_period: 5, half_day_min_hours: 4.5, full_day_min_hours: 9, allowed_clock_ins: 1 }); setShowShiftModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiPlus /> Add New Shift
                        </button>
                    </div>
                    <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Shift Name</th>
                                    <th>Timing</th>
                                    <th>Grace</th>
                                    <th>Clock Ins</th>
                                    <th>Full/Half Min</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.map(s => (
                                    <tr key={s._id}>
                                        <td><strong>{s.name}</strong></td>
                                        <td>{s.start_time} - {s.end_time}</td>
                                        <td>{s.grace_period} mins</td>
                                        <td>{s.allowed_clock_ins || 1}</td>
                                        <td>{s.full_day_min_hours}h / {s.half_day_min_hours}h</td>
                                        <td>
                                            <button className="btn btn-sm btn-info" onClick={() => { setEditingShift(s); setShiftForm(s); setShowShiftModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <FiEdit2 size={12} /> Edit
                                            </button>
                                            <button className="btn btn-sm btn-danger" onClick={() => deleteShift(s._id)} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <FiTrash2 size={12} /> Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {shifts.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center' }}>No shifts defined.</td></tr>}
                            </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'payroll' && (
                <form onSubmit={handleSave} className="card">
                    <h3 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiPercent /> Payroll Formulas
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 24 }}>
                        Configure the thresholds and rates used for automatic payroll calculations. Changes will be reflected in all future payroll runs.
                    </p>

                    {/* PF Section */}
                    <div style={{ marginBottom: 28, padding: 18, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(99,102,241,0.05)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provident Fund (PF)</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                            Formula: If (Basic + DA + OA) &gt; Wage Ceiling → Fixed Amount, else (Basic + DA + OA) × Rate
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="form-group">
                                <label className="form-label">PF Wage Ceiling (₹)</label>
                                <input type="number" name="pf_wage_ceiling" className="form-input"
                                    value={settings.payroll_formulas?.pf_wage_ceiling ?? 15000}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>If gross exceeds this, fixed PF is applied</small>
                            </div>
                            <div className="form-group">
                                <label className="form-label">PF Fixed Amount when above ceiling (₹)</label>
                                <input type="number" name="pf_fixed_amount" className="form-input"
                                    value={settings.payroll_formulas?.pf_fixed_amount ?? 1800}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Deducted when gross &gt; ceiling</small>
                            </div>
                            <div className="form-group">
                                <label className="form-label">PF Employee Rate (e.g. 0.12 = 12%)</label>
                                <input type="number" name="pf_rate" step="0.001" className="form-input"
                                    value={settings.payroll_formulas?.pf_rate ?? 0.12}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Applied when gross ≤ ceiling</small>
                            </div>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(99,102,241,0.07)', fontSize: '0.75rem', color: 'var(--accent-light)', fontFamily: 'monospace' }}>
                            PF = IF(gross &gt; ₹{(settings.payroll_formulas?.pf_wage_ceiling ?? 15000).toLocaleString('en-IN')}) → ₹{(settings.payroll_formulas?.pf_fixed_amount ?? 1800).toLocaleString('en-IN')}, ELSE gross × {((settings.payroll_formulas?.pf_rate ?? 0.12) * 100).toFixed(1)}%
                        </div>
                    </div>

                    {/* ESI Section */}
                    <div style={{ marginBottom: 28, padding: 18, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(16,185,129,0.05)' }}>
                        <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 4, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ESI (Employee State Insurance)</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                            Formula: If (Basic + DA) &gt; Wage Limit → ESI = 0, else (Basic + DA) × Rate
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="form-group">
                                <label className="form-label">ESI Wage Limit (₹)</label>
                                <input type="number" name="esi_wage_limit" className="form-input"
                                    value={settings.payroll_formulas?.esi_wage_limit ?? 21000}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>If Basic+DA exceeds this, ESI = ₹0</small>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Employee ESI Rate (e.g. 0.0075 = 0.75%)</label>
                                <input type="number" name="esi_employee_rate" step="0.0001" className="form-input"
                                    value={settings.payroll_formulas?.esi_employee_rate ?? 0.0075}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Employer ESI Rate (e.g. 0.0325 = 3.25%)</label>
                                <input type="number" name="esi_employer_rate" step="0.0001" className="form-input"
                                    value={settings.payroll_formulas?.esi_employer_rate ?? 0.0325}
                                    onChange={e => handleChange(e, 'payroll_formulas')} />
                            </div>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.07)', fontSize: '0.75rem', color: '#10b981', fontFamily: 'monospace' }}>
                            ESI = IF(Basic+DA &gt; ₹{(settings.payroll_formulas?.esi_wage_limit ?? 21000).toLocaleString('en-IN')}) → ₹0, ELSE (Basic+DA) × {((settings.payroll_formulas?.esi_employee_rate ?? 0.0075) * 100).toFixed(2)}%
                        </div>
                    </div>

                    {/* PT Section */}
                    <div style={{ marginBottom: 28, padding: 18, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.05)' }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 4, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Professional Tax (PT) – Slabs</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                            Gross Salary slab-based monthly PT deduction
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(245,158,11,0.1)' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Slab</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Gross Up To (₹)</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>PT Amount (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Slab 1</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                            <input type="number" name="pt_slab1_limit" className="form-input" style={{ width: 140 }}
                                                value={settings.payroll_formulas?.pt_slab1_limit ?? 10000}
                                                onChange={e => handleChange(e, 'payroll_formulas')} />
                                        </td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                            <input type="number" name="pt_slab1_amount" className="form-input" style={{ width: 120 }}
                                                value={settings.payroll_formulas?.pt_slab1_amount ?? 0}
                                                onChange={e => handleChange(e, 'payroll_formulas')} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Slab 2</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                            <input type="number" name="pt_slab2_limit" className="form-input" style={{ width: 140 }}
                                                value={settings.payroll_formulas?.pt_slab2_limit ?? 15000}
                                                onChange={e => handleChange(e, 'payroll_formulas')} />
                                        </td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                            <input type="number" name="pt_slab2_amount" className="form-input" style={{ width: 120 }}
                                                value={settings.payroll_formulas?.pt_slab2_amount ?? 150}
                                                onChange={e => handleChange(e, 'payroll_formulas')} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Above Slab 2</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Any amount</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <input type="number" name="pt_above_amount" className="form-input" style={{ width: 120 }}
                                                value={settings.payroll_formulas?.pt_above_amount ?? 200}
                                                onChange={e => handleChange(e, 'payroll_formulas')} />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.07)', fontSize: '0.75rem', color: '#f59e0b', fontFamily: 'monospace' }}>
                            PT = Gross ≤ ₹{(settings.payroll_formulas?.pt_slab1_limit ?? 10000).toLocaleString('en-IN')} → ₹{settings.payroll_formulas?.pt_slab1_amount ?? 0} | ≤ ₹{(settings.payroll_formulas?.pt_slab2_limit ?? 15000).toLocaleString('en-IN')} → ₹{settings.payroll_formulas?.pt_slab2_amount ?? 150} | Above → ₹{settings.payroll_formulas?.pt_above_amount ?? 200}
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FiSave /> Save Payroll Formulas
                        </button>
                    </div>
                </form>
            )}


            {activeTab === 'integrations' && (
                <div style={{ backgroundColor: 'var(--bg-lite)' }}>
                    <ZoomSettings />
                </div>
            )}

            {activeTab === 'holidays' && isSuperAdmin(user) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className="card">
                        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiCalendar /> Mark as Holiday
                        </h3>
                        <form onSubmit={handleCreateHoliday} style={{ maxWidth: 500 }}>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Holiday Date (IST)</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={holidayForm.date}
                                    onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Holiday Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. Republic Day, Diwali"
                                    value={holidayForm.name}
                                    onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={submittingHoliday}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FiPlus /> {submittingHoliday ? 'Marking...' : 'Mark as Holiday'}
                            </button>
                        </form>
                    </div>

                    <div className="card">
                        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiCalendar /> Declared Holidays
                        </h3>
                        {loadingHolidays ? (
                            <p style={{ color: 'var(--text-muted)' }}>Loading holidays...</p>
                        ) : holidays.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No holidays declared yet.</p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Holiday Name</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holidays.map(h => (
                                        <tr key={h._id || h.date}>
                                            <td style={{ fontWeight: 600 }}>{h.date}</td>
                                            <td>{h.name}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDeleteHoliday(h._id)}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    <FiTrash2 /> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'security' && isSuperAdmin(user) && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title"><FiShield /> Security Settings</h3>
                        <p className="card-subtitle">Manage system-wide authentication security and pilot rollout</p>
                    </div>

                    {msg.text && (
                        <div className={`alert alert-${msg.type}`} style={{ margin: '16px 20px 0' }}>
                            {msg.text}
                        </div>
                    )}

                    <form onSubmit={handleSave}>
                        <div className="card-body">
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px', marginBottom: '24px' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Require Email Verification</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Require employees to verify their email address before accessing features.</div>
                                </div>
                                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(settings.require_email_verification)}
                                        onChange={e => setSettings(prev => ({ ...prev, require_email_verification: e.target.checked }))}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: settings.require_email_verification ? 'var(--accent-primary, #6366f1)' : '#cbd5e1',
                                        borderRadius: 24, transition: '.3s'
                                    }}>
                                        <span style={{
                                            position: 'absolute', height: 18, width: 18, left: settings.require_email_verification ? 23 : 3, bottom: 3,
                                            backgroundColor: '#fff', borderRadius: '50%', transition: '.3s'
                                        }} />
                                    </span>
                                </label>
                            </div>

                            <div className="form-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Security Pilot Employees</label>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary, #6366f1)' }}>
                                        {selectedPilotIds.length} selected
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                    Pilot users get 2FA/verification even when global toggles are off.
                                </p>

                                {selectedPilotIds.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                        {selectedPilotIds.map(empId => {
                                            const emp = allEmployees.find(e => e.id === empId);
                                            const label = emp ? `${emp.name} (${emp.id})` : empId;
                                            return (
                                                <span
                                                    key={empId}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '4px 10px',
                                                        backgroundColor: '#eef2ff',
                                                        border: '1px solid #c7d2fe',
                                                        color: '#3730a3',
                                                        borderRadius: 16,
                                                        fontSize: '0.82rem',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    <span>{label}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removePilotEmployee(empId)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            color: '#4f46e5'
                                                        }}
                                                        title={`Remove ${label}`}
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Search by name or id..."
                                        value={pilotSearch}
                                        onChange={e => setPilotSearch(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <select
                                        className="form-input"
                                        value={pilotDepartment}
                                        onChange={e => setPilotDepartment(e.target.value)}
                                        style={{ width: '200px' }}
                                    >
                                        <option value="">All Departments</option>
                                        {distinctDepartments.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>

                                <div
                                    style={{
                                        maxHeight: 240,
                                        overflowY: 'auto',
                                        border: '1px solid var(--border-color, #e2e8f0)',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        backgroundColor: 'var(--bg-secondary, #f8fafc)'
                                    }}
                                >
                                    {loadingEmployees ? (
                                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            Loading employees...
                                        </div>
                                    ) : filteredEmployees.length === 0 ? (
                                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No employees found.
                                        </div>
                                    ) : (
                                        filteredEmployees.map(emp => {
                                            const checked = selectedPilotIds.includes(emp.id);
                                            return (
                                                <label
                                                    key={emp.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '6px 4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.88rem',
                                                        borderBottom: '1px solid var(--border-color, #f1f5f9)'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => togglePilotEmployee(emp.id)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <span>
                                                        {emp.name} ({emp.id}) - {emp.department_name || 'No Department'}
                                                    </span>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px' }}>
                            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FiSave /> {saving ? 'Saving...' : 'Save Security Settings'}
                            </button>
                        </div>
                    </form>
                </div>
            )}








            {showShiftModal && (
                <div className="modal-overlay">

                    <div className="modal-content" style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingShift ? 'Edit Shift' : 'Add New Shift'}</h3>
                            <button className="btn-close" onClick={() => setShowShiftModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleShiftSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Shift Name</label>
                                    <input type="text" className="form-input" value={shiftForm.name} onChange={e => setShiftForm({ ...shiftForm, name: e.target.value })} placeholder="e.g. Morning Shift" required />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Start Time</label>
                                        <input type="time" className="form-input" value={shiftForm.start_time} onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">End Time</label>
                                        <input type="time" className="form-input" value={shiftForm.end_time} onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Grace Period (Minutes)</label>
                                        <input type="number" className="form-input" value={shiftForm.grace_period} onChange={e => setShiftForm({ ...shiftForm, grace_period: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Allowed Clock-ins</label>
                                        <input type="number" className="form-input" value={shiftForm.allowed_clock_ins} onChange={e => setShiftForm({ ...shiftForm, allowed_clock_ins: Number(e.target.value) })} min="1" />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Full Day Min (Hours)</label>
                                        <input type="number" className="form-input" value={shiftForm.full_day_min_hours} onChange={e => setShiftForm({ ...shiftForm, full_day_min_hours: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Half Day Min (Hours)</label>
                                        <input type="number" className="form-input" value={shiftForm.half_day_min_hours} onChange={e => setShiftForm({ ...shiftForm, half_day_min_hours: Number(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn" onClick={() => setShowShiftModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Shift'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

