import { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { isManagerRole } from '../utils/roleHelper';
import { FiFileText } from 'react-icons/fi';
import ModuleGuard from '../components/ModuleGuard';

const safeLazy = (importFunc) => lazy(() => 
    importFunc().catch((error) => {
        const lastRetry = sessionStorage.getItem('lazy-retry-time');
        const now = Date.now();
        if (!lastRetry || (now - parseInt(lastRetry)) > 10000) {
            sessionStorage.setItem('lazy-retry-time', now.toString());
            window.location.reload();
        }
        return Promise.reject(error);
    })
);

// Lazy loaded floating widgets
const FloatingChatButton = safeLazy(() => import('../components/FloatingChatButton'));
const ChatWidget = safeLazy(() => import('../components/ChatWidget'));
const FunChatbot = safeLazy(() => import('../components/FunChatbot'));
const AnnouncementBanner = safeLazy(() => import('../components/AnnouncementBanner'));

const AdminRoute = ({ children }) => {
    const { user } = useAuth();
    const isAdmin = (user?.role || '').toLowerCase().replace(/\s+/g, '') === 'admin';
    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

// Pages - Lazy loaded
const EmployeeDashboard = safeLazy(() => import('./employee/EmployeeDashboard'));
const Profile = safeLazy(() => import('./employee/Profile'));
const Attendance = safeLazy(() => import('./employee/Attendance'));
const Leave = safeLazy(() => import('./employee/Leave'));
const Payroll = safeLazy(() => import('./employee/Payroll'));
const Tickets = safeLazy(() => import('./employee/Tickets'));
const EmployeeList = safeLazy(() => import('./hr/EmployeeList'));
const OnboardingManagement = safeLazy(() => import('./hr/OnboardingManagement'));
const RecruitmentManagement = safeLazy(() => import('./hr/RecruitmentManagement'));
const PerformanceManagement = safeLazy(() => import('./hr/PerformanceManagement'));
const AssetManagement = safeLazy(() => import('./admin/AssetManagement'));
const LeaveApprovals = safeLazy(() => import('./hr/LeaveApprovals'));
const AttendanceReport = safeLazy(() => import('./hr/AttendanceReport'));
const AllTickets = safeLazy(() => import('./hr/AllTickets'));
const FunSummary = safeLazy(() => import('./hr/FunSummary'));
const ExitManagement = safeLazy(() => import('./hr/ExitManagement'));
const EmployeeExitManagement = safeLazy(() => import('./employee/ExitManagement'));
const PayrollAdmin = safeLazy(() => import('./admin/PayrollAdmin'));
const Analytics = safeLazy(() => import('./admin/Analytics'));
const Departments = safeLazy(() => import('./admin/Departments'));
const Settings = safeLazy(() => import('./admin/Settings'));

const ShiftRoster = safeLazy(() => import('./admin/ShiftRoster'));
const RotationShift = safeLazy(() => import('./admin/RotationShift'));
const Events = safeLazy(() => import('./admin/Events'));
const Messages = safeLazy(() => import('./Messages'));
const ZoomDashboard = safeLazy(() => import('./zoom/ZoomDashboard'));
const ZoomSettings = safeLazy(() => import('./zoom/ZoomSettings'));
const LMSAdmin = safeLazy(() => import('./admin/LMSAdmin'));
const MyLearning = safeLazy(() => import('./employee/MyLearning'));
const CoursePlayer = safeLazy(() => import('./employee/CoursePlayer'));
const AccountingManagement = safeLazy(() => import('./admin/AccountingManagement'));
const InventoryManagement = safeLazy(() => import('./admin/InventoryManagement'));
const SalesManagement = safeLazy(() => import('./admin/SalesManagement'));
const PurchaseManagement = safeLazy(() => import('./admin/PurchaseManagement'));
const TaxationManagement = safeLazy(() => import('./admin/TaxationManagement'));
const BankingManagement = safeLazy(() => import('./admin/BankingManagement'));
const InactiveDashboard = safeLazy(() => import('./employee/InactiveDashboard'));


// Skeleton Loader for Page Transitions
const SubLoader = () => (
    <div style={{ padding: '24px', width: '100%', animation: 'fadeIn 0.2s ease-out' }}>
        <div style={{ height: 26, width: '220px', background: 'var(--border-color)', borderRadius: 8, marginBottom: 20, opacity: 0.6 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 96, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ height: 12, width: '40%', background: 'var(--border-color)', borderRadius: 4, opacity: 0.5 }} />
                    <div style={{ height: 22, width: '60%', background: 'var(--border-color)', borderRadius: 6, opacity: 0.7 }} />
                </div>
            ))}
        </div>
        <div style={{ height: 260, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20 }}>
            <div style={{ height: 16, width: '180px', background: 'var(--border-color)', borderRadius: 4, marginBottom: 16, opacity: 0.5 }} />
            <div style={{ height: 180, background: 'var(--bg-primary)', borderRadius: 10, opacity: 0.3 }} />
        </div>
    </div>
);

