import { useState, useEffect } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { FiCheckCircle, FiXCircle, FiSun, FiCreditCard } from 'react-icons/fi';

const StatCard = ({ icon, label, value, color, sub }) => (
    <div className="stat-card">
        <div className="stat-icon" style={{ background: color + '15', color: color }}>
            {icon}
        </div>
        <div className="stat-info">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color: 'var(--text-primary)' }}>{value}</div>
            {sub && <div className="stat-change" style={{ color: color }}>{sub}</div>}
        </div>
    </div>
);

export default function WorkspaceOverview() {
    const { user } = useAuth();
    const [leave, setLeave] = useState(null);
    const [attendance, setAttendance] = useState(null);
    const [payroll, setPayroll] = useState(null);

    useEffect(() => {
        if (!user?.id) return;
        const empId = user.id;
        const today = new Date();
        const m = today.getMonth() + 1;
        const y = today.getFullYear();

        const prevMonthDate = new Date();
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const pm = prevMonthDate.getMonth() + 1;
        const py = prevMonthDate.getFullYear();

        API.get(`/leaves/${empId}`).then(r => setLeave(r.data)).catch(() => { });
        API.get(`/attendance/${empId}?month=${m}&year=${y}`).then(r => setAttendance(r.data)).catch(() => { });

        API.get(`/payroll/${empId}?month=${pm}&year=${py}`).then(r => {
            if (r.data.payroll) {
                setPayroll({ ...r.data, isPrevious: true });
            } else {
                API.get(`/payroll/${empId}`).then(res => {
                    const allP = Array.isArray(res.data.payroll) ? res.data.payroll : [res.data.payroll].filter(Boolean);
                    if (allP.length > 0) {
                        setPayroll({ payroll: allP[0], isFallback: true });
                    }
                });
            }
        }).catch(() => { });
    }, [user]);

    const bal = leave?.balance;
    const att = attendance?.summary;

    return (
        <div className="grid-4" style={{ marginBottom: 24 }}>
            <StatCard 
                icon={<FiCheckCircle />} 
                label="PRESENT THIS MONTH" 
                value={att?.present ?? '0'} 
                color="#10b981" 
                sub={`Total of ${att?.totalWorkingDays ?? '--'} days`} 
            />
            <StatCard 
                icon={<FiXCircle />} 
                label="ABSENT THIS MONTH" 
                value={att?.absent ?? '0'} 
                color="#ef4444" 
                sub="Leaves / Unpaid days" 
            />
            <StatCard 
                icon={<FiSun />} 
                label="CASUAL LEAVE LEFT" 
                value={bal?.casual_leave ?? '—'} 
                color="#6366f1" 
                sub="Available balance" 
            />
            <StatCard
                icon={<FiCreditCard />}
                label="PREVIOUS MONTH SALARY"
                value={payroll?.payroll ? `₹${parseInt(payroll.payroll.actual_payable || payroll.payroll.net_salary).toLocaleString('en-IN')}` : '—'}
                color="#f59e0b"
                sub={payroll?.isPrevious ? `Verified for ${new Date(0, payroll.payroll.month - 1).toLocaleString('default', { month: 'long' })}` : "Latest available record"}
            />
        </div>
    );
}
