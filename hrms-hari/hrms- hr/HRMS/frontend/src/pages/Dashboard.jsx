import { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import FunChatbot from '../components/FunChatbot';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { useAuth } from '../context/AuthContext';
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


const SubLoader = () => (
    <div className="flex-center" style={{ minHeight: '60vh' }}>
        <div className="loading-spinner" />
    </div>
);

export default function Dashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user, refreshUser } = useAuth();
    const location = useLocation();

    const role = user?.role || 'employee';

    // Auto-refresh user data on mount to catch permission updates
    useEffect(() => {
        refreshUser();
    }, []);

    // Show DashboardHome if on /dashboard exactly
    const DashboardHome = () => {
        if (user?.status === 'inactive') return <InactiveDashboard />;
        return <EmployeeDashboard />;
    };


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
                <AnnouncementBanner />
                <Suspense fallback={<SubLoader />}>
                    <Routes>
                        <Route index element={<DashboardHome />} />
                        <Route path="profile" element={<ModuleGuard module="profile"><Profile /></ModuleGuard>} />
                        <Route path="attendance" element={<ModuleGuard module="attendance"><Attendance /></ModuleGuard>} />
                        <Route path="leave" element={<ModuleGuard module="leave"><Leave /></ModuleGuard>} />
                        <Route path="payroll" element={<ModuleGuard module="payroll"><Payroll /></ModuleGuard>} />
                        <Route path="tickets" element={<ModuleGuard module="tickets"><Tickets /></ModuleGuard>} />
                        <Route path="messages" element={<ModuleGuard module="chat"><Messages /></ModuleGuard>} />
                        
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
                                {(user?.role === 'hr_manager' || user?.role === 'hr' || user?.permissions?.includes('exit')) 
                                    ? <ExitManagement /> 
                                    : <EmployeeExitManagement />}
                            </ModuleGuard>
                        } />
                        
                        {/* Admin / Premium Modules */}
                        <Route path="payroll-admin" element={<ModuleGuard module="payroll_admin"><PayrollAdmin /></ModuleGuard>} />
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
            {(role === 'hr_manager' || user?.permissions?.includes('fun')) && <FunChatbot />}
            <ChatWidget />
        </div>
    );
}