export default function Dashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user, refreshUser } = useAuth();

    const role = user?.role || 'employee';

    // Auto-refresh user data on mount to catch permission updates
    useEffect(() => {
        refreshUser();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="app-layout">
            {/* Backdrop for mobile/tablet sidebar */}
            <div
                className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <Navbar onToggleSidebar={() => setSidebarOpen(v => !v)} />
            <main className="main-content">
                <Suspense fallback={null}>
                    <AnnouncementBanner />
                </Suspense>
                <Suspense fallback={<SubLoader />}>
                    <Routes>
                        <Route index element={user?.status === 'inactive' ? <InactiveDashboard /> : <EmployeeDashboard />} />
                        <Route path="profile" element={<ModuleGuard module="profile"><Profile /></ModuleGuard>} />
                        <Route path="attendance" element={<ModuleGuard module="attendance"><Attendance /></ModuleGuard>} />
                        <Route path="leave" element={<ModuleGuard module="leave"><Leave /></ModuleGuard>} />
                        <Route path="payroll" element={<AdminRoute><Payroll /></AdminRoute>} />
                        <Route path="tickets" element={<ModuleGuard module="tickets"><Tickets /></ModuleGuard>} />
                        <Route path="messages" element={<Messages />} />
                        
                        {/* HR */}
                        <Route path="employees" element={<ModuleGuard module="employees"><EmployeeList /></ModuleGuard>} />
                        <Route path="onboarding" element={<ModuleGuard module="employees"><OnboardingManagement /></ModuleGuard>} />
                        <Route path="recruitment" element={<ModuleGuard module="recruitment"><RecruitmentManagement /></ModuleGuard>} />
                        <Route path="performance" element={<ModuleGuard module="performance"><PerformanceManagement /></ModuleGuard>} />
                        <Route path="assets" element={<ModuleGuard module="assets"><AssetManagement /></ModuleGuard>} />
                        <Route path="leave-approvals" element={<ModuleGuard module="leave"><LeaveApprovals /></ModuleGuard>} />
                        <Route path="attendance-report" element={<ModuleGuard module="attendance_report"><AttendanceReport /></ModuleGuard>} />
                        <Route path="tickets-all" element={<ModuleGuard module="tickets_all"><AllTickets /></ModuleGuard>} />
                        <Route path="fun-summary" element={<ModuleGuard module="fun"><FunSummary /></ModuleGuard>} />
                        <Route path="exit-management" element={
                            <ModuleGuard module={['exit', 'exit_user']}>
                                {(isManagerRole(user) || user?.role === 'hr' || user?.permissions?.includes('exit'))
                                    ? <ExitManagement /> 
                                    : <EmployeeExitManagement />}
                            </ModuleGuard>
                        } />
                        
                        {/* Admin / Premium Modules */}
                        <Route path="payroll-admin" element={<AdminRoute><PayrollAdmin /></AdminRoute>} />
                        <Route path="analytics" element={<Analytics />} />
                        <Route path="departments" element={<Departments />} />
                        <Route path="settings" element={<ModuleGuard module={['manage_settings', 'zoom_settings']}><Settings /></ModuleGuard>} />

                        <Route path="shift-roster" element={<ModuleGuard module="shifts"><ShiftRoster /></ModuleGuard>} />
                        <Route path="rotation-shift" element={<ModuleGuard module="shifts"><RotationShift /></ModuleGuard>} />
                        <Route path="events" element={<ModuleGuard module="events"><Events /></ModuleGuard>} />
                        


                        {/* Zoom Integration */}
                        <Route path="zoom" element={<ModuleGuard module="zoom"><ZoomDashboard /></ModuleGuard>} />
                        <Route path="zoom-settings" element={<ModuleGuard module="zoom"><ZoomSettings /></ModuleGuard>} />

                        {/* LMS Module */}
                        <Route path="lms" element={<ModuleGuard module="lms"><LMSAdmin /></ModuleGuard>} />
                        <Route path="learning" element={<ModuleGuard module="learning"><MyLearning /></ModuleGuard>} />
                        <Route path="course/:id" element={<ModuleGuard module="learning"><CoursePlayer /></ModuleGuard>} />

                        {/* Tally Module */}
                        <Route path="tally/accounting" element={<ModuleGuard module="tally_accounting"><AccountingManagement /></ModuleGuard>} />
                        <Route path="tally/inventory" element={<ModuleGuard module="tally_inventory"><InventoryManagement /></ModuleGuard>} />
                        <Route path="tally/sales" element={<ModuleGuard module="tally_sales"><SalesManagement /></ModuleGuard>} />
                        <Route path="tally/purchases" element={<ModuleGuard module="tally_purchases"><PurchaseManagement /></ModuleGuard>} />
                        <Route path="tally/tax" element={<ModuleGuard module="tally_tax"><TaxationManagement /></ModuleGuard>} />
                        <Route path="tally/banking" element={<ModuleGuard module="tally_banking"><BankingManagement /></ModuleGuard>} />
                    </Routes>
                </Suspense>

            </main>
            <Suspense fallback={null}>
                {(isManagerRole(role) || user?.permissions?.includes('fun')) && <FunChatbot />}
                <FloatingChatButton />
                <ChatWidget />
            </Suspense>
        </div>
    );
}
