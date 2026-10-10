import { useAuth } from '../context/AuthContext';
import { isManagerRole } from '../utils/roleHelper';
import { FiShield, FiLock, FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

/**
 * Component for Restricted Access Page
 */
export const NoPermissionAccess = ({ moduleName }) => {
    const navigate = useNavigate();

    return (
        <div className="flex-center" style={{ minHeight: '70vh', padding: 20 }}>
            <div className="card text-center" style={{ maxWidth: 500, padding: '40px 30px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)', borderRadius: 24, background: 'var(--bg-card)' }}>
                <div style={{ width: 80, height: 80, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '2.5rem' }}>
                    <FiLock />
                </div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 16, color: 'var(--text-primary)' }}>Access Restricted</h2>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
                    You do not have individual permission to access the <b>{moduleName}</b> module. 
                    <br /><br />
                    Please request access through your <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>HR Manager</span>.
                </p>
                <button 
                    onClick={() => navigate('/dashboard')}
                    className="btn btn-primary btn-lg w-full" 
                    style={{ borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                >
                    <FiArrowLeft /> Back to Dashboard
                </button>
            </div>
        </div>
    );
};

/**
 * Module Guard Component - Removes all default access expectations as requested.
 * All modules including Dashboard, Profile, etc. are now individually toggleable.
 */
export default function ModuleGuard({ children, module }) {
    const { user } = useAuth();
    
    // 1. Management Role Bypass - Keep full control for the manager role
    if (isManagerRole(user)) return children;

    // 2. Permission Check Logic
    // In this unified system, an empty permissions array on the user profile indicates 
    // fallback to role defaults. Once any item is toggled, it becomes the source of truth.
    const userPermissions = user?.permissions || [];
    
    // Basic items mapping (Dashboard, Profile, etc. must now be present in individual check)
    const modulesToCheck = Array.isArray(module) ? module : [module];
    
    const hasAccess = modulesToCheck.some(m => {
        // Direct match
        if (userPermissions.includes(m)) return true;
        
        // Alias mapping (mirroring backend auth.js mappings)
        if (m === 'attendance' && userPermissions.includes('attendance_user')) return true;
        if (m === 'leave' && userPermissions.includes('leave_apply')) return true;
        if (m === 'payroll' && userPermissions.includes('payroll_user')) return true;
        if (m === 'tickets' && userPermissions.includes('tickets_user')) return true;
        if (m === 'chat' && (userPermissions.includes('chat') || userPermissions.includes('live_chat'))) return true;
        if (m === 'employees' && userPermissions.includes('manage_employees')) return true;
        if (m === 'payroll_admin' && userPermissions.includes('payroll')) return true;
        if (m === 'attendance_report' && userPermissions.includes('manage_attendance')) return true;
        if (m === 'tickets_all' && userPermissions.includes('all_tickets')) return true;
        if (m === 'fun' && userPermissions.includes('fun_summary')) return true;
        if (m === 'shifts' && userPermissions.includes('manage_shifts')) return true;
        if (m === 'lms' && userPermissions.includes('lms')) return true;
        if (m === 'exit' && (userPermissions.includes('exit') || userPermissions.includes('exit_approve'))) return true;
        
        // If the user hasn't set any overrides, check the module name against standard dashboard components
        // (Wait, only check role-defaults if no overrides are present)
        if (userPermissions.length === 0) {
            // Role Defaults Bypass: This assumes the AuthContext correctly has permissions from either Individual or Role
            // (We handle this in backend auth, so assuming here userPermissions is already compiled)
            return true; 
        }

        return false;
    });

    if (!hasAccess) {
        const moduleName = Array.isArray(module) ? module[0] : module;
        const displayLabel = moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/_/g, ' ');
        return <NoPermissionAccess moduleName={displayLabel} />;
    }

    return children;
}
