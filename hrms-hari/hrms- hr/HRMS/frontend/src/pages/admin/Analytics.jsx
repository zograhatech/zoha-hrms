import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiTrendingUp, FiUsers, FiUserPlus, FiBriefcase,
    FiShield, FiCreditCard, FiAward, FiLayers, FiDollarSign, FiCalendar,
    FiClock, FiMessageSquare
} from 'react-icons/fi';

const StatCard = ({ icon, label, value, color }) => (
    <div className="stat-card">
        <div className="stat-icon" style={{ background: color + '15', color: color, fontSize: '1.5rem', width: '52px', height: '52px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
        </div>
        <div className="stat-info">
            <div className="stat-label" style={{ color: 'var(--text-secondary)', fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div className="stat-value" style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1e293b', margin: '2px 0' }}>{value}</div>
        </div>
    </div>
);

export default function Analytics() {
    const [stats, setStats] = useState(null);
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [openTickets, setOpenTickets] = useState([]);
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);

    const currentYear = new Date().getFullYear();

    const { user } = useAuth();
    const permissions = user?.permissions || [];

    useEffect(() => {
        setLoading(true);
        
        // Analytics is now Universal for all authenticated users
        const hasAnalytics = true; 
        const hasPayroll = true; 

        const calls = [];
        if (hasAnalytics) {
            // Using the unique diagnostic endpoint to ensure fresh data
            calls.push(API.get('/employees/analytics-stats'));
            calls.push(API.get('/leaves/pending'));
            calls.push(API.get('/tickets/all?status=open'));
        }

        if (hasPayroll) {
            calls.push(API.get(`/payroll/analytics?year=${currentYear}`));
        } else {
            calls.push(Promise.resolve({ data: { analytics: [] } }));
        }

        Promise.all(calls).then(([s, l, t, p]) => {
            setStats(s.data.stats || s.data); // Handle both formats
            setPendingLeaves(l.data.leaves || []);
            setOpenTickets(t.data.tickets || []);
            setPayrollData(p.data.analytics || []);
            setLoading(false);
        }).catch((err) => {
            console.error('Analytics load error:', err);
            setLoading(false);
        });
    }, [currentYear, user, permissions]);

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate total payroll YTD
    const totalPayrollYTD = payrollData.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const averageMonthlyPayroll = payrollData.length ? (totalPayrollYTD / payrollData.length) : 0;
    
    return (
        <div className="fade-in p-6" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header">
                <div>
                    <h2 className="page-title" style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiTrendingUp style={{ color: 'var(--accent-primary)' }} /> Global Analytics
                    </h2>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Comprehensive organizational metrics and numerical performance data for {currentYear}</p>
                </div>
            </div>


            <div className="grid-4" style={{ gap: '20px', marginBottom: '24px' }}>
                <StatCard icon={<FiUsers />} label="ACTIVE EMPLOYEES" value={stats?.total || 0} color="#6366f1" />
                <StatCard icon={<FiUserPlus />} label="NEW THIS MONTH" value={stats?.newJoineesThisMonth || 0} color="#10b981" />
                <StatCard icon={<FiClock />} label="PENDING LEAVES" value={pendingLeaves.length} color="#f59e0b" />
                <StatCard icon={<FiMessageSquare />} label="OPEN TICKETS" value={openTickets.length} color="#ef4444" />
            </div>


            {/* Payroll Financial Summary Table */}
            <div className="card" style={{ padding: '24px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiCreditCard style={{ color: 'var(--accent-green)' }} /> Payroll Expenditure ({currentYear})
                    </h3>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>YTD Expenditure</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-green)' }}>₹{totalPayrollYTD.toLocaleString('en-IN')}</div>
                        </div>
                        <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monthly Average</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{Math.round(averageMonthlyPayroll).toLocaleString('en-IN')}</div>
                        </div>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: '800px' }}>
                        <thead>
                            <tr>
                                <th><FiCalendar style={{ verticalAlign: 'middle', marginRight: '6px' }}/> Month</th>
                                <th>Employees Paid</th>
                                <th>Average Basic Salary</th>
                                <th>Tax Withholdings</th>
                                <th>Total Net Paid</th>
                                <th>Monthly Gross Expenditure</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payrollData.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No payroll data processed for {currentYear}.</td>
                                </tr>
                            ) : (
                                payrollData.map((data, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>{monthNames[data.month]} {currentYear}</td>
                                        <td>
                                            <span className="badge badge-info">{data.employees} Staff</span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>₹{Math.round(data.total / data.employees).toLocaleString('en-IN')} / avg</td>
                                        <td style={{ color: 'var(--accent-red)', fontWeight: 600 }}>-₹{(data.tax || Math.round(data.total * 0.08)).toLocaleString('en-IN')}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{(data.total - (data.tax || Math.round(data.total * 0.08))).toLocaleString('en-IN')}</td>
                                        <td style={{ fontWeight: 800, color: 'var(--accent-green)', fontSize: '1.05rem' }}>₹{data.total.toLocaleString('en-IN')}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
