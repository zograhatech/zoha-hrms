import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

import API from '../../api/axios';
import AttendanceWidget from '../../components/AttendanceWidget';
import {
    FiUsers, FiUserPlus, FiClock, FiActivity, FiTag,
    FiGift, FiStar, FiExternalLink, FiFileText, FiHelpCircle, FiCreditCard,
    FiCpu, FiVideo, FiLogOut, FiZap, FiShield, FiBriefcase, FiUser
} from 'react-icons/fi';
import BirthdayCard from '../../components/BirthdayCard';
import MonthCalendar from '../../components/MonthCalendar';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';
import WorkspaceOverview from '../../components/WorkspaceOverview';

const StatCard = (props) => {
    const Icon = props.icon;
    return (
        <div className="stat-card">
            <div className="stat-icon" style={{ background: props.color + '22', color: props.color, fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon />
            </div>
            <div className="stat-info">
                <div className="stat-label">{props.label}</div>
                <div className="stat-value">{props.value}</div>
            </div>
        </div>
    );
};

export default function AdminDashboard() {
    const { user } = useAuth();
    const permissions = useMemo(() => user?.permissions || [], [user?.permissions]);
    const isHRM = isManagerRole(user);

    const hasAnalytics = isHRM || permissions.includes('view_analytics');
    const hasLeaves = isHRM || permissions.includes('manage_leaves');
    const hasTickets = isHRM || permissions.includes('manage_tickets');

    const [stats, setStats] = useState(null);
    const [pending, setPending] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [attendanceTrends, setAttendanceTrends] = useState([]);
    const [zoomMeetings, setZoomMeetings] = useState([]);
    const [resignations, setResignations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const calls = [];
        if (hasAnalytics) calls.push(API.get('/employees/stats'));
        else calls.push(Promise.resolve({ data: { stats: null } }));

        if (hasLeaves) calls.push(API.get('/leaves/pending'));
        else calls.push(Promise.resolve({ data: { leaves: [] } }));

        if (hasTickets) calls.push(API.get('/tickets/all?status=open'));
        else calls.push(Promise.resolve({ data: { tickets: [] } }));

        const hasPayroll = permissions.includes('manage_payroll') || user?.role === 'admin';
        const hasEvents = permissions.includes('manage_events') || user?.role === 'admin';
        const hasAttendance = permissions.includes('manage_attendance') || user?.role === 'admin';
        const hasZoom = permissions.includes('manage_zoom') || user?.role === 'admin';
        const hasExit = permissions.includes('manage_exit') || user?.role === 'admin';

        if (hasPayroll) {
            const now = new Date();
            calls.push(API.get(`/payroll/analytics?year=${now.getFullYear()}`));
        } else {
            calls.push(Promise.resolve({ data: { analytics: [] } }));
        }

        if (hasEvents) calls.push(API.get('/employees/upcoming-events'));
        else calls.push(Promise.resolve({ data: { events: [] } }));

        if (hasAttendance) calls.push(API.get('/attendance/trends'));
        else calls.push(Promise.resolve({ data: { trends: [] } }));

        if (hasZoom) calls.push(API.get('/zoom/meetings'));
        else calls.push(Promise.resolve({ data: { meetings: [] } }));

        if (hasExit) calls.push(API.get('/resignations'));
        else calls.push(Promise.resolve({ data: { resignations: [] } }));

        Promise.all(calls).then((responses) => {
            const [s, l, , , u, a, z, r] = responses;
            setStats(s.data.stats);
            setPending(l.data.leaves || []);
            setUpcomingEvents(u.data.events || []);
            setAttendanceTrends(a.data.trends || []);
            setResignations(r.data.resignations || []);
            
            if (z && z.data && z.data.success) {
                const now = new Date();
                const upcoming = (z.data.meetings || []).filter(m => new Date(m.start_time) >= now);
                setZoomMeetings(upcoming);
            }

            setLoading(false);
        }).catch(() => setLoading(false));
    }, [hasAnalytics, hasLeaves, hasTickets, user, permissions]);


    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const calendarEvents = [];
    pending.forEach(l => {
        if (l.start_date) {
            calendarEvents.push({
                date: l.start_date,
                title: `${l.employee_name} (${l.leave_type})`,
                type: 'leave',
                color: '#f59e0b'
            });
        }
    });
    upcomingEvents.forEach(e => {
        e.events.forEach(ev => {
            if (ev.date) {
                calendarEvents.push({
                    date: ev.date,
                    title: ev.type === 'birthday' ? `${e.name}'s B-Day` : `${e.name}'s ${ev.years}Yr Anniv`,
                    type: ev.type,
                    color: ev.type === 'birthday' ? '#ec4899' : '#8b5cf6'
                });
            }
        });
    });
    
    zoomMeetings.forEach(m => {
        if (m.start_time) {
            calendarEvents.push({
                date: m.start_time,
                title: `${m.topic}`,
                type: 'zoom',
                color: '#2D8CFF' // Zoom Blue
            });
        }
    });

    resignations.forEach(r => {
        if (r.status === 'approved' || r.status === 'pending') {
            calendarEvents.push({
                date: r.last_working_day,
                title: `${r.employee?.name} (Last Day)`,
                type: 'resignation',
                color: '#ef4444'
            });
        }
    });

    return (
        <div>

            <div className="page-header">
                <div>
                    <div className="page-title"><FiShield style={{ marginRight: 8, verticalAlign: 'middle' }} /> Admin Dashboard</div>
                    <div className="page-subtitle">Complete overview of the HRMS system</div>
                </div>
            </div>

            <AttendanceWidget />
            <div style={{ marginBottom: 24 }} />

            {/* Quick Modules Overview */}
            <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 20, background: 'rgba(99,102,241,0.03)', border: '1px solid rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', gap: 24, overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-light)', borderRight: '1px solid var(--border-color)', paddingRight: 24 }}>System Highlights</div>
                <div style={{ display: 'flex', gap: 20 }}>
                    {[
                        { label: 'AI Copilot', icon: <FiCpu /> },
                        { label: 'Real-time Analytics', icon: <FiActivity /> },
                        { label: 'Zoom Integration', icon: <FiVideo /> },
                        { label: 'Payroll Engine', icon: <FiCreditCard /> },
                        { label: 'Exit Workflow', icon: <FiLogOut /> },
                        { label: 'Shift Roster', icon: <FiClock /> },
                    ].map(f => (
                        <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--accent-primary)', display: 'flex' }}>{f.icon}</span> {f.label}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 24 }} />

            <WorkspaceOverview />

            <WorkspaceOverview />

            {/* Monthly Calendar */}
            <MonthCalendar events={calendarEvents} />

            {/* Employees by department and role */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiBriefcase /> Team by Department
                    </h3>
                    {(stats?.byDepartment || []).map(d => (
                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{d.name || 'Unassigned'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 80, height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(d.count / (stats?.total || 1)) * 100}%`, background: 'var(--gradient-primary)', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontWeight: 800, color: 'var(--accent-light)', minWidth: 20 }}>{d.count}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiUsers /> Team by Role
                    </h3>
                    {(stats?.byRole || []).map(r => (
                        <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', display: 'flex' }}>
                                    {isManagerRole(r.role) ? <FiShield /> : r.role === 'hr' ? <FiBriefcase /> : <FiUser />}
                                </span>
                                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{isManagerRole(r.role) ? (r.role === 'admin' ? 'Admin' : 'HR Manager') : r.role}</span>
                            </div>
                            <span className={`badge badge-${isManagerRole(r.role) ? 'purple' : r.role === 'hr' ? 'info' : 'success'}`}>{r.count} member{r.count !== 1 ? 's' : ''}</span>
                        </div>
                    ))}

                    <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FiClock /> Pending Leave Requests
                        </div>
                        {pending.length === 0
                            ? <p style={{ color: 'var(--accent-green)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FiCheckCircle /> All requests handled
                            </p>
                            : pending.slice(0, 3).map(l => (
                                <div key={l._id} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '4px 0' }}>
                                    • {l.employee_name} — {l.leave_type} ({l.total_days}d)
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {/* Attendance Trends */}
            <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FiActivity className="text-primary" /> Attendance Trends (Last 7 Days)
                </h3>
                <div style={{ height: 300, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={attendanceTrends}>
                            <defs>
                                <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                            <Tooltip
                                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}
                                itemStyle={{ color: 'var(--accent-light)', fontWeight: 600 }}
                            />
                            <Area type="monotone" dataKey="percentage" stroke="var(--accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorPresent)" name="Presence %" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid-3" style={{ marginBottom: 24 }}>
                <BirthdayCard events={upcomingEvents} />

                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiStar className="text-primary" /> Upcoming Work Anniversaries
                    </h3>
                    {(() => {
                        const today = new Date();
                        const tMonth = today.getUTCMonth();
                        const tDate = today.getUTCDate();

                        const workAnnivs = upcomingEvents
                            .map(e => {
                                const validEvents = e.events.filter(ev => {
                                    if (ev.type === 'birthday') return false;
                                    const d = new Date(ev.date);
                                    if (d.getUTCMonth() > tMonth) return true;
                                    if (d.getUTCMonth() === tMonth && d.getUTCDate() >= tDate) return true;
                                    return false;
                                });
                                return { ...e, events: validEvents };
                            })
                            .filter(e => e.events.length > 0);
                        
                        if (workAnnivs.length === 0) {
                            return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No work anniversaries this month.</p>;
                        }
                        
                        return workAnnivs.slice(0, 4).map(e => (
                            <div key={e.id} style={{ marginBottom: 12, padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{e.name}</div>
                                {e.events.map((ev, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <FiStar style={{ color: '#f59e0b' }} />
                                        {formatDate(ev.date)}
                                    </div>
                                ))}
                            </div>
                        ));
                    })()}
                </div>

            </div>
        </div>
    );
}

