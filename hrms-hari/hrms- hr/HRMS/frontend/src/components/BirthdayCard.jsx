import { FiGift, FiX } from 'react-icons/fi';
import { formatDate } from '../utils/dateFormatter';

const BirthdayCard = ({ events }) => {
    const today = new Date();
    const tMonth = today.getUTCMonth();
    const tDate = today.getUTCDate();

    // 1. Get ALL upcoming birthdays for the remainder of THIS YEAR
    const upcomingYearBirthdays = events
        .map(emp => {
            const bEvent = emp.events.find(ev => ev.type === 'birthday');
            if (!bEvent) return null;
            const bDate = new Date(bEvent.date);
            return {
                ...emp,
                bMonth: bDate.getUTCMonth(),
                bDay: bDate.getUTCDate(),
                originalDate: bEvent.date
            };
        })
        .filter(Boolean)
        .filter(emp => {
            // Is it today or in the future this year?
            if (emp.bMonth > tMonth) return true;
            if (emp.bMonth === tMonth && emp.bDay >= tDate) return true;
            return false;
        })
        .sort((a, b) => {
            if (a.bMonth !== b.bMonth) return a.bMonth - b.bMonth;
            return a.bDay - b.bDay;
        });

    if (upcomingYearBirthdays.length === 0) {
        return (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 200 }}>
                <FiGift size={40} style={{ color: 'var(--text-muted)', marginBottom: 12, opacity: 0.5 }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No more birthdays this year.</p>
            </div>
        );
    }

    // Check if any are TODAY for the festive header
    const hasBirthdayToday = upcomingYearBirthdays.some(emp => emp.bMonth === tMonth && emp.bDay === tDate);

    return (
        <div className="card" style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: hasBirthdayToday ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)' : 'var(--bg-card)',
            border: hasBirthdayToday ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--border-color)',
            maxHeight: '400px' // Keep it contained
        }}>
            <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.1rem' }}>
                <FiGift className="text-primary" />
                Upcoming Birthdays {new Date().getFullYear()}
            </h3>

            <div className="custom-scrollbar" style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
            }}>
                {upcomingYearBirthdays.map(emp => {
                    const isToday = emp.bMonth === tMonth && emp.bDay === tDate;
                    return (
                        <div key={emp.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: isToday ? 'var(--gradient-primary)' : 'rgba(0,0,0,0.03)',
                            borderRadius: 14,
                            border: isToday ? 'none' : '1px solid var(--border-color)',
                            boxShadow: isToday ? '0 4px 15px rgba(99, 102, 241, 0.3)' : 'none',
                            transition: 'all 0.2s ease',
                            color: isToday ? '#fff' : 'inherit'
                        }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: '50%',
                                background: isToday ? 'rgba(255,255,255,0.2)' : 'var(--gradient-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '0.85rem', fontWeight: 800,
                                flexShrink: 0
                            }}>
                                {emp.name.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {emp.name} {isToday && '🎂'}
                                </div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: 500 }}>
                                    {emp.designation === 'hr_manager' || emp.designation?.toLowerCase() === 'hr manger' ? 'HR Manager' : (emp.designation || 'Employee')}
                                </div>
                                <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                                    {isToday ? 'Today!' : formatDate(emp.originalDate)}
                                </div>
                            </div>
                            {!isToday && <FiGift style={{ color: 'var(--accent-primary)', opacity: 0.5, flexShrink: 0 }} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default BirthdayCard;
