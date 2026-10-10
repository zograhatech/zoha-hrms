import React, { useState, useEffect, useRef } from 'react';

/**
 * Custom DateInput component with a calendar picker popup.
 * - Displays date in DD/MM/YYYY format
 * - Limits year to 4 digits
 * - Opens a custom calendar dropdown on calendar icon click
 * - Bridges UI format (DD/MM/YYYY) <-> Backend format (YYYY-MM-DD)
 */

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DateInput = ({ value, onChange, className, style, required, label }) => {
    // Convert YYYY-MM-DD to DD/MM/YYYY for display
    const toDisplay = (val) => {
        if (!val) return '';
        if (val.includes('/')) return val;
        const parts = val.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return val;
    };

    // Convert YYYY-MM-DD to a Date object
    const toDate = (val) => {
        if (!val) return null;
        if (val.includes('/')) {
            const p = val.split('/');
            if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
            return null;
        }
        const d = new Date(val);
        return isNaN(d) ? null : d;
    };

    const today = new Date();
    const selectedDate = toDate(value);

    const [displayValue, setDisplayValue] = useState(toDisplay(value));
    const [showPicker, setShowPicker] = useState(false);
    const [calYear, setCalYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear());
    const [calMonth, setCalMonth] = useState(selectedDate ? selectedDate.getMonth() : today.getMonth());

    const wrapperRef = useRef(null);

    // Sync internal state with external value prop during render
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setDisplayValue(toDisplay(value));
        const d = toDate(value);
        if (d) {
            setCalYear(d.getFullYear());
            setCalMonth(d.getMonth());
        }
    }

    // Close picker when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const notify = (isoDate) => onChange({ target: { value: isoDate } });

    // --- Text input handler ---
    const handleTextChange = (e) => {
        let input = e.target.value.replace(/[^\d/]/g, '');
        // Auto-insert slashes
        if (input.length === 2 && !input.includes('/')) input += '/';
        else if (input.length === 5 && input.split('/').length === 2) input += '/';
        if (input.length > 10) input = input.substring(0, 10);
        setDisplayValue(input);

        if (input.length === 10) {
            const p = input.split('/');
            if (p.length === 3) notify(`${p[2]}-${p[1]}-${p[0]}`);
        } else if (input.length === 0) {
            notify('');
        }
    };

    // --- Calendar navigation ---
    const prevMonth = () => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); };
    const nextMonth = () => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); };

    // --- Get calendar days ---
    const getDays = () => {
        const firstDay = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return cells;
    };

    const selectDay = (day) => {
        if (!day) return;
        const mm = String(calMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const iso = `${calYear}-${mm}-${dd}`;
        setDisplayValue(`${dd}/${mm}/${calYear}`);
        notify(iso);
        setShowPicker(false);
    };

    const isSelected = (day) => {
        if (!selectedDate || !day) return false;
        return selectedDate.getFullYear() === calYear && selectedDate.getMonth() === calMonth && selectedDate.getDate() === day;
    };

    const isToday = (day) => {
        if (!day) return false;
        return today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
    };

    const days = getDays();

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            {label && <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>{label}</label>}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                    type="text"
                    className={className || 'form-input'}
                    style={{ ...style, paddingRight: 40 }}
                    placeholder="DD/MM/YYYY"
                    value={displayValue}
                    onChange={handleTextChange}
                    required={required}
                    maxLength={10}
                />
                <button
                    type="button"
                    onClick={() => setShowPicker(v => !v)}
                    style={{
                        position: 'absolute', right: 12, top: 0, height: '100%',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                    }}
                    tabIndex={-1}
                >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
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
                    minWidth: 280,
                    userSelect: 'none',
                }}>
                    {/* Header: month & year navigation */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <button type="button" onClick={prevMonth} style={navBtnStyle}>&#8249;</button>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select
                                value={calMonth}
                                onChange={e => setCalMonth(+e.target.value)}
                                style={selectStyle}
                            >
                                {MONTHS_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
                            </select>
                            <input
                                type="number"
                                min="1900"
                                max="2100"
                                value={calYear}
                                onChange={e => {
                                    const y = e.target.value;
                                    if (y.length <= 4) setCalYear(+y);
                                }}
                                style={{ ...selectStyle, width: 64, textAlign: 'center' }}
                            />
                        </div>
                        <button type="button" onClick={nextMonth} style={navBtnStyle}>&#8250;</button>
                    </div>

                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                        {DAYS.map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0' }}>
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day cells */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                        {days.map((day, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectDay(day)}
                                disabled={!day}
                                style={{
                                    border: 'none',
                                    borderRadius: 8,
                                    width: '100%',
                                    aspectRatio: '1',
                                    fontSize: '0.82rem',
                                    fontWeight: isSelected(day) ? 800 : isToday(day) ? 700 : 400,
                                    cursor: day ? 'pointer' : 'default',
                                    background: isSelected(day)
                                        ? 'var(--accent-primary)'
                                        : isToday(day)
                                            ? 'rgba(99,102,241,0.15)'
                                            : 'transparent',
                                    color: isSelected(day)
                                        ? '#fff'
                                        : isToday(day)
                                            ? 'var(--accent-light)'
                                            : day ? 'var(--text-primary)' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (day && !isSelected(day)) e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                                onMouseLeave={e => { if (day && !isSelected(day)) e.currentTarget.style.background = 'transparent'; }}
                            >
                                {day || ''}
                            </button>
                        ))}
                    </div>

                    {/* Today shortcut */}
                    <div style={{ marginTop: 12, textAlign: 'center' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setCalYear(today.getFullYear());
                                setCalMonth(today.getMonth());
                                selectDay(today.getDate());
                            }}
                            style={{
                                background: 'none', border: '1px solid var(--border-color)',
                                borderRadius: 6, padding: '4px 16px',
                                fontSize: '0.75rem', color: 'var(--accent-light)',
                                cursor: 'pointer', fontWeight: 600,
                            }}
                        >
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const navBtnStyle = {
    background: 'none',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    width: 28, height: 28,
    cursor: 'pointer',
    fontSize: '1.1rem',
    color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1,
};

const selectStyle = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: '0.8rem',
    padding: '3px 6px',
    cursor: 'pointer',
};

export default DateInput;
