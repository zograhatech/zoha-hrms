import { useState, useEffect, useRef } from 'react';

/**
 * Custom TimeInput component with a dropdown clock picker.
 * - Displays time in HH:MM AM/PM format
 * - Bridges UI format (HH:MM AM/PM) <-> 24hr string (HH:MM:SS) stored in DB
 * - Scrollable hours (1–12), minutes (00–55 step 5), and AM/PM toggle
 */

const to12 = (val24) => {
    if (!val24) return { h: '09', m: '00', period: 'AM' };
    const [hStr, mStr] = val24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.substring(0, 2) : '00';
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { h: String(h).padStart(2, '0'), m, period };
};

const to24 = (h, m, period) => {
    let hour = parseInt(h, 10);
    if (period === 'AM' && hour === 12) hour = 0;
    else if (period === 'PM' && hour !== 12) hour += 12;
    return `${String(hour).padStart(2, '0')}:${m}:00`;
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const TimeInput = ({ value, onChange, className, style, placeholder }) => {
    const parsed = to12(value);
    const [hour, setHour] = useState(parsed.h);
    const [minute, setMinute] = useState(parsed.m);
    const [period, setPeriod] = useState(parsed.period);
    const [showPicker, setShowPicker] = useState(false);
    const wrapperRef = useRef(null);
    const hourRef = useRef(null);
    const minRef = useRef(null);

    // Sync state when value prop changes during render
    // Sync internal state with external value prop during render
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        const p = to12(value);
        setHour(p.h);
        setMinute(p.m);
        setPeriod(p.period);
    }

    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const notify = (h, m, p) => {
        onChange({ target: { value: to24(h, m, p) } });
    };

    const selectHour = (h) => { setHour(h); notify(h, minute, period); };
    const selectMinute = (m) => { setMinute(m); notify(hour, m, period); };
    const togglePeriod = (p) => { setPeriod(p); notify(hour, minute, p); };

    // Scroll selected item into view
    const scrollIntoView = (ref, val, arr) => {
        if (!ref.current) return;
        const idx = arr.indexOf(val);
        const child = ref.current.children[idx];
        if (child) child.scrollIntoView({ block: 'nearest' });
    };

    const handleOpen = () => {
        setShowPicker(true);
        setTimeout(() => {
            scrollIntoView(hourRef, hour, HOURS);
            scrollIntoView(minRef, minute, MINUTES);
        }, 50);
    };

    const display = value ? `${hour}:${minute} ${period}` : '';

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                    type="text"
                    className={className || 'form-input'}
                    style={{ ...style, paddingRight: 40, cursor: 'pointer' }}
                    placeholder={placeholder || 'HH:MM AM/PM'}
                    value={display}
                    readOnly
                    onClick={handleOpen}
                />
                <button
                    type="button"
                    onClick={handleOpen}
                    style={{
                        position: 'absolute', right: 10,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                    }}
                    tabIndex={-1}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </button>
            </div>

            {showPicker && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 999,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
                    padding: 16,
                    minWidth: 220,
                    userSelect: 'none',
                }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        Select Time
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                        {/* Hours */}
                        <div style={{ flex: 1 }}>
                            <div style={colLabelStyle}>Hour</div>
                            <div ref={hourRef} style={scrollColStyle}>
                                {HOURS.map(h => (
                                    <button key={h} type="button" onClick={() => selectHour(h)}
                                        style={{ ...itemStyle, ...(h === hour ? selectedStyle : {}) }}>
                                        {h}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: '1.1rem' }}>:</div>
                        {/* Minutes */}
                        <div style={{ flex: 1 }}>
                            <div style={colLabelStyle}>Min</div>
                            <div ref={minRef} style={scrollColStyle}>
                                {MINUTES.map(m => (
                                    <button key={m} type="button" onClick={() => selectMinute(m)}
                                        style={{ ...itemStyle, ...(m === minute ? selectedStyle : {}) }}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* AM / PM */}
                        <div style={{ flex: 1 }}>
                            <div style={colLabelStyle}>Period</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {['AM', 'PM'].map(p => (
                                    <button key={p} type="button" onClick={() => togglePeriod(p)}
                                        style={{ ...itemStyle, ...(p === period ? selectedStyle : {}), height: 36 }}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                            {hour}:{minute} {period}
                        </span>
                        <button type="button" onClick={() => setShowPicker(false)}
                            style={{ ...doneStyle }}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const scrollColStyle = {
    maxHeight: 130,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    scrollbarWidth: 'thin',
};

const colLabelStyle = {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center',
    marginBottom: 4,
};

const itemStyle = {
    width: '100%',
    padding: '5px 2px',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background 0.12s',
};

const selectedStyle = {
    background: 'var(--accent-primary)',
    color: '#fff',
    fontWeight: 700,
};

const doneStyle = {
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '4px 16px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 600,
};

export default TimeInput;
