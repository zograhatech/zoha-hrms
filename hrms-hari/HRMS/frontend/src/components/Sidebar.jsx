import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import {
    FiGrid, FiUser, FiCalendar, FiBriefcase, FiCreditCard,
    FiMessageSquare, FiUsers, FiCheckCircle, FiTrendingUp,
    FiSettings, FiLogOut, FiActivity, FiHelpCircle, FiX, FiClock, FiShield,
    FiFileText, FiPieChart, FiShoppingCart, FiSmile, FiVideo, FiPackage, FiShoppingBag, FiTruck, FiPercent, FiHome, FiBarChart2, FiStar, FiDatabase, FiUserPlus, FiBookOpen, FiTarget
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa6';
import { useToast } from '../context/ToastContext';


const NAV_CONFIG = [
    {
        section: 'WORKPLACE',
        items: [
            { to: '/dashboard', label: 'Dashboard', icon: <FiGrid />, end: true, permission: 'dashboard' },
            { to: '/dashboard/profile', label: 'My Profile', icon: <FiUser />, permission: 'profile' },
            { to: '/dashboard/attendance', label: 'Attendance', icon: <FiCalendar />, permission: 'attendance_user' },
            { to: '/dashboard/leave', label: 'Leave', icon: <FiBriefcase />, permission: 'leave_apply' },
            { to: '/dashboard/payroll', label: 'Payroll', icon: <FiCreditCard />, permission: 'payroll_user' },
            { to: '/dashboard/tickets', label: 'Support Tickets', icon: <FiHelpCircle />, permission: 'tickets_user' },
            { to: '/dashboard/messages', label: 'Live Chat', icon: <FiMessageSquare />, permission: 'live_chat' },
            { to: '/dashboard/zoom', label: 'Zoom Meetings', icon: <FiVideo />, permission: ['zoom', 'zoom_create'] },
            { to: '/dashboard/events', label: 'Events', icon: <FiCalendar />, permission: 'events' },
            { to: '/dashboard/learning', label: 'My Learning', icon: <FiBookOpen />, permission: 'learning' },
        ]
    },
    {
        section: 'INSIGHTS',
        items: [
            { to: '/dashboard/analytics', label: 'Analytics', icon: <FiTrendingUp />, permission: 'analytics' },
            { to: '/dashboard/departments', label: 'Departments', icon: <FiActivity />, permission: 'manage_departments' },
        ]
    },
    {
        section: 'HR MANAGEMENT',
        items: [
            { to: '/dashboard/employees', label: 'Employees', icon: <FiUsers />, permission: 'manage_employees' },
            { to: '/dashboard/recruitment', label: 'Recruitment', icon: <FiUserPlus />, permission: 'recruitment' },
            { to: '/dashboard/performance', label: 'Performance', icon: <FiTarget />, permission: 'performance' },
            { to: '/dashboard/attendance-report', label: 'Attendance Report', icon: <FiCalendar />, permission: 'manage_attendance' },
            { to: '/dashboard/shift-roster', label: 'Shift Roster', icon: <FiClock />, permission: 'manage_shifts' },
            { to: '/dashboard/payroll-admin', label: 'Payroll Management', icon: <FiCreditCard />, permission: 'payroll' },
            { to: '/dashboard/assets', label: 'Assets', icon: <FiDatabase />, permission: 'assets' },
            {to: '/dashboard/exit-management', label: 'Exit Management', icon: <FiLogOut />, permission: ['exit', 'exit_user', 'exit_approve'] },
            { to: '/dashboard/tickets-all', label: 'All Tickets', icon: <FiMessageSquare />, permission: 'all_tickets' },
            { to: '/dashboard/fun-summary', label: 'Fun Summary', icon: <FiSmile />, permission: 'fun_summary' },
            { to: '/dashboard/lms', label: 'LMS Management', icon: <FiBookOpen />, permission: 'lms' },
        ]
    },
    {
        section: 'TALLY',
        items: [
            { to: '/dashboard/tally/accounting', label: 'Accounting', icon: <FiFileText />, permission: 'tally_accounting' },
            { to: '/dashboard/tally/inventory', label: 'Inventory', icon: <FiPackage />, permission: 'tally_inventory' },
            { to: '/dashboard/tally/sales', label: 'Sales', icon: <FiShoppingCart />, permission: 'tally_sales' },
            { to: '/dashboard/tally/purchases', label: 'Purchases', icon: <FiShoppingBag />, permission: 'tally_purchases' },
            { to: '/dashboard/tally/tax', label: 'GST & Taxation', icon: <FiPercent />, permission: 'tally_tax' },
            { to: '/dashboard/tally/banking', icon: <FiCreditCard />, label: 'Banking', permission: 'tally_banking' },
        ]
    },
    {
        section: 'ADMINISTRATION',
        items: [
            { to: '/dashboard/settings', label: 'Settings', icon: <FiSettings />, permission: ['manage_settings', 'zoom_settings'] },
        ]
    }
];

export default function Sidebar({ open, onClose }) {
    const { showToast } = useToast();
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const [logoError, setLogoError] = useState(false);
    const [imgError, setImgError] = useState(false);

    // Reset error states when image/logo props change during render
    const [prevImg, setPrevImg] = useState(user?.profile_image);
    const [prevLogo, setPrevLogo] = useState(branding.company_logo);
    if (user?.profile_image !== prevImg || branding.company_logo !== prevLogo) {
        setPrevImg(user?.profile_image);
        setPrevLogo(branding.company_logo);
        if (imgError) setImgError(false);
        if (logoError) setLogoError(false);
    }

    const navigate = useNavigate();
    const role = user?.role || 'employee';
    const permissions = user?.permissions || [];

    const isRowVisible = (item) => {
        // Handle Inactive status (Exit flow)
        if (user?.status === 'inactive') {
            const allowedForExit = ['/dashboard'];
            return allowedForExit.includes(item.to);
        }

        // 1. HR Manager / Admin has full system access automatically
        const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
        const isManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleLower);
        if (isManager) return true;

        // 2. Individual Module Access Check — ONLY items given by HR Manager are visible
        if (item.permission) {
            const requiredPerms = Array.isArray(item.permission) ? item.permission : [item.permission];
            const hasAccess = requiredPerms.some(p => {
                if (permissions.includes(p)) return true;
                
                // Map navigation link permissions to individual access keys
                if (p === 'manage_employees') return permissions.includes('employees');
                if (p === 'payroll') return permissions.includes('payroll_admin');
                if (p === 'manage_attendance') return permissions.includes('attendance_report');
                if (p === 'all_tickets') return permissions.includes('tickets_all');
                if (p === 'manage_shifts') return permissions.includes('shifts');
                if (p === 'fun_summary') return permissions.includes('fun');
                
                return false;
            });
            return hasAccess;
        }

        // Default: Items with no permission requirements are visible to everyone
        return true; 
    };

    const sections = NAV_CONFIG.map(s => ({
        ...s,
        items: s.items.filter(isRowVisible)
    })).filter(s => s.items.length > 0);



    const handleLogout = () => {
        logout();
        showToast('Logged out successfully', 'info');
        navigate('/login');
    };

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const profileImg = user?.profile_image;

    return (
        <aside className={`sidebar${open ? ' open' : ''}`}>
            {/* Logo + close button for mobile */}
            <div className="sidebar-logo" style={{ position: 'relative' }}>
                {(branding.company_logo && !logoError) ? (
                    <div className="logo-icon" style={{ background: 'none' }}>
                        <img src={branding.company_logo} alt="Logo" onError={() => setLogoError(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                ) : (
                    <div className="logo-icon"><FiBriefcase /></div>
                )}
                <div>
                    <div className="logo-text">{branding.company_name}</div>
                    <div className="logo-sub">{branding.company_subtext}</div>
                </div>
                {/* X close button — only visible on tablet/mobile via CSS */}
                <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">
                    <FiX />
                </button>
            </div>

            {/* User info */}
            <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0,
                        overflow: 'hidden', border: '1px solid var(--border-color)'
                    }}>
                        {(profileImg && !imgError) ? (
                            <img
                                src={(profileImg.startsWith('http') || profileImg.startsWith('data:')) ? profileImg : `${baseUrl}${profileImg}`}
                                alt={user.name}
                                onError={() => setImgError(true)}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            user?.name?.[0] || '?'
                        )}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {user?.name || 'User'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {user?.id} · {role}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {sections.map(section => (
                    <div key={section.section}>
                        <div className="nav-section-label">{section.section}</div>
                        {section.items.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            {/* Logout */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={handleLogout} className="nav-link" style={{ color: 'var(--accent-red)', width: '100%' }}>
                    <span className="nav-icon"><FiLogOut /></span>
                    Logout
                </button>
            </div>
        </aside>
    );
}
